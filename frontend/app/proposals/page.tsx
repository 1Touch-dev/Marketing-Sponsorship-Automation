import Link from "next/link";
import { supabaseAdmin } from "@/lib/supabase/server";
import { getCurrentTenant } from "@/lib/tenants/current";
import { CORITIBA_TENANT_ID } from "@/lib/tenants/types";
import { PageHeader } from "@/components/shared/page-header";
import { StatusBadge } from "@/components/shared/status-badge";
import { EmptyState } from "@/components/shared/empty-state";
import { formatDate, truncate } from "@/lib/utils";
import { Filter, FileText, ChevronRight } from "lucide-react";
import { BulkLogoUploader } from "@/components/proposals/bulk-logo-uploader";
import { PaginationControls } from "@/components/shared/pagination-controls";

export const dynamic = "force-dynamic";

const PAGE_SIZE = 50;
// Grouped-by-status is the default landing view — capped per group so it
// stays fast (found in the 2026-09-23 UX audit: this page used to fetch up
// to 300 rows and render every one of them at once). "View all" links into
// the flat, fully-paginated view scoped to that status.
const GROUP_PREVIEW_LIMIT = 8;

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

const PROPOSAL_SELECT = "id, title, status, version, updated_at, created_at, content, company_id, companies!inner(id, company_name, industry, logo_url)";

export default async function ProposalsPage({
  searchParams,
}: {
  searchParams: { q?: string; status?: string; company?: string; industry?: string; sort?: string; date_from?: string; date_to?: string; has_logo?: string; page?: string; view?: string };
}) {
  const sb = supabaseAdmin();
  const tenant = await getCurrentTenant();
  const tenantId = tenant?.id ?? CORITIBA_TENANT_ID;
  const page = Math.max(1, parseInt(searchParams.page ?? "1", 10) || 1);

  // Found in the 2026-09-23 UX audit: this page used to fetch up to 300 rows
  // and filter/sort them entirely in JS, then render every matching row at
  // once. Filtering/sorting now happens in SQL; has_logo is the one
  // exception (it depends on a JSONB array inside `content`, which isn't
  // cheaply filterable in SQL here) and stays as a post-fetch filter, same
  // as before — just now scoped to one page instead of up to 300 rows.
  function applyFilters<T>(query: T): T {
    let q = query as any; // eslint-disable-line
    q = q.eq("tenant_id", tenantId).neq("status", "rejected");
    if (searchParams.status) q = q.eq("status", searchParams.status);
    if (searchParams.company) q = q.eq("company_id", searchParams.company);
    if (searchParams.industry) q = q.ilike("companies.industry", `%${searchParams.industry.replace(/[%_]/g, "")}%`);
    if (searchParams.q) {
      const term = searchParams.q.replace(/[%_]/g, "");
      q = q.or(`title.ilike.%${term}%,companies.company_name.ilike.%${term}%`);
    }
    if (searchParams.date_from) q = q.gte("created_at", searchParams.date_from);
    if (searchParams.date_to) q = q.lte("created_at", `${searchParams.date_to}T23:59:59`);
    return q as T;
  }

  const hasFilters = !!(
    searchParams.q ||
    searchParams.status ||
    searchParams.company ||
    searchParams.industry ||
    searchParams.date_from ||
    searchParams.date_to ||
    searchParams.has_logo
  );
  // has_logo can't be expressed in SQL here (see applyFilters comment), so
  // it also forces the flat view — applying it under grouped-by-status
  // counts would make those counts wrong.
  const grouped = !searchParams.q && !searchParams.sort && !searchParams.has_logo && searchParams.view !== "all";

  const companiesResultPromise = sb.from("companies").select("id, company_name").eq("tenant_id", tenantId).neq("status", "closed").order("company_name");

  let proposals: ProposalRow[] = [];
  let totalCount = 0;
  let byStatus: Array<{ status: string; items: ProposalRow[]; totalInGroup: number }> = [];

  if (grouped) {
    const groupResults = await Promise.all(
      PROPOSAL_STATUSES.map((s) =>
        applyFilters(sb.from("proposals").select(PROPOSAL_SELECT, { count: "exact" }))
          .eq("status", s)
          .order("updated_at", { ascending: false })
          .limit(GROUP_PREVIEW_LIMIT),
      ),
    );
    byStatus = PROPOSAL_STATUSES.map((s, i) => ({
      status: s,
      items: (groupResults[i].data ?? []) as unknown as ProposalRow[],
      totalInGroup: groupResults[i].count ?? 0,
    })).filter((g) => g.totalInGroup > 0);
    totalCount = byStatus.reduce((sum, g) => sum + g.totalInGroup, 0);
    proposals = byStatus.flatMap((g) => g.items);
  } else {
    const offset = (page - 1) * PAGE_SIZE;
    const [pageResult] = await Promise.all([
      applyFilters(sb.from("proposals").select(PROPOSAL_SELECT, { count: "exact" }))
        .order("updated_at", { ascending: searchParams.sort === "oldest" })
        .range(offset, offset + PAGE_SIZE - 1),
    ]);
    proposals = (pageResult.data ?? []) as unknown as ProposalRow[];
    totalCount = pageResult.count ?? proposals.length;
  }

  const companiesResult = await companiesResultPromise;
  const companies = companiesResult.data ?? [];

  // has_logo: JS post-filter (see comment above applyFilters). Only applied
  // in the flat view — combining it with the grouped view's per-status
  // counts would make the counts lie, so has_logo implicitly falls back to
  // the flat paginated view via the filter bar's own behavior below.
  if (!grouped && searchParams.has_logo === "yes") {
    proposals = proposals.filter((p) => !!(p.companies?.logo_url || (p.content?.uploaded_assets ?? []).length > 0));
  }
  if (!grouped && searchParams.has_logo === "no") {
    proposals = proposals.filter((p) => !(p.companies?.logo_url || (p.content?.uploaded_assets ?? []).length > 0));
  }

  return (
    <>
      <PageHeader
        title="Proposals"
        description={`${totalCount} sponsorship proposals · Coritiba FC`}
        actions={
          <a
            href="/api/export/proposals"
            download
            className="inline-flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-sm font-medium hover:bg-accent transition-colors"
          >
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>
            Export CSV
          </a>
        }
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
        <div className="flex flex-wrap gap-2">
          <div className="flex items-center gap-1">
            <label className="text-xs text-muted-foreground">From:</label>
            <input type="date" name="date_from" defaultValue={searchParams.date_from ?? ""}
              className="rounded-md border bg-background px-2 py-1.5 text-sm outline-none" />
          </div>
          <div className="flex items-center gap-1">
            <label className="text-xs text-muted-foreground">To:</label>
            <input type="date" name="date_to" defaultValue={searchParams.date_to ?? ""}
              className="rounded-md border bg-background px-2 py-1.5 text-sm outline-none" />
          </div>
          <select
            name="has_logo"
            defaultValue={searchParams.has_logo ?? ""}
            className="rounded-md border bg-background px-3 py-1.5 text-sm outline-none"
          >
            <option value="">Any logo status</option>
            <option value="yes">Has logo</option>
            <option value="no">No logo uploaded</option>
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
            {totalCount} result{totalCount !== 1 ? "s" : ""}
          </span>
        </div>
      </form>

      {totalCount === 0 ? (
        <EmptyState
          title={hasFilters ? "No proposals match filters" : "No proposals yet"}
          description={
            hasFilters
              ? "Try clearing your filters."
              : "Generate a campaign idea, then turn it into a proposal."
          }
        />
      ) : grouped ? (
        /* Grouped by status — capped preview per group, "View all" drills
           into the flat paginated view scoped to that status. */
        <div className="space-y-6">
          {byStatus.map(({ status, items, totalInGroup }) => (
            <div key={status}>
              <div className="flex items-center gap-2 mb-2">
                <StatusBadge status={status} />
                <span className="text-xs text-muted-foreground">{totalInGroup} proposal{totalInGroup !== 1 ? "s" : ""}</span>
                {totalInGroup > GROUP_PREVIEW_LIMIT && (
                  <Link href={`/proposals?status=${status}&view=all`} className="text-xs text-blue-600 hover:underline ml-auto">
                    View all {totalInGroup} →
                  </Link>
                )}
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
          <PaginationControls page={page} pageSize={PAGE_SIZE} totalCount={totalCount} basePath="/proposals" searchParams={searchParams} />
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
