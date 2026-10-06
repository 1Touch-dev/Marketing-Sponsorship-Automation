import { NextResponse } from "next/server";
import { z } from "zod";
import { supabaseAdmin } from "@/lib/supabase/server";
import { requirePermission } from "@/lib/auth/server-permission";
import { recordAudit } from "@/lib/audit/log";
import { setStructure } from "@/lib/accounts/store";

export const runtime = "nodejs";

const schema = z.object({
  parent_company_id: z.string().uuid().nullable().optional(),
  relationship_to_parent: z.enum(["subsidiary", "division", "operation", "brand", "branch"]).nullable().optional(),
  duplicate_of_id: z.string().uuid().nullable().optional(),
  cnpj: z.string().max(30).nullable().optional(),
});

/**
 * Record how this company relates to others: its parent, that it is the same
 * entity as another record, or its CNPJ. Nothing is merged or deleted; a
 * duplicate is only marked.
 */
export async function POST(req: Request, ctx: { params: { id: string } }) {
  const auth = await requirePermission("edit_company");
  if ("error" in auth) return auth.error;

  const parsed = schema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: "Invalid payload", issues: parsed.error.issues }, { status: 400 });

  const res = await setStructure(supabaseAdmin(), auth.user.tenant_id, ctx.params.id, parsed.data);
  if (!res.ok) return NextResponse.json({ error: res.error }, { status: res.status });

  await recordAudit({ entity_type: "company", entity_id: ctx.params.id, action: "company.structure_changed", actor_email: auth.user.email, tenant_id: auth.user.tenant_id, metadata: { ...parsed.data, actor_user_id: auth.user.id } });
  return NextResponse.json({ data: res.value });
}
