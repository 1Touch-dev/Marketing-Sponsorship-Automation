/**
 * POST /api/agents/team2/run-all
 * The "unified orchestrator" for Team 2 — CRM Outreach Automation
 * (`master_report.md` Section 7.4): a single entry point that runs
 * Pipeline Hygiene, Renewal, and Reporting together (the three agents
 * that operate tenant-wide with no specific per-item target, unlike
 * Team 1's per-company Outreach/Negotiation agents, which already have
 * their own natural per-item trigger points on the company/email pages).
 *
 * Also advances the email-sequence engine (the working "email" channel
 * of the Multi-Channel Sequencer role) so a single click covers all of
 * Team 2's CRM-wide automation. WhatsApp/LinkedIn channels are not run
 * here — they don't exist yet (no API credentials provisioned, see
 * PLATFORM_ROADMAP.md Phase 8).
 *
 * All outputs land in the exact same tables/statuses every other draft
 * in this app uses (proposals.status="under_review",
 * emails.status="pending_approval"), so they already flow into the
 * existing shared /approvals queue — no separate queue was built, per
 * the report's own explicit instruction to reuse it.
 */
import { NextResponse } from "next/server";
import { requirePermission } from "@/lib/auth/server-permission";
import { runPipelineHygieneAgent } from "@/lib/agents/langgraph/pipeline-hygiene-agent";
import { runRenewalAgent } from "@/lib/agents/langgraph/renewal-agent";
import { runReportingAgent } from "@/lib/agents/langgraph/reporting-agent";
import { supabaseAdmin } from "@/lib/supabase/server";
import { recordAudit } from "@/lib/audit/log";

export const runtime = "nodejs";
export const maxDuration = 180;

export async function POST() {
  const auth = await requirePermission("run_intelligence");
  if ("error" in auth) return auth.error;

  const tenantId = auth.user.tenant_id;

  const [hygiene, renewal, reporting] = await Promise.all([
    runPipelineHygieneAgent(tenantId),
    runRenewalAgent(tenantId),
    runReportingAgent(tenantId),
  ]);

  // Advance any email-sequence steps that are due (the sequencer's working
  // email channel) — reuses the existing engine, doesn't duplicate it.
  const sb = supabaseAdmin();
  const { count: dueCount } = await sb
    .from("email_sequence_enrollments")
    .select("id", { count: "exact", head: true })
    .eq("tenant_id", tenantId)
    .eq("status", "active")
    .lte("next_run_at", new Date().toISOString());

  let sequencerProcessed = 0;
  if (dueCount && dueCount > 0) {
    const appUrl = process.env.APP_URL ?? process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
    try {
      const res = await fetch(`${appUrl}/api/email-sequences/advance`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-internal-secret": process.env.INTERNAL_API_SECRET ?? "",
        },
        body: JSON.stringify({ run_due: true, limit: 25 }),
      });
      if (res.ok) sequencerProcessed = (await res.json()).processed ?? 0;
    } catch {
      // non-fatal — the other three agents' results still stand
    }
  }

  const summary = {
    hygiene: { staleCount: hygiene.staleCompanies.length },
    renewal: { draftedCount: renewal.drafted.length, skippedCount: renewal.skipped.length },
    reporting: { draftedCount: reporting.drafted.length, skippedCount: reporting.skipped.length },
    sequencer: { dueCount: dueCount ?? 0, processed: sequencerProcessed },
    generatedAt: new Date().toISOString(),
  };

  await recordAudit({
    entity_type: "agents",
    action: "team2.run_all",
    metadata: summary,
  });

  return NextResponse.json({
    hygiene,
    renewal,
    reporting,
    sequencer: summary.sequencer,
    summary,
  });
}
