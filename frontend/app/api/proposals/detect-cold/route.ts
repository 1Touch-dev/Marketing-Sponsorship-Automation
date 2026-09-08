import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";
import { serverEnv } from "@/lib/env";
import { getProposalEngagementStats } from "@/lib/proposals/engagement";
import { recordAudit } from "@/lib/audit/log";

export const runtime = "nodejs";
export const maxDuration = 120;

const DEFAULT_THRESHOLD_DAYS = 10;

/**
 * POST /api/proposals/detect-cold
 * Optional body: { threshold_days?: number, limit?: number }
 *
 * Phase 5 — automated "gone cold" nudge (master_report.md Section 4 P0
 * item #3). A proposal is "gone cold" when it was actually viewed by the
 * sponsor (real engagement signal, not just "we sent it N days ago") but
 * nothing has happened since: no reply, no new view, for threshold_days.
 * Reuses the existing followup-generation pipeline (same AI draft +
 * `followups` row a human reviews in /followups) — just triggered by
 * engagement silence instead of elapsed time since send.
 *
 * Intended for n8n Schedule triggers or manual operator runs, same
 * pattern as /api/email-sequences/advance and /api/gmail/sync-threads.
 */
export async function POST(req: Request) {
  const sb = supabaseAdmin();
  const env = serverEnv();
  const appUrl = env.APP_URL ?? process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";

  const body = (await req.json().catch(() => ({}))) as { threshold_days?: number; limit?: number };
  const thresholdDays = body.threshold_days ?? DEFAULT_THRESHOLD_DAYS;
  const limit = body.limit ?? 25;

  const { data: candidates, error } = await sb
    .from("proposals")
    .select("id, title, status")
    .in("status", ["sent", "approved"])
    .limit(limit);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const results: Array<Record<string, unknown>> = [];

  for (const proposal of candidates ?? []) {
    const engagement = await getProposalEngagementStats(sb, proposal.id);
    if (engagement.view_count === 0 || engagement.days_since_last_view === null) {
      continue; // never viewed — not "gone cold", just not viewed yet
    }
    if (engagement.days_since_last_view < thresholdDays) {
      continue; // viewed recently — still warm
    }

    // Already has an open nudge for this proposal — don't pile up duplicates.
    const { data: existingFollowup } = await sb
      .from("followups")
      .select("id")
      .eq("proposal_id", proposal.id)
      .in("status", ["suggested", "scheduled", "pending"])
      .limit(1)
      .maybeSingle();
    if (existingFollowup) {
      results.push({ proposal_id: proposal.id, action: "skipped", reason: "followup already open" });
      continue;
    }

    // A reply after the last view means they engaged back — not cold.
    const { data: recentReply } = await sb
      .from("emails")
      .select("id")
      .eq("proposal_id", proposal.id)
      .eq("direction", "inbound")
      .gte("created_at", engagement.last_viewed_at as string)
      .limit(1)
      .maybeSingle();
    if (recentReply) {
      results.push({ proposal_id: proposal.id, action: "skipped", reason: "replied since last view" });
      continue;
    }

    // Need a parent outbound email for followupEmailPrompt's tone/context reference.
    const { data: parentEmail } = await sb
      .from("emails")
      .select("id")
      .eq("proposal_id", proposal.id)
      .eq("direction", "outbound")
      .eq("status", "sent")
      .order("sent_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (!parentEmail) {
      results.push({ proposal_id: proposal.id, action: "skipped", reason: "no sent email to follow up on" });
      continue;
    }

    try {
      const res = await fetch(`${appUrl}/api/followups/generate`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          email_id: parentEmail.id,
          reason: `Gone cold — viewed but no activity for ${engagement.days_since_last_view} day(s)`,
        }),
      });
      const generated = await res.json();
      if (!res.ok) throw new Error(generated.error ?? "generate failed");
      await recordAudit({
        entity_type: "proposal",
        entity_id: proposal.id,
        action: "proposal.gone_cold_detected",
        metadata: { days_since_last_view: engagement.days_since_last_view, followup_id: generated.data?.followup?.id },
      });
      results.push({
        proposal_id: proposal.id,
        action: "nudge_created",
        days_since_last_view: engagement.days_since_last_view,
        followup_id: generated.data?.followup?.id ?? null,
      });
    } catch (err) {
      results.push({
        proposal_id: proposal.id,
        action: "error",
        error: err instanceof Error ? err.message : "generate failed",
      });
    }
  }

  return NextResponse.json({ checked: candidates?.length ?? 0, results });
}
