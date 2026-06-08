import Link from "next/link";
import { supabaseAdmin } from "@/lib/supabase/server";
import { PageHeader } from "@/components/shared/page-header";
import { StatusBadge } from "@/components/shared/status-badge";
import { EmptyState } from "@/components/shared/empty-state";
import { formatDate, truncate } from "@/lib/utils";
import { Filter, FileText, ChevronRight } from "lucide-react";
import { BulkLogoUploader } from "@/components/proposals/bulk-logo-uploader";

export const dynamic = "force-dynamic";

const PROPOSAL_STATUSES = [
  "draft", "under_review", "revision_requested", "approved", "scheduled", "sent", "rejected",
];

type ProposalRow = {
  id: string;
  title: string;
  status: string;
  version: number;
  updated_at: string;
  created_at: string;
  content?: { uploaded_assets?: Array<{ url: string }> } | null;
  companies: { id: string; company_name: string; industry: string | null; logo_url?: string | null } | null;
};

export default async function ProposalsPage({
  searchParams,
}: {
  searchParams: { q?: string; status?: string; company?: string; industry?: string; sort?: string };
}) {
  const sb = supabaseAdmin();

  const [proposalsResult, companiesResult] = await Promise.all([
    sb
      .from("proposals")
      .select("id, title, status, version, updated_at, created_at, content, companies(id, company_name, industry, logo_url)")
      .neq("status", "rejected")
      .order("updated_at", { ascending: false })
      .limit(300),
    sb.from("companies").select("id, company_name").neq("status", "closed").order("company_name"),
  ]);

  let proposals = (proposalsResult.data ?? []) as unknown as ProposalRow[];
  const companies = companiesResult.data ?? [];

  // Filters
  if (searchParams.status) {
    proposals = proposals.filter((p) => p.status === searchParams.status);
  }
  if (searchParams.company) {
    proposals = proposals.filter((p) => p.companies?.id === searchParams.company);
  }
  if (searchParams.industry) {
    const ind = searchParams.industry.toLowerCase();
    proposals = proposals.filter((p) => (p.companies?.industry ?? "").toLowerCase().includes(ind));
  }
  if (searchParams.q) {
    const q = searchParams.q.toLowerCase();
    proposals = proposals.filter(
      (p) =>
        p.title.toLowerCase().includes(q) ||
        (p.companies?.company_name ?? "").toLowerCase().includes(q),
    );
  }
  if (searchParams.sort === "oldest") {
    proposals = [...proposals].sort(
      (a, b) => new Date(a.updated_at).getTime() - new Date(b.updated_at).getTime(),
    );
  }

  const hasFilters = !!(
    searchParams.q ||
    searchParams.status ||
    searchParams.company ||
    searchParams.industry
  );

  // Group by status for grouped view
  const byStatus = PROPOSAL_STATUSES.map((s) => ({
    status: s,
    items: proposals.filter((p) => p.status === s),
  })).filter((g) => g.items.length > 0);

  const grouped = !searchParams.q && !searchParams.sort;

  return (
    <>
      <PageHeader
        title="Proposals"
        description={`${proposals.length} sponsorship proposals · Coritiba FC`}
      />

      {/* Bulk logo upload — shown when proposals are missing logos */}
      <BulkLogoUploader
        proposals={proposals.map((p) => ({
          id: p.id,
          title: p.title,
          companyName: p.companies?.company_name ?? "—",
          hasLogo: !!(p.companies?.logo_url || (p.content?.uploaded_assets ?? []).length > 0),
        }))}
      />

      {/* Filter bar */}
      <form method="GET" className="bg-card border rounded-lg p-3 space-y-2 mb-5">
        <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground mb-1">
          <Filter className="h-3 w-3" /> Filters
        </div>
        <div className="flex flex-wrap gap-2">
          <input
            type="text"
            name="q"
            defaultValue={searchParams.q ?? ""}
            placeholder="Search proposals…"
            className="rounded-md border bg-background px-3 py-1.5 text-sm flex-1 min-w-[160px] outline-none focus:ring-1 focus:ring-ring"
          />
          <select
            name="status"
            defaultValue={searchParams.status ?? ""}
            className="rounded-md border bg-background px-3 py-1.5 text-sm outline-none"
          >
            <option value="">All statuses</option>
            {PROPOSAL_STATUSES.map((s) => (
              <option key={s} value={s}>
                {s.replace(/_/g, " ")}
              </option>
            ))}
          </select>
          <select
            name="company"
            defaultValue={searchParams.company ?? ""}
            className="rounded-md border bg-background px-3 py-1.5 text-sm outline-none"
          >
            <option value="">All companies</option>
            {companies.map((c) => (
              <option key={c.id} value={c.id}>
                {c.company_name}
              </option>
            ))}
          </select>
          <select
            name="sort"
            defaultValue={searchParams.sort ?? ""}
            className="rounded-md border bg-background px-3 py-1.5 text-sm outline-none"
          >
            <option value="">Newest first</option>
            <option value="oldest">Oldest first</option>
          </select>
        </div>
        <div className="flex gap-2 pt-1">
          <button
            type="submit"
            className="rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground"
          >
            Apply
          </button>
          {hasFilters && (
            <a href="/proposals" className="rounded-md border px-3 py-1.5 text-xs hover:bg-accent">
              Clear filters
            </a>
          )}
          <span className="ml-auto text-xs text-muted-foreground self-center">
            {proposals.length} result{proposals.length !== 1 ? "s" : ""}
          </span>
        </div>
      </form>

      {proposals.length === 0 ? (
        <EmptyState
          title={hasFilters ? "No proposals match filters" : "No proposals yet"}
          description={
            hasFilters
              ? "Try clearing your filters."
              : "Generate a campaign idea, then turn it into a proposal."
          }
        />
      ) : grouped ? (
        /* Grouped by status */
        <div className="space-y-6">
          {byStatus.map(({ status, items }) => (
            <div key={status}>
              <div className="flex items-center gap-2 mb-2">
                <StatusBadge status={status} />
                <span className="text-xs text-muted-foreground">{items.length} proposal{items.length !== 1 ? "s" : ""}</span>
              </div>
              <div className="space-y-2">
                {items.map((p) => (
                  <ProposalRow key={p.id} proposal={p} />
                ))}
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="space-y-2">
          {proposals.map((p) => (
            <ProposalRow key={p.id} proposal={p} />
          ))}
        </div>
      )}
    </>
  );
}

function ProposalRow({ proposal: p }: { proposal: ProposalRow }) {
  return (
    <Link
      href={`/proposals/${p.id}`}
      className="group flex items-center justify-between rounded-lg border bg-card p-4 hover:bg-accent hover:border-primary/30 transition-all"
    >
      <div className="flex items-center gap-3 min-w-0">
        <div className="flex-shrink-0 w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center">
          <FileText className="h-4 w-4 text-primary" />
        </div>
        <div className="min-w-0">
          <div className="font-medium group-hover:text-primary transition-colors truncate">
            {truncate(p.title, 80)}
          </div>
          <div className="text-xs text-muted-foreground mt-0.5">
            {p.companies?.company_name ?? "—"} · v{p.version} ·{" "}
            {p.companies?.industry && (
              <span className="text-blue-400">{p.companies.industry} · </span>
            )}
            {formatDate(p.updated_at)}
          </div>
        </div>
      </div>
      <div className="flex items-center gap-2 flex-shrink-0 ml-3">
        <StatusBadge status={p.status} />
        <ChevronRight className="h-4 w-4 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
      </div>
    </Link>
  );
}
