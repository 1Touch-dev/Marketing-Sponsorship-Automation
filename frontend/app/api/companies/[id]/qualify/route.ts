import { NextResponse } from "next/server";
import { z } from "zod";
import { supabaseAdmin } from "@/lib/supabase/server";
import { requirePermission } from "@/lib/auth/server-permission";
import { recordAudit } from "@/lib/audit/log";
import { loadStage, recordQualification } from "@/lib/accounts/store";
import { userActor } from "@/lib/identity/actor";

export const runtime = "nodejs";

const schema = z.object({
  decision: z.enum(["qualified", "disqualified", "revoked"]),
  reason: z.string().min(5).max(1000),
  research_id: z.string().uuid().nullish(),
});

/**
 * A person decides whether this account is a real sales opportunity. This is
 * the only way an account becomes "qualified"; agent code has no path here
 * because it needs a signed-in user with the qualify_company permission.
 */
export async function POST(req: Request, ctx: { params: { id: string } }) {
  const auth = await requirePermission("qualify_company");
  if ("error" in auth) return auth.error;

  const parsed = schema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: "Invalid payload", issues: parsed.error.issues }, { status: 400 });

  const sb = supabaseAdmin();
  const res = await recordQualification(sb, auth.user.tenant_id, ctx.params.id, {
    decision: parsed.data.decision,
    reason: parsed.data.reason,
    researchId: parsed.data.research_id ?? null,
    actorEmail: auth.user.email,
    actorUserId: auth.user.id,
  });
  if (!res.ok) return NextResponse.json({ error: res.error }, { status: res.status });

  await recordAudit({ actor: userActor(auth.user), entity_type: "company", entity_id: ctx.params.id, action: `company.${parsed.data.decision}`, actor_email: auth.user.email, tenant_id: auth.user.tenant_id, metadata: { qualification_id: res.value.id, actor_user_id: auth.user.id } });
  const stage = await loadStage(sb, auth.user.tenant_id, ctx.params.id);
  return NextResponse.json({ qualification_id: res.value.id, stage: stage.ok ? stage.value.stage : null }, { status: 201 });
}
