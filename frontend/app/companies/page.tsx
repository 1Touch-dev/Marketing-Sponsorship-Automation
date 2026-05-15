import Link from "next/link";
import { supabaseAdmin } from "@/lib/supabase/server";
import { PageHeader } from "@/components/shared/page-header";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { StatusBadge } from "@/components/shared/status-badge";
import { EmptyState } from "@/components/shared/empty-state";
import { formatDate } from "@/lib/utils";
import { CompanyForm } from "./company-form";
import { BulkImportButton } from "./bulk-import-button";
import { Building2, Globe, Calendar, Filter } from "lucide-react";

export const dynamic = "force-dynamic";

const INDUSTRIES = [
  "Automotive", "Banking / Finance", "Construction", "Education",
  "Energy / Sustainability", "FMCG / Food & Beverage", "Health / Wellness",
  "Insurance", "Logistics", "Real Estate", "Retail", "Technology",
  "Technology / Education", "Telecommunications", "Tourism / Hospitality",
];

export default async function CompaniesPage({
  searchParams,
}: {
  searchParams: { q?: string; industry?: string; status?: string; sort?: string };
}) {
  const sb = supabaseAdmin();
  const { data: rawCompanies } = await sb
    .from("companies")
    .select("id, company_name, industry, status, country, created_at")
    .order("created_at", { ascending: false })
    .limit(300);

  let companies = (rawCompanies ?? []) as Array<{
    id: string;
    company_name: string;
    industry: string | null;
    status: string;
    country: string | null;
    created_at: string;
  }>;

  // Apply filters
  if (searchParams.q) {
    const q = searchParams.q.toLowerCase();
    companies = companies.filter(
      (c) =>
        c.company_name.toLowerCase().includes(q) ||
        (c.industry ?? "").toLowerCase().includes(q) ||
        (c.country ?? "").toLowerCase().includes(q),
    );
  }
  if (searchParams.industry) {
    companies = companies.filter((c) => c.industry === searchParams.industry);
  }
  if (searchParams.status) {
    companies = companies.filter((c) => c.status === searchParams.status);
  }

  // Sort
  if (searchParams.sort === "name") {
    companies = [...companies].sort((a, b) => a.company_name.localeCompare(b.company_name));
  }

  const hasFilters = !!(searchParams.q || searchParams.industry || searchParams.status);

  return (
    <>
      <PageHeader
        title="Companies"
        description={`${companies.length} target companies for sponsorship outreach.`}
        actions={<BulkImportButton />}
      />

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <Card className="lg:col-span-1">
          <CardHeader>
            <CardTitle>Add company</CardTitle>
            <CardDescription>Create a new target company.</CardDescription>
          </CardHeader>
          <CardContent>
            <CompanyForm />
          </CardContent>
        </Card>

        <div className="lg:col-span-2 space-y-4">
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
                placeholder="Search companies…"
                className="rounded-md border bg-background px-3 py-1.5 text-sm flex-1 min-w-[160px] outline-none focus:ring-1 focus:ring-ring"
              />
              <select
                name="industry"
                defaultValue={searchParams.industry ?? ""}
                className="rounded-md border bg-background px-3 py-1.5 text-sm outline-none"
              >
                <option value="">All industries</option>
                {INDUSTRIES.map((i) => (
                  <option key={i} value={i}>{i}</option>
                ))}
              </select>
              <select
                name="status"
                defaultValue={searchParams.status ?? ""}
                className="rounded-md border bg-background px-3 py-1.5 text-sm outline-none"
              >
                <option value="">All statuses</option>
                <option value="active">active</option>
                <option value="inactive">inactive</option>
                <option value="prospect">prospect</option>
              </select>
              <select
                name="sort"
                defaultValue={searchParams.sort ?? ""}
                className="rounded-md border bg-background px-3 py-1.5 text-sm outline-none"
              >
                <option value="">Newest first</option>
                <option value="name">A–Z name</option>
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
                <a
                  href="/companies"
                  className="rounded-md border px-3 py-1.5 text-xs hover:bg-accent"
                >
                  Clear filters
                </a>
              )}
              <span className="ml-auto text-xs text-muted-foreground self-center">
                {companies.length} result{companies.length !== 1 ? "s" : ""}
              </span>
            </div>
          </form>

          {!companies || companies.length === 0 ? (
            <EmptyState
              title="No companies found"
              description={
                hasFilters
                  ? "Try clearing your filters."
                  : "Add a company on the left to begin generating campaigns."
              }
            />
          ) : (
            companies.map((c) => (
              <Link
                key={c.id}
                href={`/companies/${c.id}`}
                className="group flex items-start justify-between rounded-lg border bg-card p-4 hover:bg-accent hover:border-primary/30 transition-all"
              >
                <div className="flex items-start gap-3 min-w-0">
                  <div className="mt-0.5 flex-shrink-0 w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center">
                    <Building2 className="h-4 w-4 text-primary" />
                  </div>
                  <div className="min-w-0">
                    <div className="font-medium group-hover:text-primary transition-colors">
                      {c.company_name}
                    </div>
                    <div className="text-xs text-muted-foreground flex flex-wrap gap-x-2 mt-0.5">
                      {c.industry && (
                        <span className="inline-flex items-center gap-1">
                          <span className="w-1.5 h-1.5 rounded-full bg-blue-400 inline-block" />
                          {c.industry}
                        </span>
                      )}
                      {c.country && (
                        <span className="inline-flex items-center gap-1">
                          <Globe className="h-2.5 w-2.5" /> {c.country}
                        </span>
                      )}
                      <span className="inline-flex items-center gap-1">
                        <Calendar className="h-2.5 w-2.5" /> added {formatDate(c.created_at)}
                      </span>
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-2 flex-shrink-0 ml-3">
                  <StatusBadge status={c.status} />
                  <span className="text-xs text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity">
                    View →
                  </span>
                </div>
              </Link>
            ))
          )}
        </div>
      </div>
    </>
  );
}
