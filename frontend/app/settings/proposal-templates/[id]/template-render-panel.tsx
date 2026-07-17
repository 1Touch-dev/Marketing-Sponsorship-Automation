"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/components/ui/toaster";
import {
  Search, Loader2, Play, Building2, CheckCircle2, XCircle, Clock, ExternalLink, Sparkles,
} from "lucide-react";

type FoundCompany = { id: string; company_name: string; industry: string | null; website: string | null };

type BulkRow = {
  id: string;
  company_id: string;
  company_name: string;
  status: "pending" | "running" | "completed" | "failed";
  rendered_url: string | null;
  error: string | null;
};

type BulkState = {
  batch_id: string;
  counts: { total: number; pending: number; running: number; completed: number; failed: number };
  renders: BulkRow[];
};

const STATUS_META: Record<BulkRow["status"], { icon: JSX.Element; className: string }> = {
  pending: { icon: <Clock className="h-3.5 w-3.5" />, className: "text-muted-foreground" },
  running: { icon: <Loader2 className="h-3.5 w-3.5 animate-spin" />, className: "text-violet-600" },
  completed: { icon: <CheckCircle2 className="h-3.5 w-3.5" />, className: "text-green-600" },
  failed: { icon: <XCircle className="h-3.5 w-3.5" />, className: "text-red-600" },
};

export function TemplateRenderPanel({ templateId, templateName }: { templateId: string; templateName: string }) {
  const { toast } = useToast();

  const [industryFilter, setIndustryFilter] = useState("");
  const [companySearch, setCompanySearch] = useState("");
  const [searchLoading, setSearchLoading] = useState(false);
  const [found, setFound] = useState<FoundCompany[]>([]);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [hasSearched, setHasSearched] = useState(false);

  const [singleRendering, setSingleRendering] = useState<string | null>(null);
  const [singleResults, setSingleResults] = useState<Record<string, { url?: string; error?: string }>>({});

  const [launchingBulk, setLaunchingBulk] = useState(false);
  const [bulkState, setBulkState] = useState<BulkState | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const runSearch = useCallback(async () => {
    if (!industryFilter.trim() && !companySearch.trim()) {
      toast({ variant: "destructive", title: "Enter an industry or company name" });
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
        setFound([]);
        return;
      }
      const companies: FoundCompany[] = Array.isArray(j) ? j : (j.data ?? []);
      setFound(companies);
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
  const selectAll = () => setSelectedIds(new Set(found.map((c) => c.id)));
  const clearAll = () => setSelectedIds(new Set());

  async function renderSingle(companyId: string) {
    setSingleRendering(companyId);
    try {
      const res = await fetch(`/api/proposal-templates/${templateId}/render`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ company_id: companyId }),
      });
      const j = await res.json();
      if (!res.ok || j.status !== "completed") {
        setSingleResults((prev) => ({ ...prev, [companyId]: { error: j.error ?? "Render failed" } }));
        toast({ variant: "destructive", title: "Render failed", description: j.error });
        return;
      }
      setSingleResults((prev) => ({ ...prev, [companyId]: { url: j.rendered_url } }));
      toast({ variant: "success", title: "Rendered", description: "Presentation generated successfully." });
    } catch {
      setSingleResults((prev) => ({ ...prev, [companyId]: { error: "Network error" } }));
      toast({ variant: "destructive", title: "Network error" });
    } finally {
      setSingleRendering(null);
    }
  }

  const pollBulk = useCallback((batchId: string) => {
    if (pollRef.current) clearInterval(pollRef.current);
    pollRef.current = setInterval(async () => {
      try {
        const res = await fetch(`/api/proposal-templates/render/bulk/${batchId}`);
        if (!res.ok) return;
        const j: BulkState = await res.json();
        setBulkState(j);
        const { total, completed, failed } = j.counts;
        if (completed + failed >= total && total > 0) {
          if (pollRef.current) clearInterval(pollRef.current);
        }
      } catch { /* transient */ }
    }, 3000);
  }, []);

  useEffect(() => () => { if (pollRef.current) clearInterval(pollRef.current); }, []);

  async function launchBulk() {
    const ids = Array.from(selectedIds);
    if (ids.length === 0) {
      toast({ variant: "destructive", title: "Select at least one company" });
      return;
    }
    setLaunchingBulk(true);
    try {
      const res = await fetch(`/api/proposal-templates/${templateId}/render/bulk`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ company_ids: ids }),
      });
      const j = await res.json();
      if (!res.ok) {
        toast({ variant: "destructive", title: "Failed to launch", description: j.error });
        return;
      }
      toast({ variant: "success", title: "Bulk render launched", description: `Rendering across ${j.total} companies.` });
      setBulkState({ batch_id: j.batch_id, counts: { total: j.total, pending: j.total, running: 0, completed: 0, failed: 0 }, renders: [] });
      pollBulk(j.batch_id);
    } catch {
      toast({ variant: "destructive", title: "Network error" });
    } finally {
      setLaunchingBulk(false);
    }
  }

  const isBulkRunning = bulkState && bulkState.counts.completed + bulkState.counts.failed < bulkState.counts.total;

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-violet-500" /> Auto-customize &amp; render
          </CardTitle>
          <CardDescription>
            Find companies, then render “{templateName}” for one or many at once — text fills automatically and
            image slots generate via the AI pipeline using each company&apos;s scraped logo.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="space-y-1.5">
            <Label className="text-xs">Industry</Label>
            <Input
              value={industryFilter}
              onChange={(e) => setIndustryFilter(e.target.value)}
              placeholder="ex: Bebidas"
              onKeyDown={(e) => e.key === "Enter" && runSearch()}
              className="h-8 text-xs"
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Company name</Label>
            <Input
              value={companySearch}
              onChange={(e) => setCompanySearch(e.target.value)}
              placeholder="ex: Ambev"
              onKeyDown={(e) => e.key === "Enter" && runSearch()}
              className="h-8 text-xs"
            />
          </div>
          <Button variant="outline" size="sm" className="w-full gap-1.5" onClick={runSearch} disabled={searchLoading}>
            {searchLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Search className="h-3.5 w-3.5" />}
            Search companies
          </Button>
        </CardContent>
      </Card>

      {hasSearched && (
        <Card>
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm">{found.length} found</CardTitle>
              {found.length > 0 && (
                <div className="flex gap-1.5">
                  <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={selectAll}>All</Button>
                  <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={clearAll}>Clear</Button>
                </div>
              )}
            </div>
          </CardHeader>
          <CardContent className="p-0">
            <div className="divide-y max-h-[360px] overflow-y-auto">
              {found.map((c) => {
                const result = singleResults[c.id];
                return (
                  <div key={c.id} className="flex items-center gap-2 px-3 py-2">
                    <input
                      type="checkbox"
                      className="rounded"
                      checked={selectedIds.has(c.id)}
                      onChange={() => toggleSelect(c.id)}
                    />
                    <Building2 className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-medium truncate">{c.company_name}</p>
                      {result?.error && <p className="text-[10px] text-red-600 truncate">{result.error}</p>}
                    </div>
                    {result?.url ? (
                      <a href={result.url} target="_blank" rel="noopener noreferrer">
                        <Button size="sm" variant="outline" className="h-6 text-[10px] gap-1 px-2">
                          View <ExternalLink className="h-2.5 w-2.5" />
                        </Button>
                      </a>
                    ) : (
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-6 text-[10px] gap-1 px-2"
                        disabled={singleRendering === c.id}
                        onClick={() => renderSingle(c.id)}
                      >
                        {singleRendering === c.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <Play className="h-3 w-3" />}
                        Render
                      </Button>
                    )}
                  </div>
                );
              })}
              {found.length === 0 && (
                <p className="px-3 py-6 text-xs text-muted-foreground text-center">No companies found.</p>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {found.length > 0 && (
        <Button
          className="w-full gap-1.5 bg-violet-600 hover:bg-violet-700 text-white"
          size="sm"
          onClick={launchBulk}
          disabled={launchingBulk || selectedIds.size === 0 || !!isBulkRunning}
        >
          {launchingBulk ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
          Bulk render {selectedIds.size || ""} selected
        </Button>
      )}

      {bulkState && (
        <Card className="border-violet-200 dark:border-violet-800">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Bulk render progress</CardTitle>
            <div className="flex gap-3 text-[11px] mt-1">
              <span>Total: {bulkState.counts.total}</span>
              <span className="text-violet-600">Running: {bulkState.counts.running}</span>
              <span className="text-green-600">Done: {bulkState.counts.completed}</span>
              <span className="text-red-600">Failed: {bulkState.counts.failed}</span>
            </div>
            <div className="h-1.5 w-full rounded-full bg-muted overflow-hidden mt-1">
              <div
                className="h-full bg-violet-500 transition-all"
                style={{
                  width: `${((bulkState.counts.completed + bulkState.counts.failed) / Math.max(1, bulkState.counts.total)) * 100}%`,
                }}
              />
            </div>
          </CardHeader>
          <CardContent className="p-0">
            <div className="divide-y max-h-[320px] overflow-y-auto">
              {bulkState.renders.map((r) => {
                const meta = STATUS_META[r.status];
                return (
                  <div key={r.id} className="flex items-center gap-2 px-3 py-2">
                    <span className={meta.className}>{meta.icon}</span>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-medium truncate">{r.company_name}</p>
                      {r.error && <p className="text-[10px] text-red-600 truncate">{r.error}</p>}
                    </div>
                    {r.rendered_url && (
                      <a href={r.rendered_url} target="_blank" rel="noopener noreferrer">
                        <Button size="sm" variant="outline" className="h-6 text-[10px] gap-1 px-2">
                          View <ExternalLink className="h-2.5 w-2.5" />
                        </Button>
                      </a>
                    )}
                  </div>
                );
              })}
              {bulkState.renders.length === 0 && (
                <p className="px-3 py-4 text-xs text-muted-foreground text-center">Starting renders…</p>
              )}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
