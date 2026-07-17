"use client";

import { useState, useCallback, useRef, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/components/ui/toaster";
import {
  Loader2, Bot, Search, Users, Building2, X, Play,
  CheckCircle2, XCircle, Clock, ExternalLink, FileText, Mail,
} from "lucide-react";
import Link from "next/link";

type FoundCompany = {
  id: string;
  company_name: string;
  industry: string | null;
  website: string | null;
};

type BatchCompanyStatus = {
  run_id: string;
  company_id: string;
  company_name: string;
  status: string;
  proposal_id: string | null;
  proposal_title: string | null;
  email_id: string | null;
  pipedrive_activity_id: number | null;
  error: string | null;
  updated_at: string;
};

type BatchState = {
  batch: {
    id: string;
    status: string;
    total_count: number;
    queued_count: number;
    running_count: number;
    done_count: number;
    failed_count: number;
    mode: string;
  };
  companies: BatchCompanyStatus[];
};

const STATUS_META: Record<string, { icon: React.ReactNode; label: string; className: string }> = {
  running: { icon: <Loader2 className="h-3.5 w-3.5 animate-spin" />, label: "Running", className: "text-violet-600" },
  completed: { icon: <CheckCircle2 className="h-3.5 w-3.5" />, label: "Completed", className: "text-green-600" },
  paused_for_proposal_approval: { icon: <Clock className="h-3.5 w-3.5" />, label: "Auto-approved & drafting email", className: "text-blue-600" },
  paused_for_approval: { icon: <Mail className="h-3.5 w-3.5" />, label: "Email drafted (pending review)", className: "text-amber-600" },
  failed: { icon: <XCircle className="h-3.5 w-3.5" />, label: "Failed", className: "text-red-600" },
  cancelled: { icon: <XCircle className="h-3.5 w-3.5" />, label: "Cancelled", className: "text-muted-foreground" },
};

export function OutreachBatchRunner({
  campaignId,
  campaignTitle,
  defaultIndustry,
}: {
  campaignId: string;
  campaignTitle: string;
  defaultIndustry: string;
}) {
  const { toast } = useToast();

  const [industryFilter, setIndustryFilter] = useState(defaultIndustry);
  const [companySearch, setCompanySearch] = useState("");
  const [searchLoading, setSearchLoading] = useState(false);
  const [foundCompanies, setFoundCompanies] = useState<FoundCompany[]>([]);
  const [hasSearched, setHasSearched] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  const [launching, setLaunching] = useState(false);
  const [batchState, setBatchState] = useState<BatchState | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const runSearch = useCallback(async () => {
    if (!industryFilter.trim() && !companySearch.trim()) {
      toast({ variant: "destructive", title: "Enter an industry or company name to search" });
      return;
    }
    setSearchLoading(true);
    setHasSearched(true);
    try {
      const params = new URLSearchParams();
      if (industryFilter.trim()) params.set("industry", industryFilter.trim());
      if (companySearch.trim()) params.set("q", companySearch.trim());
      params.set("limit", "100");
      const res = await fetch(`/api/companies?${params}`);
      const j = await res.json();
      if (!res.ok) {
        toast({ variant: "destructive", title: j?.error ?? "Search failed" });
        setFoundCompanies([]);
        return;
      }
      const companies: FoundCompany[] = Array.isArray(j) ? j : (j.data ?? []);
      const withWebsite = companies.filter((c) => !!c.website);
      setFoundCompanies(withWebsite);
      if (withWebsite.length === 0) {
        toast({ variant: "destructive", title: "No companies with a website found", description: "The agent needs a domain to enrich contacts." });
      }
    } catch {
      toast({ variant: "destructive", title: "Search failed" });
    } finally {
      setSearchLoading(false);
    }
  }, [industryFilter, companySearch, toast]);

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

  const pollBatch = useCallback((batchId: string) => {
    if (pollRef.current) clearInterval(pollRef.current);
    pollRef.current = setInterval(async () => {
      try {
        const res = await fetch(`/api/agents/outreach/batch/${batchId}`);
        if (!res.ok) return;
        const j: BatchState = await res.json();
        setBatchState(j);
        if (j.batch.status === "completed" || j.batch.status === "failed" || j.batch.status === "cancelled") {
          if (pollRef.current) clearInterval(pollRef.current);
        }
      } catch { /* ignore transient poll errors */ }
    }, 3000);
  }, []);

  useEffect(() => () => { if (pollRef.current) clearInterval(pollRef.current); }, []);

  async function launchBatch() {
    const ids = Array.from(selectedIds);
    if (ids.length === 0) {
      toast({ variant: "destructive", title: "Select at least one company" });
      return;
    }
    setLaunching(true);
    try {
      const res = await fetch("/api/agents/outreach/batch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ campaign_id: campaignId, company_ids: ids, mode: "auto" }),
      });
      const j = await res.json();
      if (!res.ok) {
        toast({ variant: "destructive", title: "Failed to launch batch", description: j.error });
        return;
      }
      toast({
        variant: "success",
        title: "Batch launched",
        description: `Running the Outreach Agent across ${j.total} compan${j.total !== 1 ? "ies" : "y"}${j.skipped ? ` (${j.skipped} skipped — no domain)` : ""}.`,
      });
      setBatchState({
        batch: {
          id: j.batch_id,
          status: "running",
          total_count: j.total,
          queued_count: j.total,
          running_count: 0,
          done_count: 0,
          failed_count: 0,
          mode: j.mode,
        },
        companies: [],
      });
      pollBatch(j.batch_id);
    } catch {
      toast({ variant: "destructive", title: "Network error", description: "Could not reach server." });
    } finally {
      setLaunching(false);
    }
  }

  const isRunningBatch = batchState && batchState.batch.status === "running";

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
      {/* Config panel */}
      <Card className="lg:col-span-1">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Bot className="h-4 w-4 text-violet-500" /> Select companies
          </CardTitle>
          <CardDescription>
            Companies need a website/domain for the agent to enrich contacts. Auto-run mode skips the
            proposal-approval pause (still stops before sending email).
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-1.5">
            <Label>Filter by industry</Label>
            <Input
              value={industryFilter}
              onChange={(e) => setIndustryFilter(e.target.value)}
              placeholder="ex: Automotivo, Bebidas, Tecnologia…"
              onKeyDown={(e) => e.key === "Enter" && runSearch()}
            />
          </div>
          <div className="space-y-1.5">
            <Label>Search by company name</Label>
            <div className="flex gap-2">
              <Input
                value={companySearch}
                onChange={(e) => setCompanySearch(e.target.value)}
                placeholder="ex: Ambev, Bradesco…"
                onKeyDown={(e) => e.key === "Enter" && runSearch()}
              />
              <Button variant="outline" size="icon" onClick={runSearch} disabled={searchLoading}>
                {searchLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
              </Button>
            </div>
          </div>
          <Button variant="outline" className="w-full gap-2" onClick={runSearch} disabled={searchLoading}>
            {searchLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
            Buscar empresas
          </Button>

          <hr />

          <Button
            className="w-full gap-2 bg-violet-600 hover:bg-violet-700 text-white"
            onClick={launchBatch}
            disabled={launching || selectedIds.size === 0 || !!isRunningBatch}
          >
            {launching ? (
              <><Loader2 className="h-4 w-4 animate-spin" /> Launching…</>
            ) : (
              <><Play className="h-4 w-4" /> Run Agent on {selectedIds.size || ""} selected</>
            )}
          </Button>
          {isRunningBatch && (
            <p className="text-xs text-muted-foreground text-center">
              A batch is already running — wait for it to finish before launching another.
            </p>
          )}

          <div className="rounded-lg bg-violet-50 dark:bg-violet-950/20 border border-violet-200 dark:border-violet-800 p-3 text-xs text-violet-700 dark:text-violet-300 space-y-1">
            <p className="font-medium">Per company, the agent will:</p>
            <ul className="list-disc list-inside space-y-0.5 text-violet-600 dark:text-violet-400">
              <li>Enrich contacts &amp; scrape intelligence</li>
              <li>Generate a personalized proposal for &ldquo;{campaignTitle}&rdquo;</li>
              <li>Auto-approve the proposal (pre-approved campaign)</li>
              <li>Draft an outreach email — <strong>held for human review</strong> before sending</li>
            </ul>
          </div>
        </CardContent>
      </Card>

      {/* Company selection + batch progress */}
      <div className="lg:col-span-2 space-y-4">
        {batchState && (
          <Card className="border-violet-200 dark:border-violet-800">
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between">
                <CardTitle className="text-base flex items-center gap-2">
                  <Bot className="h-4 w-4 text-violet-500" /> Batch progress
                </CardTitle>
                <span className={`text-xs font-medium ${
                  batchState.batch.status === "completed" ? "text-green-600" :
                  batchState.batch.status === "failed" ? "text-red-600" : "text-violet-600"
                }`}>
                  {batchState.batch.status}
                </span>
              </div>
              <div className="flex gap-4 text-xs mt-1">
                <span>Total: {batchState.batch.total_count}</span>
                <span className="text-violet-600">Running: {batchState.batch.running_count}</span>
                <span className="text-green-600">Done: {batchState.batch.done_count}</span>
                <span className="text-red-600">Failed: {batchState.batch.failed_count}</span>
                <span className="text-muted-foreground">Queued: {batchState.batch.queued_count}</span>
              </div>
              <div className="h-1.5 w-full rounded-full bg-muted overflow-hidden mt-1">
                <div
                  className="h-full bg-violet-500 transition-all"
                  style={{
                    width: `${((batchState.batch.done_count + batchState.batch.failed_count) / Math.max(1, batchState.batch.total_count)) * 100}%`,
                  }}
                />
              </div>
            </CardHeader>
            <CardContent className="p-0">
              {batchState.companies.length === 0 ? (
                <p className="px-4 py-4 text-xs text-muted-foreground">Starting agent runs…</p>
              ) : (
                <div className="divide-y max-h-[480px] overflow-y-auto">
                  {batchState.companies.map((c) => {
                    const meta = STATUS_META[c.status] ?? { icon: <Clock className="h-3.5 w-3.5" />, label: c.status, className: "text-muted-foreground" };
                    return (
                      <div key={c.run_id} className="flex items-center gap-3 px-4 py-2.5">
                        <span className={`shrink-0 ${meta.className}`}>{meta.icon}</span>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium truncate">{c.company_name}</p>
                          <p className={`text-xs truncate ${meta.className}`}>
                            {meta.label}
                            {c.error ? ` — ${c.error}` : ""}
                          </p>
                        </div>
                        <div className="flex gap-2 shrink-0">
                          {c.proposal_id && (
                            <Link href={`/proposals/${c.proposal_id}`} target="_blank">
                              <Button size="sm" variant="ghost" className="gap-1 h-7 text-xs">
                                <FileText className="h-3 w-3" /> Proposal
                              </Button>
                            </Link>
                          )}
                          {c.email_id && (
                            <Link href={`/emails`} target="_blank">
                              <Button size="sm" variant="outline" className="gap-1 h-7 text-xs">
                                <Mail className="h-3 w-3" /> Email <ExternalLink className="h-3 w-3" />
                              </Button>
                            </Link>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>
        )}

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
                  {selectedIds.size} empresa{selectedIds.size !== 1 ? "s" : ""} selecionada{selectedIds.size !== 1 ? "s" : ""}
                </p>
              )}
            </CardHeader>
            <CardContent className="p-0">
              {foundCompanies.length > 0 ? (
                <div className="divide-y max-h-[420px] overflow-y-auto">
                  {foundCompanies.map((c) => (
                    <label
                      key={c.id}
                      className={`flex items-center gap-3 px-4 py-2.5 cursor-pointer transition-colors hover:bg-accent ${
                        selectedIds.has(c.id) ? "bg-violet-50 dark:bg-violet-950/20" : ""
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
                        <p className="text-xs text-muted-foreground truncate">
                          {c.industry ?? "—"} · {c.website}
                        </p>
                      </div>
                    </label>
                  ))}
                </div>
              ) : (
                <p className="px-4 py-6 text-sm text-muted-foreground text-center">
                  Nenhuma empresa encontrada com website cadastrado.
                </p>
              )}
            </CardContent>
          </Card>
        )}

        {!hasSearched && !batchState && (
          <div className="flex flex-col items-center justify-center rounded-xl border-2 border-dashed border-border py-16 text-center">
            <Search className="h-10 w-10 text-muted-foreground mb-3" />
            <p className="font-medium text-muted-foreground">Search for companies to get started</p>
            <p className="text-sm text-muted-foreground mt-1">
              Filter by industry or type a company name, then select which ones to run the agent on.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
