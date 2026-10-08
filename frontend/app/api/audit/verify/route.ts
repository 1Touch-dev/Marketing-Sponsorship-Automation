import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";
import { requirePermission } from "@/lib/auth/server-permission";
import { recordAudit } from "@/lib/audit/log";
import { userActor } from "@/lib/identity/actor";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/audit/verify
 * Checks that the tenant's audit log is intact: every entry still matches its fingerprint and follows the one
 * before it. Reports the first entry that does not. The database refuses edits and deletes; this is how an
 * edit made by bypassing it (for example with direct database access) would be found.
 */
export async function GET() {
  const auth = await requirePermission("view_audit");
  if ("error" in auth) return auth.error;
  const { data, error } = await supabaseAdmin().rpc("audit_verify_chain", { p_tenant: auth.user.tenant_id });
  if (error) {
    const missing = /audit_verify_chain|function|schema cache/i.test(error.message);
    return NextResponse.json({ error: missing ? "The audit chain is not set up yet (migration 0069)." : error.message }, { status: missing ? 503 : 500 });
  }
  const r = (Array.isArray(data) ? data[0] : data) as { ok: boolean; checked: number | string; first_bad_seq: number | string | null; reason: string | null };
  if (!r.ok) {
    await recordAudit({ actor: userActor(auth.user), entity_type: "audit", action: "audit.chain_broken_detected", metadata: { first_bad_seq: r.first_bad_seq, reason: r.reason } });
  }
  return NextResponse.json({ intact: r.ok, entries_checked: Number(r.checked), first_bad_seq: r.first_bad_seq === null ? null : Number(r.first_bad_seq), reason: r.reason });
}
