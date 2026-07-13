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
  Loader2, FileText, CheckCircle2, XCircle, Building2,
  ArrowRight, Search, X, Users, AlertTriangle, Send, Pencil,
  ChevronRight, ChevronLeft, Zap, PartyPopper, Check,
} from "lucide-react";
import Link from "next/link";

const COMMON_INDUSTRIES: { label: string; pt: string }[] = [
  { label: "Automotivo", pt: "Automotivo" },
  { label: "Financeiro", pt: "Financeiro" },
  { label: "Alimentos e Bebidas", pt: "Alimentos" },
  { label: "Saúde", pt: "Saúde" },
  { label: "Construção e Imobiliário", pt: "Construção" },
  { label: "Comércio / Varejo", pt: "Comércio" },
  { label: "Energia", pt: "Energia" },
  { label: "Educação", pt: "Educação" },
  { label: "Tecnologia", pt: "Tecnologia" },
  { label: "Bebidas / FMCG", pt: "Bebidas" },
  { label: "Beleza / Cosméticos", pt: "Beleza" },
  { label: "Moda Esportiva", pt: "Moda" },
  { label: "Transporte e Logística", pt: "Transporte" },
];

type FoundCompany = {
  id: string;
  company_name: string;
  industry: string | null;
  website: string | null;
  contact_email: string | null;
};

type ProposalResult = {
  company_id: string;
  company_name: string;
  status: "pending" | "generating" | "done" | "error";
  proposal_id?: string;
  proposal_title?: string;
  error?: string;
  decision?: "send" | "skip";
};

type WizardStep = 1 | 2 | 3;

export default function BulkProposalsPage() {
  const { toast } = useToast();

  const [step, setStep] = useState<WizardStep>(1);

  // Step 1 — Company selection
  const [industryFilter, setIndustryFilter] = useState("");
  const [companySearch, setCompanySearch] = useState("");
  const [searchLoading, setSearchLoading] = useState(false);
  const [foundCompanies, setFoundCompanies] = useState<FoundCompany[]>([]);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  // Step 2 — Configuration
  const [proposalType, setProposalType] = useState<"Sponsorship" | "Barter" | "Lei de Incentivo">("Sponsorship");
  const [inventoryPackage, setInventoryPackage] = useState("");
  const [objective, setObjective] = useState("");

  // Step 3 — Generation & review queue
  const [results, setResults] = useState<ProposalResult[]>([]);
  const [generating, setGenerating] = useState(false);
  const [reviewIndex, setReviewIndex] = useState(0);
  const [sending, setSending] = useState<string | null>(null);
  const [allDone, setAllDone] = useState(false);

  const searchCompanies = useCallback(async () => {
    setSearchLoading(true);
    try {
      const params = new URLSearchParams({ limit: "50" });
      if (companySearch.trim()) params.set("search", companySearch.trim());
      if (industryFilter.trim()) params.set("industry", industryFilter.trim());
      const res = await fetch(`/api/companies?${params.toString()}`);
      if (res.ok) {
        const json = await res.json() as { data?: FoundCompany[] } | FoundCompany[];
        const arr = Array.isArray(json) ? json : (json.data ?? []);
        setFoundCompanies(arr);
      }
    } catch {
      toast({ variant: "destructive", title: "Search failed" });
    } finally {
      setSearchLoading(false);
    }
  }, [companySearch, industryFilter, toast]);

  function toggleSelect(id: string) {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function selectAll() {
    setSelectedIds(new Set(foundCompanies.map(c => c.id)));
  }

  function clearAll() {
    setSelectedIds(new Set());
  }

  async function startGeneration() {
    const companies = foundCompanies.filter(c => selectedIds.has(c.id));
    if (companies.length === 0) return;

    // Initialize results
    const initialResults: ProposalResult[] = companies.map(c => ({
      company_id: c.id,
      company_name: c.company_name,
      status: "pending",
    }));
    setResults(initialResults);
    setStep(3);
    setGenerating(true);
    setReviewIndex(0);
    setAllDone(false);

    // Generate one by one (sequential to avoid rate limits)
    for (let i = 0; i < companies.length; i++) {
      const company = companies[i];
      setResults(prev => prev.map(r =>
        r.company_id === company.id ? { ...r, status: "generating" } : r
      ));

      try {
        const res = await fetch("/api/proposals/generate-for-company", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ company_id: company.id }),
        });
        const data = await res.json() as { data?: { id?: string; title?: string }; error?: string };

        if (res.ok && data.data) {
          setResults(prev => prev.map(r =>
            r.company_id === company.id
              ? { ...r, status: "done", proposal_id: data.data!.id, proposal_title: data.data!.title }
              : r
          ));
        } else {
          setResults(prev => prev.map(r =>
            r.company_id === company.id
              ? { ...r, status: "error", error: data.error ?? "Generation failed" }
              : r
          ));
        }
      } catch (e) {
        setResults(prev => prev.map(r =>
          r.company_id === company.id
            ? { ...r, status: "error", error: String(e) }
            : r
        ));
      }
    }

    setGenerating(false);
  }

  async function sendProposal(result: ProposalResult) {
    if (!result.proposal_id) return;
    setSending(result.company_id);
    try {
      await fetch(`/api/proposals/${result.proposal_id}/approve`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ decision: "approve" }),
      });
      setResults(prev => prev.map(r =>
        r.company_id === result.company_id ? { ...r, decision: "send" } : r
      ));
      toast({ variant: "success", title: "Sent!", description: `Proposal for ${result.company_name} approved.` });
      advanceReview();
    } catch {
      toast({ variant: "destructive", title: "Failed to send" });
    } finally {
      setSending(null);
    }
  }

  function skipProposal(companyId: string) {
    setResults(prev => prev.map(r =>
      r.company_id === companyId ? { ...r, decision: "skip" } : r
    ));
    advanceReview();
  }

  function advanceReview() {
    const doneResults = results.filter(r => r.status === "done");
    const nextIndex = reviewIndex + 1;
    if (nextIndex >= doneResults.length) {
      setAllDone(true);
    } else {
      setReviewIndex(nextIndex);
    }
  }

  const selectedCompanies = foundCompanies.filter(c => selectedIds.has(c.id));
  const doneResults = results.filter(r => r.status === "done" && !r.decision);
  const currentReviewItem = doneResults[reviewIndex] ?? null;
  const sentCount = results.filter(r => r.decision === "send").length;
  const skippedCount = results.filter(r => r.decision === "skip").length;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Bulk Proposals"
        description="Generate and review personalized sponsorship proposals for multiple companies"
      />

      {/* Step indicator */}
      <div className="flex items-center gap-2">
        {([1, 2, 3] as const).map((s) => (
          <div key={s} className="flex items-center gap-2">
            <div className={`h-7 w-7 rounded-full flex items-center justify-center text-xs font-bold border-2 transition-all ${
              step === s
                ? "border-primary bg-primary text-primary-foreground"
                : step > s
                ? "border-emerald-500 bg-emerald-500 text-white"
                : "border-border text-muted-foreground"
            }`}>
              {step > s ? <Check className="h-3.5 w-3.5" /> : s}
            </div>
            <span className={`text-sm ${step === s ? "font-semibold text-foreground" : "text-muted-foreground"}`}>
              {s === 1 ? "Select Companies" : s === 2 ? "Configure" : "Review Queue"}
            </span>
            {s < 3 && <ChevronRight className="h-4 w-4 text-muted-foreground" />}
          </div>
        ))}
      </div>

      {/* ─── STEP 1 — Company selection ─── */}
      {step === 1 && (
        <div className="space-y-4">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <Search className="h-4 w-4" /> Find Companies
              </CardTitle>
              <CardDescription className="text-xs">Filter by industry and search name</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Industry filter */}
              <div>
                <Label className="text-xs">Industry</Label>
                <div className="flex flex-wrap gap-1.5 mt-1.5">
                  <button
                    onClick={() => setIndustryFilter("")}
                    className={`text-xs rounded-full px-2.5 py-1 border transition-colors ${!industryFilter ? "bg-primary text-primary-foreground border-primary" : "border-border hover:bg-accent"}`}
                  >
                    All
                  </button>
                  {COMMON_INDUSTRIES.map(ind => (
                    <button
                      key={ind.pt}
                      onClick={() => setIndustryFilter(ind.pt)}
                      className={`text-xs rounded-full px-2.5 py-1 border transition-colors ${industryFilter === ind.pt ? "bg-primary text-primary-foreground border-primary" : "border-border hover:bg-accent"}`}
                    >
                      {ind.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Search */}
              <div className="flex gap-2">
                <Input
                  placeholder="Search company name…"
                  value={companySearch}
                  onChange={e => setCompanySearch(e.target.value)}
                  onKeyDown={e => e.key === "Enter" && void searchCompanies()}
                  className="text-sm"
                />
                <Button onClick={() => void searchCompanies()} disabled={searchLoading} className="gap-1.5 shrink-0">
                  {searchLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
                  Search
                </Button>
              </div>

              {/* Results */}
              {foundCompanies.length > 0 && (
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-muted-foreground">{foundCompanies.length} companies found · {selectedIds.size} selected</span>
                    <div className="flex gap-2">
                      <Button size="sm" variant="outline" onClick={selectAll} className="text-xs h-7">Select All</Button>
                      <Button size="sm" variant="ghost" onClick={clearAll} className="text-xs h-7">Clear</Button>
                    </div>
                  </div>
                  <div className="max-h-80 overflow-y-auto space-y-1 rounded-lg border p-1">
                    {foundCompanies.map(c => (
                      <label
                        key={c.id}
                        className={`flex items-center gap-3 rounded-lg px-3 py-2.5 cursor-pointer transition-colors ${
                          selectedIds.has(c.id) ? "bg-primary/5 border border-primary/20" : "hover:bg-muted/50"
                        }`}
                      >
                        <input
                          type="checkbox"
                          checked={selectedIds.has(c.id)}
                          onChange={() => toggleSelect(c.id)}
                          className="h-4 w-4 rounded border-border"
                        />
                        <div className="min-w-0 flex-1">
                          <div className="font-medium text-sm truncate">{c.company_name}</div>
                          <div className="text-xs text-muted-foreground truncate">
                            {c.industry ?? "No industry"} · {c.contact_email ?? "No email"}
                          </div>
                        </div>
                        {!c.contact_email && (
                          <span title="Missing contact email">
                            <AlertTriangle className="h-3.5 w-3.5 text-amber-500 flex-shrink-0" />
                          </span>
                        )}
                      </label>
                    ))}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          <div className="flex justify-end">
            <Button
              onClick={() => setStep(2)}
              disabled={selectedIds.size === 0}
              className="gap-2"
            >
              Configure ({selectedIds.size} companies) <ArrowRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}

      {/* ─── STEP 2 — Configuration ─── */}
      {step === 2 && (
        <div className="space-y-4">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <FileText className="h-4 w-4" /> Proposal Configuration
              </CardTitle>
              <CardDescription className="text-xs">
                Settings applied to all {selectedIds.size} selected companies
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-5">
              <div>
                <Label>Proposal Type</Label>
                <select
                  value={proposalType}
                  onChange={e => setProposalType(e.target.value as typeof proposalType)}
                  className="w-full mt-1.5 rounded-lg border border-input bg-background px-3 py-2 text-sm"
                >
                  <option value="Sponsorship">Sponsorship</option>
                  <option value="Barter">Barter</option>
                  <option value="Lei de Incentivo">Lei de Incentivo</option>
                </select>
              </div>

              <div>
                <Label>Inventory Package (optional)</Label>
                <Input
                  value={inventoryPackage}
                  onChange={e => setInventoryPackage(e.target.value)}
                  placeholder="e.g. Premium Jersey + LED Board, or leave blank for AI to decide"
                  className="mt-1.5 text-sm"
                />
              </div>

              <div>
                <Label>Objective / Key Message (optional)</Label>
                <textarea
                  value={objective}
                  onChange={e => setObjective(e.target.value)}
                  placeholder="e.g. Focus on brand awareness for Coritiba's 2025 season campaign…"
                  rows={3}
                  className="w-full mt-1.5 rounded-lg border border-input bg-background px-3 py-2 text-sm resize-none"
                />
              </div>

              {/* Selected companies summary */}
              <div className="rounded-xl bg-muted/40 border p-3 space-y-1.5">
                <div className="flex items-center gap-2 text-sm font-medium">
                  <Users className="h-4 w-4 text-primary" />
                  {selectedIds.size} companies selected
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {selectedCompanies.slice(0, 8).map(c => (
                    <Badge key={c.id} variant="outline" className="text-xs">{c.company_name}</Badge>
                  ))}
                  {selectedCompanies.length > 8 && (
                    <Badge variant="outline" className="text-xs">+{selectedCompanies.length - 8} more</Badge>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>

          <div className="flex justify-between">
            <Button variant="outline" onClick={() => setStep(1)} className="gap-2">
              <ChevronLeft className="h-4 w-4" /> Back
            </Button>
            <Button onClick={() => void startGeneration()} className="gap-2">
              <Zap className="h-4 w-4" /> Generate {selectedIds.size} Proposals
            </Button>
          </div>
        </div>
      )}

      {/* ─── STEP 3 — Review queue ─── */}
      {step === 3 && (
        <div className="space-y-4">
          {/* Generation progress */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base flex items-center gap-2">
                <Zap className="h-4 w-4 text-amber-500" /> Generation Progress
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-3">
                {(["pending", "generating", "done", "error"] as const).map(s => {
                  const count = results.filter(r => r.status === s).length;
                  const colors: Record<string, string> = {
                    pending: "text-muted-foreground",
                    generating: "text-blue-600",
                    done: "text-emerald-600",
                    error: "text-red-600",
                  };
                  return (
                    <div key={s} className="text-center rounded-lg border p-2">
                      <div className={`text-xl font-bold ${colors[s]}`}>{count}</div>
                      <div className="text-xs text-muted-foreground capitalize">{s}</div>
                    </div>
                  );
                })}
              </div>
              {generating && (
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin text-blue-600" />
                  Generating proposals… ({results.filter(r => r.status === "done").length}/{results.length} complete)
                </div>
              )}
              {/* Progress list */}
              <div className="mt-2 max-h-40 overflow-y-auto space-y-1">
                {results.map(r => (
                  <div key={r.company_id} className="flex items-center gap-2 text-xs py-1 px-2 rounded-md">
                    {r.status === "pending" && <div className="h-3 w-3 rounded-full bg-muted flex-shrink-0" />}
                    {r.status === "generating" && <Loader2 className="h-3 w-3 animate-spin text-blue-600 flex-shrink-0" />}
                    {r.status === "done" && <CheckCircle2 className="h-3 w-3 text-emerald-600 flex-shrink-0" />}
                    {r.status === "error" && <XCircle className="h-3 w-3 text-red-500 flex-shrink-0" />}
                    <span className={`font-medium ${r.status === "error" ? "text-red-600" : ""}`}>{r.company_name}</span>
                    {r.status === "error" && <span className="text-red-500 truncate">{r.error}</span>}
                    {r.status === "done" && r.proposal_title && (
                      <span className="text-muted-foreground truncate">{r.proposal_title}</span>
                    )}
                    {r.decision === "send" && <Badge variant="outline" className="text-emerald-600 border-emerald-300 text-[10px] ml-auto">Sent ✓</Badge>}
                    {r.decision === "skip" && <Badge variant="outline" className="text-muted-foreground text-[10px] ml-auto">Skipped</Badge>}
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          {/* Tinder-style review card */}
          {!generating && (
            <div className="space-y-4">
              {allDone || doneResults.length === 0 ? (
                <div className="flex flex-col items-center gap-5 py-10">
                  <div className="h-20 w-20 rounded-full bg-emerald-100 flex items-center justify-center">
                    <PartyPopper className="h-10 w-10 text-emerald-600" />
                  </div>
                  <div className="text-center">
                    <h2 className="text-2xl font-bold">Review Complete!</h2>
                    <p className="text-muted-foreground mt-1">
                      {sentCount} approved · {skippedCount} skipped · {results.filter(r => r.status === "error").length} failed
                    </p>
                  </div>
                  <div className="flex gap-3">
                    <Button variant="outline" asChild>
                      <Link href="/proposals">View All Proposals</Link>
                    </Button>
                    <Button onClick={() => { setStep(1); setSelectedIds(new Set()); setFoundCompanies([]); setResults([]); setAllDone(false); }}>
                      Start New Batch
                    </Button>
                  </div>
                </div>
              ) : currentReviewItem ? (
                <div className="max-w-2xl mx-auto space-y-3">
                  {/* Progress */}
                  <div className="flex items-center justify-between text-sm">
                    <span className="font-medium">{reviewIndex + 1} of {doneResults.length} to review</span>
                    <span className="text-muted-foreground text-xs">{doneResults.length - reviewIndex - 1} remaining</span>
                  </div>
                  <div className="w-full h-2 bg-secondary rounded-full overflow-hidden">
                    <div
                      className="h-full bg-gradient-to-r from-indigo-500 to-emerald-500 rounded-full transition-all duration-500"
                      style={{ width: `${((reviewIndex) / doneResults.length) * 100}%` }}
                    />
                  </div>

                  {/* Review card */}
                  <Card className="shadow-lg">
                    <CardHeader className="pb-3">
                      <div className="flex items-center gap-2 mb-3">
                        <div className="h-10 w-10 rounded-xl bg-slate-100 dark:bg-slate-800 flex items-center justify-center shrink-0">
                          <Building2 className="h-5 w-5 text-slate-500" />
                        </div>
                        <div>
                          <p className="text-xs text-muted-foreground">Company</p>
                          <p className="font-semibold">{currentReviewItem.company_name}</p>
                        </div>
                        <Badge variant="outline" className="ml-auto text-emerald-600 border-emerald-300">Generated</Badge>
                      </div>
                      <CardTitle className="text-lg">{currentReviewItem.proposal_title ?? "Untitled Proposal"}</CardTitle>
                    </CardHeader>
                    <CardContent className="pt-0">
                      {currentReviewItem.proposal_id && (
                        <Link
                          href={`/proposals/${currentReviewItem.proposal_id}`}
                          target="_blank"
                          className="text-xs text-indigo-600 hover:underline flex items-center gap-1"
                        >
                          <FileText className="h-3 w-3" /> View full proposal →
                        </Link>
                      )}
                    </CardContent>
                    <div className="flex justify-center gap-3 pb-6 px-6">
                      <Button
                        variant="outline"
                        size="lg"
                        onClick={() => skipProposal(currentReviewItem.company_id)}
                        className="min-w-[110px] gap-2 text-muted-foreground"
                      >
                        <X className="h-4 w-4" /> Skip
                      </Button>
                      {currentReviewItem.proposal_id && (
                        <Button
                          variant="outline"
                          size="lg"
                          asChild
                          className="min-w-[110px] gap-2 border-amber-400 text-amber-600 hover:bg-amber-50"
                        >
                          <Link href={`/proposals/${currentReviewItem.proposal_id}/edit`} target="_blank">
                            <Pencil className="h-4 w-4" /> Edit
                          </Link>
                        </Button>
                      )}
                      <Button
                        size="lg"
                        onClick={() => void sendProposal(currentReviewItem)}
                        disabled={sending === currentReviewItem.company_id}
                        className="min-w-[120px] gap-2 bg-emerald-600 hover:bg-emerald-700 text-white"
                      >
                        {sending === currentReviewItem.company_id
                          ? <Loader2 className="h-4 w-4 animate-spin" />
                          : <Send className="h-4 w-4" />}
                        Send
                      </Button>
                    </div>
                  </Card>
                </div>
              ) : (
                <div className="text-center py-8 text-muted-foreground text-sm">
                  No proposals ready to review yet. Wait for generation to complete.
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
