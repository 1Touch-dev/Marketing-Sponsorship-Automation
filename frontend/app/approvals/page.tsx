import Link from "next/link";
import { supabaseAdmin } from "@/lib/supabase/server";
import { PageHeader } from "@/components/shared/page-header";
import { StatusBadge } from "@/components/shared/status-badge";
import { EmptyState } from "@/components/shared/empty-state";
import { formatDate, truncate } from "@/lib/utils";
import { FileText, Zap, Mail, Filter } from "lucide-react";
import { ApprovalsViewToggle } from "./approvals-view-toggle";
import type { ApprovalItem } from "./approvals-card-view";

export const dynamic = "force-dynamic";

type ApprovalProposal = {
  id: string;
  title: string;
  status: string;
  version: number;
  updated_at: string;
  company_id: string;
  content_md?: string | null;
  companies: { company_name: string } | null;
};

type ApprovalCampaign = {
  id: string;
  title: string;
  status: string;
  created_at: string;
  company_id: string;
  companies: { company_name: string } | null;
};

type ApprovalEmail = {
  id: string;
  subject: string;
  status: string;
  created_at: string;
  proposal_id: string | null;
  body_html?: string | null;
  proposals: { id: string; title: string; companies: { company_name: string } | null } | null;
};

export default async function ApprovalsPage({
  searchParams,
}: {
  searchParams: { type?: string; status?: string };
}) {
  const sb = supabaseAdmin();

  const [{ data: proposals }, { data: campaigns }, { data: emails }] = await Promise.all([
    sb
      .from("proposals")
      .select("id, title, status, version, updated_at, company_id, content_md, companies(company_name)")
      .in("status", ["under_review", "revision_requested", "draft", "approved"])
      .order("updated_at", { ascending: false })
      .limit(100),
    sb
      .from("campaigns")
      .select("id, title, status, created_at, company_id, companies(company_name)")
      .in("status", ["draft", "selected"])
      .order("created_at", { ascending: false })
      .limit(50),
    sb
      .from("emails")
      .select("id, subject, status, created_at, proposal_id, body_html, proposals(id, title, companies(company_name))")
      .in("status", ["draft", "pending_approval", "approved"])
      .order("created_at", { ascending: false })
      .limit(50),
  ]);

  const typeFilter = searchParams.type ?? "all";
  const statusFilter = searchParams.status ?? "";

  const filteredProposals = (proposals as unknown as ApprovalProposal[] ?? []).filter(
    (p) => (!statusFilter || p.status === statusFilter)
  );
  const filteredCampaigns = (campaigns as unknown as ApprovalCampaign[] ?? []).filter(
    (c) => (!statusFilter || c.status === statusFilter)
  );
  const filteredEmails = (emails as unknown as ApprovalEmail[] ?? []).filter(
    (e) => (!statusFilter || e.status === statusFilter)
  );

  const showProposals = typeFilter === "all" || typeFilter === "proposals";
  const showCampaigns = typeFilter === "all" || typeFilter === "campaigns";
  const showEmails = typeFilter === "all" || typeFilter === "emails";

  const totalCount =
    (showProposals ? filteredProposals.length : 0) +
    (showCampaigns ? filteredCampaigns.length : 0) +
    (showEmails ? filteredEmails.length : 0);

  // Build card items for the tinder-style view
  const cardItems: ApprovalItem[] = [];

  if (showProposals) {
    for (const p of filteredProposals) {
      cardItems.push({
        id: p.id,
        type: "proposal",
        title: p.title,
        company: p.companies?.company_name ?? "—",
        status: p.status,
        preview: p.content_md ? truncate(p.content_md.replace(/^#.*\n/gm, "").trim(), 200) : undefined,
        editUrl: `/proposals/${p.id}/edit`,
      });
    }
  }

  if (showCampaigns) {
    for (const c of filteredCampaigns) {
      cardItems.push({
        id: c.id,
        type: "campaign",
        title: c.title,
        company: c.companies?.company_name ?? "—",
        status: c.status,
        editUrl: `/campaigns/${c.id}`,
      });
    }
  }

  if (showEmails) {
    for (const e of filteredEmails) {
      const plainText = e.body_html
        ? e.body_html.replace(/<[^>]+>/g, "").trim()
        : undefined;
      cardItems.push({
        id: e.id,
        type: "email",
        title: e.subject ?? "Sem assunto",
        company: e.proposals?.companies?.company_name ?? "—",
        status: e.status,
        preview: plainText ? truncate(plainText, 200) : undefined,
        editUrl: `/emails/${e.id}`,
      });
    }
  }

  const listContent = totalCount === 0 ? (
    <EmptyState
      title="Nothing waiting for review"
      description="Proposals, campaigns, and emails in draft or under_review status will appear here."
    />
  ) : (
    <div className="space-y-6">
      {/* Proposals */}
      {showProposals && filteredProposals.length > 0 && (
        <section>
          <div className="flex items-center gap-2 mb-2">
            <FileText className="h-4 w-4 text-primary" />
            <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
              Proposals ({filteredProposals.length})
            </h2>
          </div>
          <div className="space-y-2">
            {filteredProposals.map((p) => (
              <Link
                key={p.id}
                href={`/proposals/${p.id}`}
                className="flex items-center justify-between rounded-lg border bg-card p-4 hover:bg-accent transition-colors"
              >
                <div>
                  <div className="font-medium text-sm">{truncate(p.title, 90)}</div>
                  <div className="text-xs text-muted-foreground">
                    {p.companies?.company_name ?? "—"} · v{p.version} · {formatDate(p.updated_at)}
                  </div>
                </div>
                <StatusBadge status={p.status} />
              </Link>
            ))}
          </div>
        </section>
      )}

      {/* Campaigns */}
      {showCampaigns && filteredCampaigns.length > 0 && (
        <section>
          <div className="flex items-center gap-2 mb-2">
            <Zap className="h-4 w-4 text-amber-500" />
            <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
              Campaigns ({filteredCampaigns.length})
            </h2>
          </div>
          <div className="space-y-2">
            {filteredCampaigns.map((c) => (
              <Link
                key={c.id}
                href={`/campaigns/${c.id}`}
                className="flex items-center justify-between rounded-lg border bg-card p-4 hover:bg-accent transition-colors"
              >
                <div>
                  <div className="font-medium text-sm">{truncate(c.title, 90)}</div>
                  <div className="text-xs text-muted-foreground">
                    {c.companies?.company_name ?? "—"} · {formatDate(c.created_at)}
                  </div>
                </div>
                <StatusBadge status={c.status} />
              </Link>
            ))}
          </div>
        </section>
      )}

      {/* Emails */}
      {showEmails && filteredEmails.length > 0 && (
        <section>
          <div className="flex items-center gap-2 mb-2">
            <Mail className="h-4 w-4 text-blue-500" />
            <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
              Emails ({filteredEmails.length})
            </h2>
          </div>
          <div className="space-y-2">
            {filteredEmails.map((e) => (
              <Link
                key={e.id}
                href={`/emails/${e.id}`}
                className="flex items-center justify-between rounded-lg border bg-card p-4 hover:bg-accent transition-colors"
              >
                <div>
                  <div className="font-medium text-sm">{truncate(e.subject ?? "No subject", 90)}</div>
                  <div className="text-xs text-muted-foreground">
                    {e.proposals?.companies?.company_name ?? "—"} · {formatDate(e.created_at)}
                  </div>
                </div>
                <StatusBadge status={e.status} />
              </Link>
            ))}
          </div>
        </section>
      )}
    </div>
  );

  return (
    <>
      <PageHeader
        title="Approval queue"
        description="Proposals, campaigns, and emails awaiting review."
      />

      {/* Filter bar */}
      <form method="GET" className="bg-card border rounded-lg p-3 mb-4 flex flex-wrap gap-2 items-center">
        <Filter className="h-3.5 w-3.5 text-muted-foreground" />
        <select
          name="type"
          defaultValue={typeFilter}
          className="rounded-md border bg-background px-2 py-1.5 text-sm outline-none"
        >
          <option value="all">All types</option>
          <option value="proposals">Proposals only</option>
          <option value="campaigns">Campaigns only</option>
          <option value="emails">Emails only</option>
        </select>
        <select
          name="status"
          defaultValue={statusFilter}
          className="rounded-md border bg-background px-2 py-1.5 text-sm outline-none"
        >
          <option value="">All statuses</option>
          <option value="draft">draft</option>
          <option value="under_review">under review</option>
          <option value="revision_requested">revision requested</option>
          <option value="approved">approved</option>
          <option value="pending_approval">pending approval</option>
        </select>
        <button
          type="submit"
          className="rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground"
        >
          Apply
        </button>
        {(typeFilter !== "all" || statusFilter) && (
          <a href="/approvals" className="rounded-md border px-3 py-1.5 text-xs hover:bg-accent">
            Clear
          </a>
        )}
        <span className="ml-auto text-xs text-muted-foreground">{totalCount} item{totalCount !== 1 ? "s" : ""}</span>
      </form>

      <ApprovalsViewToggle items={cardItems} listView={listContent} />
    </>
  );
}
