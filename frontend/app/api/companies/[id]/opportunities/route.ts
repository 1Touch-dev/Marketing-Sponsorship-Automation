import { NextResponse } from "next/server";
import { z } from "zod";
import { supabaseAdmin } from "@/lib/supabase/server";
import { resolveTenantId } from "@/lib/tenants/current";
import { requirePermission } from "@/lib/auth/server-permission";
import { recordAudit } from "@/lib/audit/log";
import { createOpportunity, loadOpportunities } from "@/lib/opportunities/store";
import { OPPORTUNITY_KINDS } from "@/lib/opportunities/model";
import { userActor } from "@/lib/identity/actor";
import { idempotent } from "@/lib/idempotency";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** All of a company's opportunities, each with its derived status, proposals and contracts. */
export async function GET(_req: Request, ctx: { params: { id: string } }) {
  const tenantId = await resolveTenantId();
  const res = await loadOpportunities(supabaseAdmin(), tenantId, { companyId: ctx.params.id });
  if (!res.ok) return NextResponse.json({ error: res.error }, { status: res.status });
  return NextResponse.json({ data: res.value });
}

const schema = z.object({
  kind: z.enum(OPPORTUNITY_KINDS),
  title: z.string().max(200).optional(),
  owner_email: z.string().email().nullish(),
});

/** A person opens an opportunity. This also records the human decision that the account is a real sales opportunity. */
async function postHandler(req: Request, ctx: { params: { id: string } }) {
  const auth = await requirePermission("create_opportunity");
  if ("error" in auth) return auth.error;

  const parsed = schema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: "Invalid payload", issues: parsed.error.issues }, { status: 400 });

  const res = await createOpportunity(supabaseAdmin(), auth.user.tenant_id, ctx.params.id, {
    kind: parsed.data.kind,
    title: parsed.data.title,
    ownerEmail: parsed.data.owner_email ?? null,
    actor: { kind: "human", email: auth.user.email, userId: auth.user.id },
  });
  if (!res.ok) return NextResponse.json({ error: res.error }, { status: res.status });

  await recordAudit({ actor: userActor(auth.user), entity_type: "company", entity_id: ctx.params.id, action: "opportunity.opened", actor_email: auth.user.email, tenant_id: auth.user.tenant_id, metadata: { opportunity_id: res.value.id, kind: parsed.data.kind, account_qualified: res.value.qualifiedAccount, actor_user_id: auth.user.id } });
  return NextResponse.json({ opportunity_id: res.value.id, account_qualified: res.value.qualifiedAccount }, { status: 201 });
}

export const POST = idempotent("opportunities.create", postHandler);
