import Link from "next/link";
import { supabaseAdmin } from "@/lib/supabase/server";
import { PageHeader } from "@/components/shared/page-header";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { StatusBadge } from "@/components/shared/status-badge";
import { EmptyState } from "@/components/shared/empty-state";
import { formatDate } from "@/lib/utils";
import { CompanyForm } from "./company-form";

export const dynamic = "force-dynamic";

export default async function CompaniesPage() {
  const sb = supabaseAdmin();
  const { data: companies } = await sb
    .from("companies")
    .select("id, company_name, industry, status, country, created_at")
    .order("created_at", { ascending: false });

  return (
    <>
      <PageHeader title="Companies" description="Target companies for sponsorship outreach." />

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <Card className="lg:col-span-1">
          <CardHeader><CardTitle>Add company</CardTitle><CardDescription>Create a new target company.</CardDescription></CardHeader>
          <CardContent><CompanyForm /></CardContent>
        </Card>

        <div className="lg:col-span-2 space-y-3">
          {!companies || companies.length === 0 ? (
            <EmptyState title="No companies yet" description="Add a company on the left to begin generating campaigns." />
          ) : (
            companies.map((c) => (
              <Link
                key={c.id}
                href={`/campaigns?company=${c.id}`}
                className="flex items-center justify-between rounded-lg border bg-card p-4 hover:bg-accent transition-colors"
              >
                <div>
                  <div className="font-medium">{c.company_name}</div>
                  <div className="text-xs text-muted-foreground">
                    {[c.industry, c.country].filter(Boolean).join(" · ")} · added {formatDate(c.created_at)}
                  </div>
                </div>
                <StatusBadge status={c.status} />
              </Link>
            ))
          )}
        </div>
      </div>
    </>
  );
}
