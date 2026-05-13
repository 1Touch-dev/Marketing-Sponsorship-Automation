import Link from "next/link";
import { supabaseAdmin } from "@/lib/supabase/server";
import { PageHeader } from "@/components/shared/page-header";
import { StatusBadge } from "@/components/shared/status-badge";
import { EmptyState } from "@/components/shared/empty-state";
import { formatDate, truncate } from "@/lib/utils";

export const dynamic = "force-dynamic";

type ProposalRow = {
  id: string;
  title: string;
  status: string;
  version: number;
  updated_at: string;
  companies: { company_name: string } | null;
};

const PROPOSAL_STATUSES = [
  "draft", "under_review", "revision_requested", "approved", "scheduled", "sent", "rejected",
];

export default async function ProposalsPage({
  searchParams,
}: {
  searchParams: { q?: string; status?: string };
}) {
  const sb = supabaseAdmin();
  let query = sb
    .from("proposals")
    .select("id, title, status, version, updated_at, companies(company_name)")
    .order("updated_at", { ascending: false })
    .limit(200);

  if (searchParams.status) query = query.eq("status", searchParams.status);

  const { data } = await query;
  let proposals = (data ?? []) as unknown as ProposalRow[];

  if (searchParams.q) {
    const q = searchParams.q.toLowerCase();
    proposals = proposals.filter(
      (p) => p.title.toLowerCase().includes(q) || (p.companies?.company_name ?? "").toLowerCase().includes(q),
    );
  }

  return (
    <>
      <PageHeader title="Proposals" description="All generated sponsorship proposals." />

      {/* Search/filter bar */}
      <form method="GET" className="flex flex-wrap gap-2 mb-4">
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
            <option key={s} value={s}>{s.replace(/_/g, " ")}</option>
          ))}
        </select>
        <button
          type="submit"
          className="rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground"
        >
          Filter
        </button>
        {(searchParams.q || searchParams.status) && (
          <a href="/proposals" className="rounded-md border px-3 py-1.5 text-sm hover:bg-accent">
            Clear
          </a>
        )}
      </form>

      {proposals.length === 0 ? (
        <EmptyState
          title="No proposals yet"
          description="Generate a campaign idea, then turn it into a proposal."
        />
      ) : (
        <div className="space-y-3">
          {proposals.map((p) => (
            <Link
              key={p.id}
              href={`/proposals/${p.id}`}
              className="flex items-center justify-between rounded-lg border bg-card p-4 hover:bg-accent transition-colors"
            >
              <div>
                <div className="font-medium">{truncate(p.title, 90)}</div>
                <div className="text-xs text-muted-foreground">
                  {p.companies?.company_name ?? "—"} · v{p.version} · {formatDate(p.updated_at)}
                </div>
              </div>
              <StatusBadge status={p.status} />
            </Link>
          ))}
        </div>
      )}
    </>
  );
}
