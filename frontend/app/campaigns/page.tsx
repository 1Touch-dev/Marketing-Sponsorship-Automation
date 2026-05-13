import { supabaseAdmin } from "@/lib/supabase/server";
import { PageHeader } from "@/components/shared/page-header";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { EmptyState } from "@/components/shared/empty-state";
import { StatusBadge } from "@/components/shared/status-badge";
import { CampaignGenerator } from "./campaign-generator";
import Link from "next/link";
import { formatDate, truncate } from "@/lib/utils";

export const dynamic = "force-dynamic";

export default async function CampaignsPage({
  searchParams,
}: {
  searchParams: { company?: string };
}) {
  const sb = supabaseAdmin();
  const [{ data: companies }, { data: campaigns }] = await Promise.all([
    sb.from("companies").select("id, company_name").order("company_name"),
    sb
      .from("campaigns")
      .select("id, title, summary, status, created_at, company_id, companies(company_name)")
      .order("created_at", { ascending: false })
      .limit(50),
  ]);

  const preselectedCompanyId = searchParams.company ?? "";

  return (
    <>
      <PageHeader title="Campaign generator" description="Generate AI sponsorship & activation ideas." />

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <Card className="lg:col-span-1">
          <CardHeader><CardTitle>Generate ideas</CardTitle><CardDescription>Pick a company and let Claude propose ideas.</CardDescription></CardHeader>
          <CardContent>
            <CampaignGenerator companies={companies ?? []} preselectedCompanyId={preselectedCompanyId} />
          </CardContent>
        </Card>

        <div className="lg:col-span-2 space-y-3">
          {!campaigns || campaigns.length === 0 ? (
            <EmptyState title="No campaigns yet" description="Generate your first sponsorship idea on the left." />
          ) : (
            campaigns.map((c: any) => (
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
                {c.summary ? <p className="text-sm mt-2 text-muted-foreground">{truncate(c.summary, 240)}</p> : null}
              </Link>
            ))
          )}
        </div>
      </div>
    </>
  );
}
