import { supabaseAdmin } from "@/lib/supabase/server";
import { resolveTenantId } from "@/lib/tenants/current";
import { PageHeader } from "@/components/shared/page-header";
import { SenderProfilesClient } from "./sender-profiles-client";

export const dynamic = "force-dynamic";

export default async function SenderProfilesPage() {
  const sb = supabaseAdmin();
  const tenantId = await resolveTenantId();
  let profiles: Array<{ id: string; full_name: string; title: string | null; email: string; phone: string | null; linkedin_url: string | null; html_signature: string | null; is_default: boolean }> = [];
  try {
    const { data } = await sb.from("sender_profiles").select("*").eq("tenant_id", tenantId).order("is_default", { ascending: false }).order("full_name");
    profiles = (data ?? []) as typeof profiles;
  } catch { profiles = []; }

  return (
    <>
      <PageHeader title="Sender Profiles" description="Team members who send sponsorship outreach emails." />
      <SenderProfilesClient initialProfiles={profiles} />
    </>
  );
}
