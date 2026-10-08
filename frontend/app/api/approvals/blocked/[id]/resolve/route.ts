import { NextResponse } from "next/server";
import { z } from "zod";
import { supabaseAdmin } from "@/lib/supabase/server";
import { requirePermission } from "@/lib/auth/server-permission";
import { recordAudit } from "@/lib/audit/log";
import { userActor } from "@/lib/identity/actor";
import { resolveBlock } from "@/lib/approvals/recovery";

export const runtime = "nodejs";

const schema = z.object({ action: z.enum(["reassign", "cancel", "dismiss"]), new_reviewer_email: z.string().email().nullish(), note: z.string().max(500).nullish() });

/**
 * Deal with a blocked approval. reassign: give it to someone who can act on it now (or back to the role queue);
 * cancel: stop it; dismiss: a paused run that is no longer a problem. Admin only, and audited.
 */
export async function POST(req: Request, ctx: { params: { id: string } }) {
  const auth = await requirePermission("manage_agents");
  if ("error" in auth) return auth.error;
  const parsed = schema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: "Invalid payload", issues: parsed.error.issues }, { status: 400 });
  const res = await resolveBlock(supabaseAdmin(), auth.user.tenant_id, ctx.params.id, { action: parsed.data.action, newReviewerEmail: parsed.data.new_reviewer_email, note: parsed.data.note }, { id: auth.user.id, email: auth.user.email });
  if (!res.ok) return NextResponse.json({ error: res.error }, { status: res.status });
  await recordAudit({ actor: userActor(auth.user), entity_type: "approval_block", entity_id: ctx.params.id, action: `approval_block.${res.value.resolution}`, metadata: { new_reviewer: parsed.data.new_reviewer_email ?? null, note: parsed.data.note ?? null } });
  return NextResponse.json(res.value);
}
