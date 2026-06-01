import { supabaseAdmin } from "@/lib/supabase/server";
import { PageHeader } from "@/components/shared/page-header";
import { BulkApproveClient } from "./bulk-approve-client";

export const dynamic = "force-dynamic";

export default async function BulkApprovePage() {
  const sb = supabaseAdmin();

  const { data: pendingJobs } = await (sb as ReturnType<typeof supabaseAdmin>)
    .from("image_generation_jobs")
    .select(
      "id, job_type, prompt, status, proposal_id, company_id, output_urls, selected_url, strategy_label, display_label, created_at"
    )
    .in("status", ["pending_approval", "approved"])
    .order("created_at", { ascending: false })
    .limit(100);

  const { data: draftProposals } = await sb
    .from("proposals")
    .select("id, title, status, company_id, companies(company_name)")
    .in("status", ["draft", "under_review"])
    .order("updated_at", { ascending: false })
    .limit(50);

  return (
    <>
      <PageHeader
        title="Aprovação em lote"
        description="Revise imagens e propostas de um grupo — aprove rapidamente antes de publicar."
      />
      <BulkApproveClient
        initialJobs={(pendingJobs ?? []) as never[]}
        draftProposals={((draftProposals ?? []) as Array<{
          id: string;
          title: string;
          status: string;
          companies: { company_name: string } | { company_name: string }[] | null;
        }>).map((p) => ({
          id: p.id,
          title: p.title,
          status: p.status,
          companies: Array.isArray(p.companies) ? p.companies[0] ?? null : p.companies,
        }))}
      />
    </>
  );
}
