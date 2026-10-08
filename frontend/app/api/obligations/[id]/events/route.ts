import { NextResponse } from "next/server";
import { z } from "zod";
import { supabaseAdmin } from "@/lib/supabase/server";
import { requirePermission } from "@/lib/auth/server-permission";
import { recordAudit } from "@/lib/audit/log";
import { recordEvent } from "@/lib/obligations/store";
import { refreshForObligation } from "@/lib/company-status/store";
import { userActor } from "@/lib/identity/actor";

export const runtime = "nodejs";

const schema = z.object({
  action: z.enum(["deliver", "evidence", "accept", "waive", "reopen"]),
  note: z.string().max(2000).nullish(),
  reason: z.string().max(1000).nullish(),
  evidence_kind: z.enum(["link", "file", "statement"]).nullish(),
  evidence_ref: z.string().max(2000).nullish(),
});

/**
 * Record that work was delivered, attach proof of it, accept it, waive it or reopen it.
 * Proof is a link, an uploaded file, or a written statement; acceptance has to come from a
 * different person than the one who recorded the delivery.
 */
export async function POST(req: Request, ctx: { params: { id: string } }) {
  const auth = await requirePermission("manage_obligations");
  if ("error" in auth) return auth.error;
  const parsed = schema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: "Invalid payload", issues: parsed.error.issues }, { status: 400 });

  const d = parsed.data;
  const res = await recordEvent(supabaseAdmin(), auth.user.tenant_id, ctx.params.id, { action: d.action, note: d.note, reason: d.reason, evidenceKind: d.evidence_kind, evidenceRef: d.evidence_ref }, auth.user.email);
  if (!res.ok) return NextResponse.json({ error: res.error }, { status: res.status });
  await recordAudit({ actor: userActor(auth.user), entity_type: "obligation", entity_id: ctx.params.id, action: `obligation.${d.action}`, actor_email: auth.user.email, tenant_id: auth.user.tenant_id, metadata: { evidence_kind: d.evidence_kind ?? null, reason: d.reason ?? null, actor_user_id: auth.user.id } });
  await refreshForObligation(supabaseAdmin(), auth.user.tenant_id, ctx.params.id, `obligation.${d.action}`);
  return NextResponse.json({ status: res.value.status });
}
