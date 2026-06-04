import { supabaseAdmin } from "@/lib/supabase/server";
import { PageHeader } from "@/components/shared/page-header";
import { TeamMembersManager } from "./team-members-manager";

export const dynamic = "force-dynamic";

export default async function TeamMembersPage() {
  const sb = supabaseAdmin();

  let members: Record<string, unknown>[] = [];
  try {
    const { data } = await sb
      .from("team_members")
      .select("*")
      .order("default_sender", { ascending: false })
      .order("full_name");
    members = (data as Record<string, unknown>[]) ?? [];
  } catch {
    // migration 0024 pending
  }

  return (
    <>
      <PageHeader
        title="Team Members"
        description="Manage team sender profiles. The default sender is used in all outreach emails."
      />
      <TeamMembersManager initialMembers={members} />
    </>
  );
}
