import { NextResponse } from "next/server";
import { z } from "zod";
import { supabaseAdmin } from "@/lib/supabase/server";
import { requirePermission } from "@/lib/auth/server-permission";
import { recordAudit } from "@/lib/audit/log";
import { userActor } from "@/lib/identity/actor";
import { isMissingMigration } from "@/lib/proposals/revision-store";

export const runtime = "nodejs";

const schema = z.object({ company_id: z.string().uuid(), email: z.string().email().nullish(), reason: z.string().min(5).max(500) });

/**
 * POST /api/portal-admin/revoke   { company_id, email?, reason }
 * Ends sponsor portal access at once: for one person at that sponsor, or for the whole sponsor when email is left out.
 * Every session issued before now stops working on its next request. Removing the person from the sponsor's contacts
 * does the same; this is the way to do it without touching contacts.
 */
export async function POST(req: Request) {
  const auth = await requirePermission("manage_portal_access");
  if ("error" in auth) return auth.error;
  const parsed = schema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: "Invalid payload", issues: parsed.error.issues }, { status: 400 });
  const sb = supabaseAdmin();
  const { data: company } = await sb.from("companies").select("id").eq("id", parsed.data.company_id).eq("tenant_id", auth.user.tenant_id).maybeSingle();
  if (!company) return NextResponse.json({ error: "Company not found" }, { status: 404 });
  const { data, error } = await sb.from("portal_revocations").insert({
    tenant_id: auth.user.tenant_id, company_id: company.id, email: parsed.data.email?.trim().toLowerCase() ?? null, reason: parsed.data.reason.trim(), revoked_by: auth.user.email,
  }).select("id, revoked_at").single();
  if (error) {
    if (isMissingMigration(error)) return NextResponse.json({ error: "Ending portal access is not set up yet (migration 0072)." }, { status: 503 });
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  await recordAudit({ actor: userActor(auth.user), entity_type: "portal_access", entity_id: company.id, action: "portal.access_revoked", metadata: { scope: parsed.data.email ? "one person" : "whole sponsor", reason: parsed.data.reason.trim() } });
  return NextResponse.json({ id: data.id, revoked_at: data.revoked_at }, { status: 201 });
}
