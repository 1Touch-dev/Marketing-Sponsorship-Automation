import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";
import { requirePermission } from "@/lib/auth/server-permission";
import { recordAudit } from "@/lib/audit/log";
import { handoffContract } from "@/lib/obligations/store";
import { refreshForContract } from "@/lib/company-status/store";
import { userActor } from "@/lib/identity/actor";

export const runtime = "nodejs";

/**
 * Hand a contract's commitments to delivery: one owned, dated obligation per sold item and per
 * onboarding step, and one delivery project to hold them. Safe to run again; only what is missing
 * is added. This also runs automatically when a contract is created.
 */
export async function POST(_req: Request, ctx: { params: { id: string } }) {
  const auth = await requirePermission("manage_obligations");
  if ("error" in auth) return auth.error;
  const res = await handoffContract(supabaseAdmin(), auth.user.tenant_id, ctx.params.id, { email: auth.user.email });
  if (!res.ok) return NextResponse.json({ error: res.error }, { status: res.status });
  await recordAudit({ actor: userActor(auth.user),
    entity_type: "contract", entity_id: ctx.params.id, action: "contract.handoff", actor_email: auth.user.email, tenant_id: auth.user.tenant_id,
    metadata: { created: res.value.created, already_existed: res.value.already_existed, project_id: res.value.project_id, owner: res.value.owner.email, actor_user_id: auth.user.id },
  });
  await refreshForContract(supabaseAdmin(), auth.user.tenant_id, ctx.params.id, "contract.handoff");
  return NextResponse.json(res.value, { status: res.value.created > 0 ? 201 : 200 });
}
