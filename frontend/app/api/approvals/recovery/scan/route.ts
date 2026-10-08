import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";
import { requirePermissionOrInternal } from "@/lib/auth/server-permission";
import { recordAudit } from "@/lib/audit/log";
import { userOrService } from "@/lib/identity/actor";
import { scanApprovals } from "@/lib/approvals/recovery";
import { resolveTenantId } from "@/lib/tenants/current";

export const runtime = "nodejs";

/**
 * POST /api/approvals/recovery/scan
 * Finds approvals waiting on someone who can no longer give them (or on nobody, or for too long) and blocks them with a
 * reason and an escalation. Safe to run any time; also runs automatically when someone is deactivated or loses a role.
 */
export async function POST(req: Request) {
  const auth = await requirePermissionOrInternal(req, "manage_agents");
  if ("error" in auth) return auth.error;
  const tenantId = auth.user?.tenant_id ?? (await resolveTenantId());
  const res = await scanApprovals(supabaseAdmin(), tenantId);
  if (!res.ok) return NextResponse.json({ error: res.error }, { status: res.status });
  await recordAudit({ actor: userOrService(auth.user, req, "approval-recovery"), tenant_id: tenantId, entity_type: "approvals", action: "approvals.recovery_scan", metadata: { blocked: res.value.blocked.length, checked: res.value.checked } });
  return NextResponse.json(res.value);
}
