import { supabaseAdmin } from "@/lib/supabase/server";
import { PageHeader } from "@/components/shared/page-header";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { EmptyState } from "@/components/shared/empty-state";
import { StatusBadge } from "@/components/shared/status-badge";
import { CampaignGenerator } from "./campaign-generator";
import Link from "next/link";
import { formatDate, truncate } from "@/lib/utils";

export const dynamic = "force-dynamic";

type CampaignRow = {
  id: string;
  title: string;
  summary: string | null;
  status: string;
  created_at: string;
  company_id: string;
  companies: { company_name: string } | null;
};

export default async function CampaignsPage({
  searchParams,
}: {
  searchParams: { company?: string; q?: string; status?: string };
}) {
  const sb = supabaseAdmin();
  const [{ data: companies }, { data: allCampaigns }] = await Promise.all([
    sb.from("companies").select("id, company_name").order("company_name"),
    sb
      .from("campaigns")
      .select("id, title, summary, status, created_at, company_id, companies(company_name)")
      .order("created_at", { ascending: false })
      .limit(100),
  ]);

  const preselectedCompanyId = searchParams.company ?? "";

  // Client-side filtering (100 rows max, MVP-safe)
  let campaigns = (allCampaigns ?? []) as unknown as CampaignRow[];
  if (searchParams.q) {
    const q = searchParams.q.toLowerCase();
    campaigns = campaigns.filter(
      (c) =>
        c.title.toLowerCase().includes(q) ||
        c.companies?.company_name.toLowerCase().includes(q) ||
        (c.summary ?? "").toLowerCase().includes(q),
    );
  }
  if (searchParams.status) {
    campaigns = campaigns.filter((c) => c.status === searchParams.status);
  }

  return (
    <>
      <PageHeader title="Campaign generator" description="Generate AI sponsorship & activation ideas." />

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <Card className="lg:col-span-1">
          <CardHeader>
            <CardTitle>Generate ideas</CardTitle>
            <CardDescription>Pick a company and let Claude propose ideas.</CardDescription>
          </CardHeader>
          <CardContent>
            <CampaignGenerator
              companies={companies ?? []}
              preselectedCompanyId={preselectedCompanyId}
            />
          </CardContent>
        </Card>

        <div className="lg:col-span-2 space-y-3">
          {/* Search/filter bar */}
          <form method="GET" className="flex flex-wrap gap-2">
            <input
              type="text"
              name="q"
              defaultValue={searchParams.q ?? ""}
              placeholder="Search campaigns…"
              className="rounded-md border bg-background px-3 py-1.5 text-sm flex-1 min-w-[160px] outline-none focus:ring-1 focus:ring-ring"
            />
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
            <button
              type="submit"
              className="rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground"
            >
              Filter
            </button>
            {(searchParams.q || searchParams.status) && (
              <a href="/campaigns" className="rounded-md border px-3 py-1.5 text-sm hover:bg-accent">
                Clear
              </a>
            )}
          </form>

          {campaigns.length === 0 ? (
            <EmptyState
              title="No campaigns yet"
              description="Generate your first sponsorship idea on the left."
            />
          ) : (
            campaigns.map((c) => (
              <Link
                key={c.id}
                href={`/campaigns/${c.id}`}
                className="block rounded-lg border bg-card p-4 hover:bg-accent transition-colors"
              >
                <div className="flex items-center justify-between">
                  <div className="font-medium">{c.title}</div>
                  <StatusBadge status={c.status} />
                </div>
                <div className="text-xs text-muted-foreground mt-1">
                  {c.companies?.company_name ?? "—"} · {formatDate(c.created_at)}
                </div>
                {c.summary ? (
                  <p className="text-sm mt-2 text-muted-foreground">{truncate(c.summary, 240)}</p>
                ) : null}
              </Link>
            ))
          )}
        </div>
      </div>
    </>
  );
}
