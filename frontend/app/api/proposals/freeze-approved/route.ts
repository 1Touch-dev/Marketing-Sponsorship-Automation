import { NextResponse } from "next/server";
import { z } from "zod";
import { supabaseAdmin } from "@/lib/supabase/server";
import { requirePermission } from "@/lib/auth/server-permission";
import { recordAudit } from "@/lib/audit/log";
import { userActor } from "@/lib/identity/actor";
import { approveRevision } from "@/lib/proposals/revision-store";
import { SPONSOR_VISIBLE_PROPOSAL_STATUSES } from "@/lib/portal/safe-view";
import { idempotent } from "@/lib/idempotency";

export const runtime = "nodejs";
export const maxDuration = 60;

const schema = z.object({ dry_run: z.boolean().optional(), limit: z.number().int().min(1).max(200).optional() });

/**
 * POST /api/proposals/freeze-approved   { dry_run?, limit? }
 *
 * Proposals approved before revisions existed have nothing frozen, so a sponsor is still shown their live text. This
 * freezes the wording each one has RIGHT NOW as its approved revision, recorded under the name of the person who ran it.
 * That is a statement that the current wording is what was approved, which is why it is a person's action and never
 * automatic. Run it with `dry_run` first to see how many there are.
 */
async function postHandler(req: Request) {
  const auth = await requirePermission("approve_proposal");
  if ("error" in auth) return auth.error;
  const parsed = schema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: "Invalid payload", issues: parsed.error.issues }, { status: 400 });
  const limit = parsed.data.limit ?? 100;
  const sb = supabaseAdmin();

  const { data, error } = await sb
    .from("proposals")
    .select("id, status")
    .eq("tenant_id", auth.user.tenant_id)
    .in("status", [...SPONSOR_VISIBLE_PROPOSAL_STATUSES])
    .is("approved_revision_id", null)
    .order("created_at", { ascending: true })
    .limit(limit);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  const todo = (data ?? []) as Array<{ id: string; status: string }>;
  if (parsed.data.dry_run) return NextResponse.json({ dry_run: true, would_freeze: todo.length, limit });

  let frozen = 0;
  const failed: Array<{ id: string; reason: string }> = [];
  for (const p of todo) {
    const r = await approveRevision(sb, auth.user.tenant_id, p.id, { reason: `Baseline frozen for the sponsor view by ${auth.user.email}`, userId: auth.user.id });
    if (r.ok) frozen++;
    else failed.push({ id: p.id, reason: r.skipped === "error" ? (r.error ?? "error") : r.skipped });
  }
  await recordAudit({
    actor: userActor(auth.user), entity_type: "proposal", action: "proposal.baseline_frozen",
    metadata: { frozen, failed: failed.length, limit },
  });
  return NextResponse.json({ frozen, failed, remaining_possible: todo.length === limit });
}

export const POST = idempotent("proposals.freeze_approved", postHandler);
