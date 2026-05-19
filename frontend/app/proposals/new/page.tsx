import { supabaseAdmin } from "@/lib/supabase/server";
import { PageHeader } from "@/components/shared/page-header";
import { ProposalWizard } from "./proposal-wizard";

export const dynamic = "force-dynamic";

export default async function NewProposalPage() {
  const sb = supabaseAdmin();

  const [{ data: companies }, { data: campaigns }] = await Promise.all([
    sb.from("companies").select("id, company_name, industry, segment, business_type, company_size, website, logo_url, notes").neq("status", "closed").order("company_name"),
    sb.from("campaigns").select("id, title, summary, status").eq("status", "active").order("created_at", { ascending: false }).limit(50),
  ]);

  return (
    <>
      <PageHeader
        title="New Proposal"
        description="Guided proposal builder — step by step"
      />
      <ProposalWizard
        companies={companies ?? []}
        campaigns={campaigns ?? []}
      />
    </>
  );
}
