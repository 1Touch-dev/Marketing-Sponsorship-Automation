import Link from "next/link";
import { supabaseAdmin } from "@/lib/supabase/server";
import { PageHeader } from "@/components/shared/page-header";
import { StatusBadge } from "@/components/shared/status-badge";
import { EmptyState } from "@/components/shared/empty-state";
import { formatDate } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { BulkImportButton } from "./bulk-import-button";
import { Building2, Globe, Calendar, Filter, Plus } from "lucide-react";

export const dynamic = "force-dynamic";

const INDUSTRIES = [
  "Automotivo", "Financeiro", "Alimentos e Bebidas", "Alimentação / Bebidas",
  "Alimentação / Restaurantes", "Saúde",
  "Construção e Imobiliário", "Comércio - Atacado e Varejo", "Energia",
  "Educação", "Transporte e Logística", "Eletroeletrônicos",
  "Papel e Celulose", "Química", "Agropecuária",
  "Siderurgia e Mineração", "Informática e Automação",
  "Máquinas e Equipamentos", "Saneamento e Serviços Públicos",
  "Madeira e Cultivo Florestal", "Açúcar e Álcool",
  "Material de Construção", "Tecnologia", "Bebidas / FMCG",
  "Beleza / Cosméticos / ESG", "Moda Esportiva",
];

export default async function CompaniesPage({
  searchParams,
}: {
  searchParams: { q?: string; industry?: string; status?: string; sort?: string; size?: string; stage?: string; country?: string };
}) {
  const sb = supabaseAdmin();
  const { data: rawCompanies } = await sb
    .from("companies")
    .select("id, company_name, industry, status, country, created_at, pipeline_stage, company_size, business_type")
    .neq("status", "closed")
    .order("created_at", { ascending: false })
    .limit(600);

  let companies = (rawCompanies ?? []) as Array<{
    id: string;
    company_name: string;
    industry: string | null;
    status: string;
    country: string | null;
    created_at: string;
    pipeline_stage: string | null;
    company_size: string | null;
    business_type: string | null;
  }>;

  if (searchParams.q) {
    const q = searchParams.q.toLowerCase();
    companies = companies.filter(
      (c) =>
        c.company_name.toLowerCase().includes(q) ||
        (c.industry ?? "").toLowerCase().includes(q) ||
        (c.country ?? "").toLowerCase().includes(q),
    );
  }
  if (searchParams.industry && !searchParams.q) {
    const ind = searchParams.industry.toLowerCase();
    companies = companies.filter((c) => (c.industry ?? "").toLowerCase().includes(ind));
  }
  if (searchParams.status) {
    companies = companies.filter((c) => c.status === searchParams.status);
  }
  if (searchParams.size) {
    companies = companies.filter((c) => c.company_size === searchParams.size);
  }
  if (searchParams.stage) {
    companies = companies.filter((c) => c.pipeline_stage === searchParams.stage);
  }
  if (searchParams.country) {
    companies = companies.filter((c) => (c.country ?? "").toLowerCase().includes(searchParams.country!.toLowerCase()));
  }
  if (searchParams.sort === "name") {
    companies = [...companies].sort((a, b) => a.company_name.localeCompare(b.company_name));
  }

  const hasFilters = !!(searchParams.q || searchParams.industry || searchParams.status || searchParams.size || searchParams.stage || searchParams.country);

  return (
    <>
      <PageHeader
        title="Companies"
        description={`${companies.length} target companies for sponsorship outreach.`}
        actions={
          <div className="flex items-center gap-2">
            <BulkImportButton />
            <Link href="/companies/new">
              <Button size="sm" className="gap-1.5">
                <Plus className="h-4 w-4" /> Add Company
              </Button>
            </Link>
          </div>
        }
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
            <option value="competitor">competitor</option>
            <option value="active">active</option>
            <option value="prospect">prospect</option>
            <option value="paused">paused</option>
          </select>
          <select
            name="size"
            defaultValue={searchParams.size ?? ""}
            className="rounded-md border bg-background px-3 py-1.5 text-sm outline-none"
          >
            <option value="">All sizes</option>
            <option value="small">Small</option>
            <option value="medium">Medium</option>
            <option value="large">Large</option>
          </select>
          <select
            name="stage"
            defaultValue={searchParams.stage ?? ""}
            className="rounded-md border bg-background px-3 py-1.5 text-sm outline-none"
          >
            <option value="">All pipeline stages</option>
            <option value="competitor">Competitor</option>
            <option value="prospect">Prospect</option>
            <option value="contacted">Contacted</option>
            <option value="negotiation">Negotiation</option>
            <option value="closed">Closed</option>
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
          <button type="submit" className="rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground">Apply</button>
          {hasFilters && <a href="/companies" className="rounded-md border px-3 py-1.5 text-xs hover:bg-accent">Clear filters</a>}
          <span className="ml-auto text-xs text-muted-foreground self-center">{companies.length} result{companies.length !== 1 ? "s" : ""}</span>
        </div>
      </form>

      {!companies || companies.length === 0 ? (
        <EmptyState
          title="No companies found"
          description={hasFilters ? "Try clearing your filters." : "Add your first company to begin generating campaigns."}
          action={<Link href="/companies/new"><Button size="sm" className="gap-1.5"><Plus className="h-4 w-4" /> Add Company</Button></Link>}
        />
      ) : (
        <div className="space-y-2">
          {companies.map((c) => (
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
                  <div className="font-medium group-hover:text-primary transition-colors">{c.company_name}</div>
                  <div className="text-xs text-muted-foreground flex flex-wrap gap-x-2 mt-0.5">
                    {c.industry && <span>{c.industry}</span>}
                    {c.business_type && <span className="text-blue-500">{c.business_type}</span>}
                    {c.company_size && <span className="capitalize">{c.company_size}</span>}
                    {c.country && <span className="inline-flex items-center gap-1"><Globe className="h-2.5 w-2.5" /> {c.country}</span>}
                    <span className="inline-flex items-center gap-1"><Calendar className="h-2.5 w-2.5" /> added {formatDate(c.created_at)}</span>
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-2 flex-shrink-0 ml-3">
                {c.pipeline_stage && (
                  <span className="text-xs px-2 py-0.5 rounded-full bg-muted text-muted-foreground capitalize hidden sm:block">
                    {c.pipeline_stage.replace(/_/g, " ")}
                  </span>
                )}
                <StatusBadge status={c.status} />
                <span className="text-xs text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity">View →</span>
              </div>
            </Link>
          ))}
        </div>
      )}
    </>
  );
}
