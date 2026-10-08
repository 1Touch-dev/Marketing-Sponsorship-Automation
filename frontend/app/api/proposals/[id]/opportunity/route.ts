import { NextResponse } from "next/server";
import { z } from "zod";
import { supabaseAdmin } from "@/lib/supabase/server";
import { requirePermission } from "@/lib/auth/server-permission";
import { recordAudit } from "@/lib/audit/log";
import { assignProposal } from "@/lib/opportunities/store";
import { userActor } from "@/lib/identity/actor";

export const runtime = "nodejs";

const schema = z.object({ opportunity_id: z.string().uuid().nullable() });

/** Move a proposal (and its contract) to another opportunity of the same company, or detach it. */
export async function POST(req: Request, ctx: { params: { id: string } }) {
  const auth = await requirePermission("edit_proposal");
  if ("error" in auth) return auth.error;

  const parsed = schema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: "Invalid payload", issues: parsed.error.issues }, { status: 400 });

  const res = await assignProposal(supabaseAdmin(), auth.user.tenant_id, ctx.params.id, parsed.data.opportunity_id);
  if (!res.ok) return NextResponse.json({ error: res.error }, { status: res.status });

  await recordAudit({ actor: userActor(auth.user), entity_type: "proposal", entity_id: ctx.params.id, action: "proposal.opportunity_changed", actor_email: auth.user.email, tenant_id: auth.user.tenant_id, metadata: { opportunity_id: parsed.data.opportunity_id, actor_user_id: auth.user.id } });
  return NextResponse.json({ opportunity_id: res.value.opportunity_id });
}
