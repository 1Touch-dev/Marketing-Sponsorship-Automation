"use client";

import { useState, useCallback } from "react";
import { PageHeader } from "@/components/shared/page-header";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/components/ui/toaster";
import {
  Loader2, Zap, CheckCircle2, XCircle, Building2, FileText,
  ArrowRight, Search, X, Users, AlertTriangle,
} from "lucide-react";
import Link from "next/link";

// Labels match ACTUAL Portuguese values stored in the `companies.industry` column.
// The API uses ilike(%pt%), so partial match works across variants.
const COMMON_INDUSTRIES: { label: string; pt: string }[] = [
  { label: "Automotivo", pt: "Automotivo" },
  { label: "Financeiro", pt: "Financeiro" },
  { label: "Alimentos e Bebidas", pt: "Alimentos" },
  { label: "Alimentação / Restaurantes", pt: "Alimenta" },
  { label: "Saúde", pt: "Saúde" },
  { label: "Construção e Imobiliário", pt: "Construção" },
  { label: "Comércio / Varejo", pt: "Comércio" },
  { label: "Energia", pt: "Energia" },
  { label: "Educação", pt: "Educação" },
  { label: "Transporte e Logística", pt: "Transporte" },
  { label: "Eletroeletrônicos", pt: "Eletroeletrônicos" },
  { label: "Papel e Celulose", pt: "Papel e Celulose" },
  { label: "Química", pt: "Química" },
  { label: "Agropecuária", pt: "Agropecuária" },
  { label: "Siderurgia e Mineração", pt: "Siderurgia" },
  { label: "Informática e Automação", pt: "Informática" },
  { label: "Máquinas e Equipamentos", pt: "Máquinas" },
  { label: "Saneamento e Serviços", pt: "Saneamento" },
  { label: "Madeira e Florestal", pt: "Madeira" },
  { label: "Açúcar e Álcool", pt: "Açúcar" },
  { label: "Material de Construção", pt: "Material de Construção" },
  { label: "Bebidas / FMCG", pt: "Bebidas" },
  { label: "Tecnologia", pt: "Tecnologia" },
  { label: "Beleza / Cosméticos", pt: "Beleza" },
  { label: "Moda Esportiva", pt: "Moda" },
];

type FoundCompany = {
  id: string;
  company_name: string;
  industry: string | null;
  website: string | null;
  contact_email: string | null;
  contact_name: string | null;
};

/** Check which required fields are missing for a company */
function getMissingFields(c: FoundCompany): string[] {
  const missing: string[] = [];
  if (!c.industry) missing.push("Industry");
  if (!c.website) missing.push("Website");
  if (!c.contact_email) missing.push("Contact email");
  return missing;
}

type BulkResult = {
  company_id: string;
  company_name: string;
  campaign_id?: string;
  proposal_id?: string;
  status: "success" | "error";
  error?: string;
};

export default function BulkCampaignsPage() {
  const { toast } = useToast();

  // Industry / company search
  const [industryFilter, setIndustryFilter] = useState("");
  const [companySearch, setCompanySearch] = useState("");
  const [searchLoading, setSearchLoading] = useState(false);
  const [foundCompanies, setFoundCompanies] = useState<FoundCompany[]>([]);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [hasSearched, setHasSearched] = useState(false);
  const [showIncompleteOnly, setShowIncompleteOnly] = useState(false);

  // Data completeness
  const incompleteSelected = foundCompanies
    .filter((c) => selectedIds.has(c.id) && getMissingFields(c).length > 0);
  const [confirmedIncomplete, setConfirmedIncomplete] = useState(false);

  // Generation
  const [objective, setObjective] = useState("brand awareness and fan engagement");
  const [maxCompanies, setMaxCompanies] = useState(10);
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState<BulkResult[] | null>(null);
  const [summary, setSummary] = useState<{ message: string; successful: number; failed: number } | null>(null);
  const [progress, setProgress] = useState("");

  const runSearch = useCallback(async (industry: string, q: string) => {
    if (!industry.trim() && !q.trim()) {
      toast({ variant: "destructive", title: "Enter an industry or company name to search" });
      return;
    }
    setSearchLoading(true);
    setHasSearched(true);
    try {
      const params = new URLSearchParams();
      if (industry.trim()) params.set("industry", industry.trim());
      if (q.trim()) params.set("q", q.trim());
      params.set("limit", "50");
      const res = await fetch(`/api/companies?${params}`);
      const j = await res.json();
      if (!res.ok) {
        toast({ variant: "destructive", title: j?.error ?? "Search failed" });
        setFoundCompanies([]);
        return;
      }
      const companies: FoundCompany[] = Array.isArray(j) ? j : (j.data ?? []);
      setFoundCompanies(companies);
      setConfirmedIncomplete(false);
      if (companies.length === 0) {
        toast({ variant: "destructive", title: "No companies found", description: "Try a different industry or name." });
      }
    } catch {
      toast({ variant: "destructive", title: "Search failed" });
    } finally {
      setSearchLoading(false);
    }
  }, [toast]);

  const searchCompanies = useCallback(() => {
    return runSearch(industryFilter, companySearch);
  }, [industryFilter, companySearch, runSearch]);

  const toggleSelect = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const selectAll = () => setSelectedIds(new Set(foundCompanies.map((c) => c.id)));
  const clearAll = () => setSelectedIds(new Set());

  async function run() {
    const ids = Array.from(selectedIds);
    if (ids.length === 0 && !industryFilter.trim()) {
      toast({ variant: "destructive", title: "Select companies or choose an industry first" });
      return;
    }
    setLoading(true);
    setResults(null);
    setSummary(null);
    const count = ids.length || maxCompanies;
    setProgress(`Generating campaigns for ${count} compan${count === 1 ? "y" : "ies"} (3 at a time)…`);

    try {
      const body: Record<string, unknown> = { objective, max_companies: maxCompanies };
      if (ids.length > 0) {
        body.company_ids = ids;
      } else {
        body.industry = industryFilter.trim();
      }
      const res = await fetch("/api/campaigns/bulk", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
      const j = await res.json();
      if (!res.ok) throw new Error(j?.error ?? `Failed (${res.status})`);
      setResults(j.results ?? []);
      setSummary({ message: j.message, successful: j.successful, failed: j.failed });
      toast({ variant: "success", title: `${j.successful} campaigns created!`, description: j.message });
    } catch (err) {
      toast({ variant: "destructive", title: "Bulk generation failed", description: err instanceof Error ? err.message : "Unknown" });
    } finally {
      setLoading(false);
      setProgress("");
    }
  }

  return (
    <>
      <PageHeader
        title="Bulk Campaigns"
        description="Generate Coritiba FC sponsorship campaigns for multiple companies at once"
        actions={
          <Button variant="outline" asChild>
            <Link href="/campaigns">← Back to Campaigns</Link>
          </Button>
        }
      />

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Config panel */}
        <Card className="lg:col-span-1">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Zap className="h-4 w-4 text-amber-500" /> Configuration
            </CardTitle>
            <CardDescription>
              Search by industry or company name, select which companies to target, then generate.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">

            {/* Industry quick-select */}
            <div className="space-y-1.5">
              <Label>Filter by industry</Label>
              <Input
                value={industryFilter}
                onChange={(e) => setIndustryFilter(e.target.value)}
                placeholder="ex: Automotivo, Bebidas, Tecnologia…"
              />
              <div className="flex flex-wrap gap-1 mt-1.5">
                {COMMON_INDUSTRIES.map((ind) => (
                  <button
                    key={ind.pt}
                    type="button"
                    onClick={() => {
                      setIndustryFilter(ind.pt);
                      setCompanySearch("");
                      void runSearch(ind.pt, "");
                    }}
                    className={`text-xs px-2 py-1 rounded-full border transition-colors ${
                      industryFilter === ind.pt
                        ? "bg-primary text-primary-foreground border-primary"
                        : "border-border hover:border-primary/50 hover:bg-accent"
                    }`}
                  >
                    {ind.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Company name search */}
            <div className="space-y-1.5">
              <Label>Search by company name</Label>
              <div className="flex gap-2">
                <Input
                  value={companySearch}
                  onChange={(e) => setCompanySearch(e.target.value)}
                  placeholder="ex: Ambev, Bradesco, Sicredi…"
                  onKeyDown={(e) => e.key === "Enter" && searchCompanies()}
                />
                <Button
                  variant="outline"
                  size="icon"
                  onClick={searchCompanies}
                  disabled={searchLoading}
                >
                  {searchLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
                </Button>
              </div>
            </div>

            <Button
              variant="outline"
              className="w-full gap-2"
              onClick={searchCompanies}
              disabled={searchLoading}
            >
              {searchLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
              Buscar empresas
            </Button>

            <hr />

            {/* Campaign objective */}
            <div className="space-y-1.5">
              <Label>Campaign objective</Label>
              <Input
                value={objective}
                onChange={(e) => setObjective(e.target.value)}
                placeholder="brand awareness and fan engagement"
              />
            </div>

            {selectedIds.size === 0 && (
              <div className="space-y-1.5">
                <Label>Max companies (no selection)</Label>
                <Input
                  type="number"
                  min={1}
                  max={20}
                  value={maxCompanies}
                  onChange={(e) => setMaxCompanies(Math.min(20, Math.max(1, Number(e.target.value))))}
                />
                <p className="text-xs text-muted-foreground">Used when no companies are manually selected.</p>
              </div>
            )}

            {/* Data completeness warning */}
            {selectedIds.size > 0 && incompleteSelected.length > 0 && !confirmedIncomplete && (
              <div className="rounded-lg border-2 border-amber-300 bg-amber-50 p-3 space-y-2">
                <div className="flex items-start gap-2">
                  <AlertTriangle className="h-4 w-4 text-amber-600 shrink-0 mt-0.5" />
                  <div className="text-xs text-amber-800">
                    <strong>{incompleteSelected.length} of {selectedIds.size} selected companies</strong> have missing data — AI output may be generic.
                  </div>
                </div>
                <div className="space-y-1 max-h-28 overflow-y-auto">
                  {incompleteSelected.map((c) => (
                    <div key={c.id} className="flex items-center gap-2 text-xs">
                      <span className="font-medium text-amber-900 truncate">{c.company_name}</span>
                      <span className="text-amber-600 shrink-0">
                        missing: {getMissingFields(c).join(", ")}
                      </span>
                    </div>
                  ))}
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={() => setConfirmedIncomplete(true)}
                    className="text-xs px-3 py-1.5 rounded-lg bg-amber-600 hover:bg-amber-700 text-white font-medium"
                  >
                    Continue anyway
                  </button>
                  <button
                    onClick={() => setShowIncompleteOnly(!showIncompleteOnly)}
                    className="text-xs px-3 py-1.5 rounded-lg border border-amber-400 text-amber-700 hover:bg-amber-100"
                  >
                    {showIncompleteOnly ? "Show all" : "Show incomplete only"}
                  </button>
                </div>
              </div>
            )}
            {selectedIds.size > 0 && incompleteSelected.length > 0 && confirmedIncomplete && (
              <div className="flex items-center gap-2 text-xs text-amber-700 bg-amber-50 rounded-lg border border-amber-200 px-3 py-2">
                <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
                Generating with {incompleteSelected.length} incomplete compan{incompleteSelected.length > 1 ? "ies" : "y"} — output may be generic.
              </div>
            )}

            <Button
              className="w-full gap-2 mt-2"
              onClick={run}
              disabled={loading || (selectedIds.size > 0 && incompleteSelected.length > 0 && !confirmedIncomplete)}
            >
              {loading ? (
                <><Loader2 className="h-4 w-4 animate-spin" /> Gerando…</>
              ) : (
                <><Zap className="h-4 w-4" /> Generate {selectedIds.size > 0 ? `${selectedIds.size} selected` : "Bulk"} Campaigns</>
              )}
            </Button>

            {progress && (
              <p className="text-xs text-muted-foreground text-center animate-pulse">{progress}</p>
            )}

            <div className="rounded-lg bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-800 p-3 text-xs text-amber-700 dark:text-amber-300 space-y-1">
              <p className="font-medium">What gets generated per company:</p>
              <ul className="list-disc list-inside space-y-0.5 text-amber-600 dark:text-amber-400">
                <li>Campaign strategy</li>
                <li>Full proposal with all sections</li>
                <li>3 pricing tiers</li>
                <li>3 strategy variants</li>
              </ul>
            </div>
          </CardContent>
        </Card>

        {/* Company selection + results */}
        <div className="lg:col-span-2 space-y-4">

          {/* Company search results */}
          {hasSearched && (
            <Card>
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-base flex items-center gap-2">
                    <Users className="h-4 w-4" />
                    {foundCompanies.length} empresa{foundCompanies.length !== 1 ? "s" : ""} encontrada{foundCompanies.length !== 1 ? "s" : ""}
                  </CardTitle>
                  {foundCompanies.length > 0 && (
                    <div className="flex gap-2">
                      <Button size="sm" variant="outline" onClick={selectAll}>Selecionar todas</Button>
                      {selectedIds.size > 0 && (
                        <Button size="sm" variant="ghost" onClick={clearAll}>
                          <X className="h-3.5 w-3.5 mr-1" /> Limpar ({selectedIds.size})
                        </Button>
                      )}
                    </div>
                  )}
                </div>
                {selectedIds.size > 0 && (
                  <p className="text-xs text-green-700 font-medium mt-1">
                    {selectedIds.size} empresa{selectedIds.size !== 1 ? "s" : ""} selecionada{selectedIds.size !== 1 ? "s" : ""} para geração
                  </p>
                )}
              </CardHeader>
              <CardContent className="p-0">
                {foundCompanies.length > 0 ? (
                  <div className="divide-y max-h-[420px] overflow-y-auto">
                    {foundCompanies
                      .filter((c) => !showIncompleteOnly || getMissingFields(c).length > 0)
                      .map((c) => {
                        const missing = getMissingFields(c);
                        return (
                        <label
                          key={c.id}
                          className={`flex items-center gap-3 px-4 py-2.5 cursor-pointer transition-colors hover:bg-accent ${
                            selectedIds.has(c.id) ? "bg-green-50 dark:bg-green-950/20" : ""
                          }`}
                        >
                          <input
                            type="checkbox"
                            className="rounded"
                            checked={selectedIds.has(c.id)}
                            onChange={() => toggleSelect(c.id)}
                          />
                          <Building2 className="h-4 w-4 text-muted-foreground shrink-0" />
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium truncate">{c.company_name}</p>
                            {c.industry && (
                              <p className="text-xs text-muted-foreground truncate">{c.industry}</p>
                            )}
                            {missing.length > 0 && (
                              <p className="text-[10px] text-amber-600 mt-0.5 flex items-center gap-1">
                                <AlertTriangle className="h-2.5 w-2.5" />
                                Missing: {missing.join(", ")}
                              </p>
                            )}
                          </div>
                          {selectedIds.has(c.id) && (
                            <Badge variant="default" className="text-xs bg-green-600">✓</Badge>
                          )}
                        </label>
                        );
                      })}
                  </div>
                ) : (
                  <p className="px-4 py-6 text-sm text-muted-foreground text-center">
                    Nenhuma empresa encontrada. Tente outro filtro.
                  </p>
                )}
              </CardContent>
            </Card>
          )}

          {/* Generation summary */}
          {summary && (
            <Card className={summary.failed === 0 ? "border-green-200 bg-green-50 dark:bg-green-950/20" : "border-amber-200 bg-amber-50 dark:bg-amber-950/20"}>
              <CardContent className="pt-4">
                <p className="font-semibold text-sm">{summary.message}</p>
                <div className="flex gap-4 mt-2 text-xs">
                  <span className="flex items-center gap-1 text-green-700">
                    <CheckCircle2 className="h-3.5 w-3.5" /> {summary.successful} succeeded
                  </span>
                  {summary.failed > 0 && (
                    <span className="flex items-center gap-1 text-red-600">
                      <XCircle className="h-3.5 w-3.5" /> {summary.failed} failed
                    </span>
                  )}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Results list */}
          {results && results.length > 0 && (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base">Results</CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                <div className="divide-y">
                  {results.map((r) => (
                    <div key={r.company_id} className="flex items-center gap-3 px-4 py-3">
                      {r.status === "success" ? (
                        <CheckCircle2 className="h-4 w-4 text-green-600 shrink-0" />
                      ) : (
                        <XCircle className="h-4 w-4 text-red-500 shrink-0" />
                      )}
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate">{r.company_name}</p>
                        {r.error && <p className="text-xs text-red-500 truncate">{r.error}</p>}
                      </div>
                      {r.status === "success" && (
                        <div className="flex gap-2 shrink-0">
                          {r.campaign_id && (
                            <Link href={`/campaigns/${r.campaign_id}`}>
                              <Button size="sm" variant="ghost" className="gap-1 h-7 text-xs">
                                <Zap className="h-3 w-3" /> Campaign
                              </Button>
                            </Link>
                          )}
                          {r.proposal_id && (
                            <Link href={`/proposals/${r.proposal_id}`}>
                              <Button size="sm" variant="outline" className="gap-1 h-7 text-xs">
                                <FileText className="h-3 w-3" /> Proposal
                                <ArrowRight className="h-3 w-3" />
                              </Button>
                            </Link>
                          )}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          {!hasSearched && !loading && (
            <div className="flex flex-col items-center justify-center rounded-xl border-2 border-dashed border-border py-16 text-center">
              <Search className="h-10 w-10 text-muted-foreground mb-3" />
              <p className="font-medium text-muted-foreground">Search for companies to get started</p>
              <p className="text-sm text-muted-foreground mt-1">
                Filter by industry or type a company name, then select which ones to generate campaigns for.
              </p>
            </div>
          )}
        </div>
      </div>
    </>
  );
}
