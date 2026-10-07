import { NextResponse } from "next/server";
import { z } from "zod";
import { supabaseAdmin } from "@/lib/supabase/server";
import { resolveTenantId } from "@/lib/tenants/current";
import { requirePermission } from "@/lib/auth/server-permission";
import { recordAudit } from "@/lib/audit/log";
import { loadSettings, saveSettings } from "@/lib/finance/store";
import { BARTER_BASES, CONTRACT_COVERS, RECOGNITION_STAGES } from "@/lib/finance/model";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** The accounting rules in force: how barter is valued, when cash counts as recognised, what a contract's total covers. */
export async function GET() {
  const res = await loadSettings(supabaseAdmin(), await resolveTenantId());
  if (!res.ok) return NextResponse.json({ error: res.error }, { status: res.status });
  return NextResponse.json({ ...res.value.settings, is_default: res.value.isDefault, updated_by: res.value.updated_by, updated_at: res.value.updated_at });
}

const schema = z.object({
  barter_valuation_basis: z.enum(BARTER_BASES).optional(),
  recognition_stage: z.enum(RECOGNITION_STAGES).optional(),
  contract_total_covers: z.enum(CONTRACT_COVERS).optional(),
  barter_tax_note: z.string().max(2000).nullish(),
});

/** Change the accounting rules. Admin only; every change is audited. */
export async function PATCH(req: Request) {
  const auth = await requirePermission("manage_finance");
  if ("error" in auth) return auth.error;
  const parsed = schema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: "Invalid payload", issues: parsed.error.issues }, { status: 400 });

  const res = await saveSettings(supabaseAdmin(), auth.user.tenant_id, parsed.data, auth.user.email);
  if (!res.ok) return NextResponse.json({ error: res.error }, { status: res.status });
  await recordAudit({ entity_type: "accounting_settings", action: "accounting.settings_changed", actor_email: auth.user.email, tenant_id: auth.user.tenant_id, metadata: { ...parsed.data, actor_user_id: auth.user.id } });
  return NextResponse.json(res.value);
}
