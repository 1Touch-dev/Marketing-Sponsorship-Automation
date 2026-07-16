import { supabaseAdmin } from "@/lib/supabase/server";
import { PageHeader } from "@/components/shared/page-header";
import { EmailFlowsManager } from "./email-flows-manager";

export const dynamic = "force-dynamic";

export default async function EmailFlowsPage() {
  const sb = supabaseAdmin();

  let sequences: Record<string, unknown>[] = [];
  let templates: Record<string, unknown>[] = [];
  let migrationPending = false;

  try {
    const { data, error } = await sb
      .from("email_sequences")
      .select("*")
      .eq("active", true)
      .order("is_default", { ascending: false })
      .order("name");
    if (error) migrationPending = true;
    else sequences = (data as Record<string, unknown>[]) ?? [];
  } catch {
    migrationPending = true;
  }

  try {
    const { data } = await sb
      .from("email_templates")
      .select("id, name, flow_type")
      .eq("active", true)
      .order("name");
    templates = (data as Record<string, unknown>[]) ?? [];
  } catch {
    /* templates optional */
  }

  return (
    <>
      <PageHeader
        title="Email Flows"
        description="Build reusable multi-step outreach flows (introduction → follow-up → negotiation / barter) and assign them to companies. Steps generate drafts and log to Pipedrive."
      />
      <EmailFlowsManager
        initialSequences={sequences}
        templates={templates}
        migrationPending={migrationPending}
      />
    </>
  );
}
