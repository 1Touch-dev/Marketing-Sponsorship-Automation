import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";
import { requirePermission } from "@/lib/auth/server-permission";
import { recordAudit } from "@/lib/audit/log";
import { refreshAll } from "@/lib/company-status/store";
import { userActor } from "@/lib/identity/actor";

export const runtime = "nodejs";

/**
 * Re-derive every company's delivery status and record the ones that changed (a status moving, or becoming or
 * ceasing to be at risk, for example when a due date passes). Safe to run any time, or daily.
 */
export async function POST() {
  const auth = await requirePermission("refresh_company_status");
  if ("error" in auth) return auth.error;
  const res = await refreshAll(supabaseAdmin(), auth.user.tenant_id, `refresh:${auth.user.email}`);
  if (!res.ok) return NextResponse.json({ error: res.error }, { status: res.status });
  await recordAudit({ actor: userActor(auth.user), entity_type: "company", action: "company.status_refreshed", actor_email: auth.user.email, tenant_id: auth.user.tenant_id, metadata: { ...res.value, actor_user_id: auth.user.id } });
  return NextResponse.json(res.value);
}
