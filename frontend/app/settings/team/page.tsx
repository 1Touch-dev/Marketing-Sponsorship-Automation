import { supabaseAdmin } from "@/lib/supabase/server";
import { resolveTenantId } from "@/lib/tenants/current";
import { PageHeader } from "@/components/shared/page-header";
import { TeamMembersManager } from "./team-members-manager";

export const dynamic = "force-dynamic";

export default async function TeamMembersPage() {
  const sb = supabaseAdmin();
  const tenantId = await resolveTenantId();

  let members: Record<string, unknown>[] = [];
  try {
    const { data } = await sb
      .from("team_members")
      .select("*")
      .eq("tenant_id", tenantId)
      .order("default_sender", { ascending: false })
      .order("full_name");
    members = (data as Record<string, unknown>[]) ?? [];
  } catch {
    // migration 0024 pending
  }

  return (
    <>
      <PageHeader
        title="Teammates"
        description="People on the club roster. This is not permission to send email"
      />
      <TeamMembersManager initialMembers={members} />
    </>
  );
}
