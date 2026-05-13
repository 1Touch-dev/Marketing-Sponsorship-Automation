import Link from "next/link";
import { supabaseAdmin } from "@/lib/supabase/server";
import { PageHeader } from "@/components/shared/page-header";
import { StatusBadge } from "@/components/shared/status-badge";
import { EmptyState } from "@/components/shared/empty-state";
import { formatDate, truncate } from "@/lib/utils";

export const dynamic = "force-dynamic";

export default async function ProposalsPage() {
  const sb = supabaseAdmin();
  const { data } = await sb
    .from("proposals")
    .select("id, title, status, version, updated_at, company_id, companies(company_name)")
    .order("updated_at", { ascending: false });

  return (
    <>
      <PageHeader title="Proposals" description="All generated sponsorship proposals." />

      {!data || data.length === 0 ? (
        <EmptyState title="No proposals yet" description="Generate a campaign idea, then turn it into a proposal." />
      ) : (
        <div className="space-y-3">
          {data.map((p: any) => (
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
