import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";
import { resolveTenantId } from "@/lib/tenants/current";
import { checkRecipient, loadRoles } from "@/lib/contacts/store";
import { channelStatus, type ChannelCheckRow } from "@/lib/contacts/model";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** One contact's standing: their roles now and over time, how trustworthy each channel is, and whether they may be contacted. */
export async function GET(_req: Request, ctx: { params: { id: string } }) {
  const tenantId = await resolveTenantId();
  const sb = supabaseAdmin();
  const { data: contact } = await sb.from("contacts").select("id, company_id, full_name, email, title, phone, linkedin_url").eq("id", ctx.params.id).eq("tenant_id", tenantId).maybeSingle();
  if (!contact) return NextResponse.json({ error: "Contact not found" }, { status: 404 });

  const roles = await loadRoles(sb, tenantId, contact.id);
  const verdict = await checkRecipient(sb, tenantId, { email: contact.email, companyId: contact.company_id });
  const phoneChecks = contact.phone
    ? await sb.from("contact_channel_checks").select("outcome, method, checked_by, created_at").eq("tenant_id", tenantId).eq("channel", "phone").eq("value", contact.phone.trim())
    : { data: [], error: null };

  return NextResponse.json({
    contact,
    roles: roles.ok ? roles.value : { current: [], history: [] },
    channels: { email: { value: contact.email, status: verdict.channel }, phone: contact.phone ? { value: contact.phone, status: phoneChecks.error ? "unverified" : channelStatus((phoneChecks.data ?? []) as ChannelCheckRow[]) } : null },
    can_contact: verdict.allowed,
    blocks: verdict.blocks,
    warnings: verdict.warnings,
    enforced: verdict.enforced,
  });
}
