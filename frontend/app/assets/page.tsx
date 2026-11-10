import { supabaseAdmin } from "@/lib/supabase/server";
import { resolveTenantId } from "@/lib/tenants/current";
import { PageHeader } from "@/components/shared/page-header";
import { PaginationControls } from "@/components/shared/pagination-controls";
import { Button } from "@/components/ui/button";
import Link from "next/link";
import { Plus } from "lucide-react";
import { AssetLibraryClient, type Asset } from "./asset-library-client";

export const dynamic = "force-dynamic";

const PAGE_SIZE = 50;
const JOB_SELECT = "id, job_type, status, prompt, output_urls, selected_url, proposal_id, company_id, campaign_id, created_at";

export default async function AssetsPage({
  searchParams,
}: {
  searchParams: { page?: string };
}) {
  const sb = supabaseAdmin();
  const tenantId = await resolveTenantId();
  const requested = Math.max(1, parseInt(searchParams.page ?? "1", 10) || 1);

  const jobsBase = () =>
    sb
      .from("image_generation_jobs" as "companies")
      .select("id", { count: "exact", head: true })
      .eq("tenant_id" as "id", tenantId);

  // Head-count first so we can clamp page before fetching the list range
  const totalHead = await jobsBase();
  const totalCount = totalHead.count ?? 0;
  const totalPages = Math.max(1, Math.ceil(totalCount / PAGE_SIZE) || 1);
  const page = Math.min(requested, totalPages);
  const offset = (page - 1) * PAGE_SIZE;

  const [
    jobsRes,
    completedHead,
    pendingHead,
    generatingHead,
    archivedHead,
    { data: proposals },
    { data: companies },
    { data: campaigns },
  ] = await Promise.all([
    // Found live-testing 2026-09-18 (wiring up campaign-image assignment):
    // this previously selected "image_url", a column that has never existed
    // on image_generation_jobs (the real fields are output_urls[]/
    // selected_url, resolved via resolveJobImageUrl — same helper the
    // proposal-facing image pickers already use).
    sb
      .from("image_generation_jobs" as "companies")
      .select(JOB_SELECT, { count: "exact" })
      .eq("tenant_id" as "id", tenantId)
      .order("created_at", { ascending: false })
      .range(offset, offset + PAGE_SIZE - 1),
    jobsBase().eq("status" as "id", "completed"),
    jobsBase().eq("status" as "id", "pending_approval"),
    jobsBase().eq("status" as "id", "generating"),
    jobsBase().eq("status" as "id", "archived"),
    sb.from("proposals").select("id, title").eq("tenant_id", tenantId).limit(100),
    sb.from("companies").select("id, company_name").eq("tenant_id", tenantId).neq("status", "closed").limit(100),
    sb.from("campaigns").select("id, title, company_id").eq("tenant_id", tenantId).limit(200),
  ]);

  const jobsError = jobsRes.error;
  if (jobsError) console.error("[assets] failed to load image_generation_jobs", jobsError.message);

  const jobs = jobsRes.data ?? [];
  const statusCounts = {
    completed: completedHead.count ?? 0,
    pending_approval: pendingHead.count ?? 0,
    generating: generatingHead.count ?? 0,
    archived: archivedHead.count ?? 0,
  };

  return (
    <>
      <PageHeader
        title="Asset Library"
        description="Media governance — approval workflow, versioning, relationships"
        actions={
          <Button size="sm" asChild className="gap-1.5">
            <Link href="/media-generation"><Plus className="h-3.5 w-3.5" /> New Asset</Link>
          </Button>
        }
      />

      {!jobsError && (
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 mb-6">
        {[
          { label: "Total Assets", value: totalCount, color: "bg-slate-500" },
          { label: "Approved", value: statusCounts.completed, color: "bg-green-500" },
          { label: "Pending Approval", value: statusCounts.pending_approval, color: "bg-amber-500" },
          { label: "Generating", value: statusCounts.generating, color: "bg-blue-500" },
          { label: "Archived", value: statusCounts.archived, color: "bg-muted-foreground" },
        ].map(stat => (
          <div key={stat.label} className="rounded-xl border bg-card p-4">
            <div className={`text-2xl font-bold`}>{stat.value}</div>
            <div className="text-xs text-muted-foreground mt-1 flex items-center gap-1.5">
              <span className={`h-1.5 w-1.5 rounded-full ${stat.color}`} />
              {stat.label}
            </div>
          </div>
        ))}
      </div>
      )}

      <AssetLibraryClient
        assets={jobsError ? [] : jobs as unknown as Asset[]}
        proposals={(proposals ?? []) as Array<{ id: string; title: string }>}
        companies={(companies ?? []) as Array<{ id: string; company_name: string }>}
        campaigns={(campaigns ?? []) as Array<{ id: string; title: string; company_id: string | null }>}
        loadError={jobsError?.message ?? null}
      />

      {!jobsError && (
        <div className="mt-4">
          <PaginationControls
            page={page}
            pageSize={PAGE_SIZE}
            totalCount={totalCount}
            basePath="/assets"
            searchParams={searchParams}
          />
        </div>
      )}
    </>
  );
}
