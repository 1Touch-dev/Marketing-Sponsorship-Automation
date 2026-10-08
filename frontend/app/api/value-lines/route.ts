import { NextResponse } from "next/server";
import { z } from "zod";
import { supabaseAdmin } from "@/lib/supabase/server";
import { resolveTenantId } from "@/lib/tenants/current";
import { requirePermission } from "@/lib/auth/server-permission";
import { recordAudit } from "@/lib/audit/log";
import { createLine, listLines } from "@/lib/finance/store";
import { userActor } from "@/lib/identity/actor";
import { idempotent } from "@/lib/idempotency";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Value lines (cash instalments and barter goods), filterable by ?company_id, ?contract_id, ?proposal_id, ?kind and ?bucket. */
export async function GET(req: Request) {
  const u = new URL(req.url).searchParams;
  const res = await listLines(supabaseAdmin(), await resolveTenantId(), { companyId: u.get("company_id"), contractId: u.get("contract_id"), proposalId: u.get("proposal_id"), kind: u.get("kind"), bucket: u.get("bucket") });
  if (!res.ok) return NextResponse.json({ error: res.error }, { status: res.status });
  return NextResponse.json({ total: res.value.length, data: res.value });
}

const schema = z.object({
  company_id: z.string().uuid(),
  kind: z.enum(["cash", "barter"]),
  label: z.string().max(300),
  amount_brl: z.union([z.number(), z.string()]),
  due_date: z.string().max(10).nullish(),
  proposal_id: z.string().uuid().nullish(),
  contract_id: z.string().uuid().nullish(),
  barter_item_id: z.string().uuid().nullish(),
  club_reference_value: z.union([z.number(), z.string()]).nullish(),
});

/** Record a promised amount: a cash instalment, or barter goods or services. It hangs on a proposal (proposed) or a contract. */
async function postHandler(req: Request) {
  const auth = await requirePermission("manage_value_lines");
  if ("error" in auth) return auth.error;
  const parsed = schema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: "Invalid payload", issues: parsed.error.issues }, { status: 400 });

  const { company_id, ...input } = parsed.data;
  const res = await createLine(supabaseAdmin(), auth.user.tenant_id, company_id, input, auth.user.email);
  if (!res.ok) return NextResponse.json({ error: res.error }, { status: res.status });
  await recordAudit({ actor: userActor(auth.user), entity_type: "value_line", entity_id: res.value.id, action: "value_line.created", actor_email: auth.user.email, tenant_id: auth.user.tenant_id, metadata: { kind: input.kind, amount_brl: input.amount_brl, company_id, actor_user_id: auth.user.id } });
  return NextResponse.json({ id: res.value.id, warnings: res.value.warnings }, { status: 201 });
}

export const POST = idempotent("value-lines.create", postHandler);
