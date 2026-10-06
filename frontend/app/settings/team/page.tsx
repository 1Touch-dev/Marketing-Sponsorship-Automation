import { supabaseAdmin } from "@/lib/supabase/server";
import { resolveTenantId } from "@/lib/tenants/current";
import { PageHeader } from "@/components/shared/page-header";
import { TeamMembersManager } from "./team-members-manager";

export const dynamic = "force-dynamic";

export default async function TeamMembersPage() {
  const sb = supabaseAdmin();
  const tenantId = await resolveTenantId();

  const { data, error } = await sb
    .from("team_members")
    .select("*")
    .eq("tenant_id", tenantId)
    .order("default_sender", { ascending: false })
    .order("full_name");
  const members = error ? [] : ((data as Record<string, unknown>[]) ?? []);

  return (
    <>
      <PageHeader
        title="Teammates"
        description="People on the club roster. This is not permission to send email"
      />
      <TeamMembersManager initialMembers={members} loadError={error?.message ?? null} />
    </>
  );
}
