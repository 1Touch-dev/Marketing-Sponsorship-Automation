import { supabaseAdmin } from "@/lib/supabase/server";
import { resolveTenantId } from "@/lib/tenants/current";
import { PageHeader } from "@/components/shared/page-header";
import { SenderProfilesClient } from "./sender-profiles-client";

export const dynamic = "force-dynamic";

export default async function SenderProfilesPage() {
  const sb = supabaseAdmin();
  const tenantId = await resolveTenantId();
  const profileQuery = await sb.from("sender_profiles").select("*").eq("tenant_id", tenantId).order("is_default", { ascending: false }).order("full_name");
  const profiles = (profileQuery.error ? [] : profileQuery.data ?? []) as Array<{ id: string; full_name: string; title: string | null; email: string; phone: string | null; linkedin_url: string | null; html_signature: string | null; is_default: boolean }>;

  return (
    <>
      <PageHeader title="Who the email is from" description="The name and address on outreach email" />
      <SenderProfilesClient initialProfiles={profiles} loadError={profileQuery.error?.message ?? null} />
    </>
  );
}
