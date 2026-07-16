import { supabaseAdmin } from "@/lib/supabase/server";
import { PageHeader } from "@/components/shared/page-header";
import { ProposalTemplatesManager } from "./proposal-templates-manager";

export const dynamic = "force-dynamic";

export default async function ProposalTemplatesPage() {
  const sb = supabaseAdmin();

  let templates: Record<string, unknown>[] = [];
  let migrationPending = false;

  try {
    const { data, error } = await sb
      .from("proposal_templates")
      .select("*")
      .eq("active", true)
      .order("is_default", { ascending: false })
      .order("name");
    if (error) migrationPending = true;
    else templates = (data as Record<string, unknown>[]) ?? [];
  } catch {
    migrationPending = true;
  }

  return (
    <>
      <PageHeader
        title="Presentation Templates"
        description="Reusable, industry-tagged proposal templates. Save any proposal as a template, then reuse its pages and image placeholders for new personalized presentations."
      />
      <ProposalTemplatesManager initialTemplates={templates} migrationPending={migrationPending} />
    </>
  );
}
