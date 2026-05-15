import { supabaseAdmin } from "@/lib/supabase/server";
import { PageHeader } from "@/components/shared/page-header";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { EmptyState } from "@/components/shared/empty-state";
import { StatusBadge } from "@/components/shared/status-badge";
import { CampaignGenerator } from "./campaign-generator";
import Link from "next/link";
import { formatDate, truncate } from "@/lib/utils";
import { Filter, Lightbulb, ArrowRight, Tag, ChevronRight } from "lucide-react";

export const dynamic = "force-dynamic";

type CampaignRow = {
  id: string;
  title: string;
  summary: string | null;
  status: string;
  created_at: string;
  company_id: string;
  companies: { id: string; company_name: string; industry: string | null } | null;
};

const STRATEGY_KEYWORDS: Record<string, string> = {
  awareness: "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300",
  engagement: "bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300",
  community: "bg-orange-100 text-orange-700 dark:bg-orange-900/40 dark:text-orange-300",
  premium: "bg-purple-100 text-purple-700 dark:bg-purple-900/40 dark:text-purple-300",
  digital: "bg-sky-100 text-sky-700 dark:bg-sky-900/40 dark:text-sky-300",
  stadium: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300",
  loyalty: "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300",
  sustainability: "bg-teal-100 text-teal-700 dark:bg-teal-900/40 dark:text-teal-300",
};

function detectStrategyTag(title: string, summary: string | null): string | null {
  const text = (title + " " + (summary ?? "")).toLowerCase();
  for (const [keyword] of Object.entries(STRATEGY_KEYWORDS)) {
    if (text.includes(keyword)) return keyword;
  }
  return null;
}

export default async function CampaignsPage({
  searchParams,
}: {
  searchParams: { company?: string; q?: string; status?: string; industry?: string; sort?: string };
}) {
  const sb = supabaseAdmin();
  const [{ data: companies }, { data: allCampaigns }] = await Promise.all([
    sb.from("companies").select("id, company_name, industry").order("company_name"),
    sb
      .from("campaigns")
      .select("id, title, summary, status, created_at, company_id, companies(id, company_name, industry)")
      .order("created_at", { ascending: false })
      .limit(200),
  ]);

  const preselectedCompanyId = searchParams.company ?? "";

  let campaigns = (allCampaigns ?? []) as unknown as CampaignRow[];

  // Filters
  if (searchParams.q) {
    const q = searchParams.q.toLowerCase();
    campaigns = campaigns.filter(
      (c) =>
        c.title.toLowerCase().includes(q) ||
        (c.companies?.company_name ?? "").toLowerCase().includes(q) ||
        (c.summary ?? "").toLowerCase().includes(q),
    );
  }
  if (searchParams.status) {
    campaigns = campaigns.filter((c) => c.status === searchParams.status);
  }
  if (searchParams.company) {
    campaigns = campaigns.filter((c) => c.companies?.id === searchParams.company);
  }
  if (searchParams.industry) {
    campaigns = campaigns.filter((c) =>
      (c.companies?.industry ?? "").toLowerCase().includes(searchParams.industry!.toLowerCase()),
    );
  }
  if (searchParams.sort === "oldest") {
    campaigns = [...campaigns].sort(
      (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime(),
    );
  }

  const hasFilters = !!(
    searchParams.q ||
    searchParams.status ||
    searchParams.company ||
    searchParams.industry
  );

  return (
    <>
      <PageHeader
        title="Campaign generator"
        description="Generate AI Coritiba FC sponsorship ideas — select one to create a proposal."
      />

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <Card className="lg:col-span-1">
          <CardHeader>
            <CardTitle>Generate ideas</CardTitle>
            <CardDescription>Pick a company and let Claude propose Coritiba FC sponsorship ideas.</CardDescription>
          </CardHeader>
          <CardContent>
            <CampaignGenerator
              companies={companies ?? []}
              preselectedCompanyId={preselectedCompanyId}
            />
          </CardContent>
        </Card>

        <div className="lg:col-span-2 space-y-3">
          {/* Filter bar */}
          <form method="GET" className="bg-card border rounded-lg p-3 space-y-2">
            <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground mb-1">
              <Filter className="h-3 w-3" /> Filters
            </div>
            <div className="flex flex-wrap gap-2">
              <input
                type="text"
                name="q"
                defaultValue={searchParams.q ?? ""}
                placeholder="Search campaigns…"
                className="rounded-md border bg-background px-3 py-1.5 text-sm flex-1 min-w-[140px] outline-none focus:ring-1 focus:ring-ring"
              />
              <select
                name="company"
                defaultValue={searchParams.company ?? ""}
                className="rounded-md border bg-background px-3 py-1.5 text-sm outline-none"
              >
                <option value="">All companies</option>
                {(companies ?? []).map((c) => (
                  <option key={c.id} value={c.id}>{c.company_name}</option>
                ))}
              </select>
              <select
                name="status"
                defaultValue={searchParams.status ?? ""}
                className="rounded-md border bg-background px-3 py-1.5 text-sm outline-none"
              >
                <option value="">All statuses</option>
                <option value="draft">draft</option>
                <option value="selected">selected</option>
                <option value="archived">archived</option>
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
                <a href="/campaigns" className="rounded-md border px-3 py-1.5 text-xs hover:bg-accent">
                  Clear
                </a>
              )}
              <span className="ml-auto text-xs text-muted-foreground self-center">
                {campaigns.length} campaign{campaigns.length !== 1 ? "s" : ""}
              </span>
            </div>
          </form>

          {campaigns.length === 0 ? (
            <EmptyState
              title={hasFilters ? "No campaigns match filters" : "No campaigns yet"}
              description={
                hasFilters
                  ? "Try clearing your filters."
                  : "Generate your first Coritiba FC sponsorship idea on the left."
              }
            />
          ) : (
            campaigns.map((c) => {
              const tag = detectStrategyTag(c.title, c.summary);
              const tagClass = tag ? STRATEGY_KEYWORDS[tag] : null;
              return (
                <div
                  key={c.id}
                  className="group rounded-xl border bg-card hover:border-primary/40 hover:bg-accent/50 transition-all overflow-hidden"
                >
                  {/* Card header */}
                  <Link href={`/campaigns/${c.id}`} className="block p-4 pb-2">
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex items-start gap-2 min-w-0">
                        <div className="mt-0.5 flex-shrink-0 w-7 h-7 rounded-full bg-primary/10 flex items-center justify-center">
                          <Lightbulb className="h-3.5 w-3.5 text-primary" />
                        </div>
                        <div className="min-w-0">
                          <div className="font-semibold text-sm group-hover:text-primary transition-colors leading-tight">
                            {c.title}
                          </div>
                          <div className="text-xs text-muted-foreground mt-0.5 flex flex-wrap gap-x-2">
                            <span>{c.companies?.company_name ?? "—"}</span>
                            {c.companies?.industry && (
                              <span className="text-blue-400">{c.companies.industry}</span>
                            )}
                            <span>{formatDate(c.created_at)}</span>
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center gap-2 flex-shrink-0">
                        <StatusBadge status={c.status} />
                      </div>
                    </div>
                    {tag && tagClass && (
                      <div className="mt-2 ml-9">
                        <span className={`inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full ${tagClass}`}>
                          <Tag className="h-2.5 w-2.5" />
                          {tag.charAt(0).toUpperCase() + tag.slice(1)} Strategy
                        </span>
                      </div>
                    )}
                    {c.summary && (
                      <p className="text-sm mt-2 ml-9 text-muted-foreground leading-relaxed">
                        {truncate(c.summary, 200)}
                      </p>
                    )}
                  </Link>

                  {/* Action footer */}
                  <div className="flex items-center gap-2 px-4 py-2.5 border-t bg-muted/30">
                    <Link
                      href={`/campaigns/${c.id}`}
                      className="text-xs text-muted-foreground hover:text-foreground transition-colors flex items-center gap-1"
                    >
                      View details <ChevronRight className="h-3 w-3" />
                    </Link>
                    <div className="flex-1" />
                    <Link
                      href={`/campaigns/${c.id}`}
                      className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground hover:bg-primary/90 transition-colors"
                    >
                      Generate Proposal <ArrowRight className="h-3 w-3" />
                    </Link>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>
    </>
  );
}
