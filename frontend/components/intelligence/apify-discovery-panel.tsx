"use client";

import React, { useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Zap, Building2, TrendingUp, Loader2, Package, RefreshCw,
} from "lucide-react";

type DiscoveredCompetitor = {
  name: string; domain?: string; relationship: string;
  sponsorship_likelihood: number; sports_partnership_probability: number;
  geographic_reach: string; business_type: string; why_relevant: string;
};

type Brand = {
  name: string; domain?: string; category?: string; products_services?: string;
  locality?: string; business_type?: string; sponsorship_fit?: number;
  barter_potential?: boolean; estimated_size?: string; why_good_prospect?: string;
  why_interesting?: string; sponsorship_active?: boolean; sponsorship_likelihood?: number;
};

type DiscoveryResult = {
  competitors?: DiscoveredCompetitor[];
  keyword_clusters?: string[];
  market_categories?: string[];
  sponsorship_landscape?: string;
  industry_graph?: { adjacent_industries?: string[]; suppliers?: string[] };
  coritiba_positioning?: { unique_angle?: string; top_prospects?: string[] };
  apify_used?: boolean;
};

type IndustryResult = {
  brands?: Brand[];
  keywords?: string[];
  apify_used?: boolean;
};

type GoodsResult = {
  companies?: Brand[];
  market_keywords?: string[];
  related_categories?: string[];
  apify_used?: boolean;
};

type Props = {
  companyId: string;
  companyName: string;
  industry?: string | null;
  website?: string | null;
  existingIntelligence?: Record<string, unknown> | null;
};

type ActivePanel = "discover" | "industry" | "goods" | null;

export function ApifyDiscoveryPanel({ companyId, companyName, industry, website, existingIntelligence }: Props) {
  const [active, setActive] = useState<ActivePanel>(null);
  const [loading, setLoading] = useState(false);
  const [discoveryResult, setDiscoveryResult] = useState<DiscoveryResult | null>(
    existingIntelligence?.competitor_discovery
      ? ((existingIntelligence.competitor_discovery as Record<string, unknown>).data as DiscoveryResult)
      : null
  );
  const [industryResult, setIndustryResult] = useState<IndustryResult | null>(
    existingIntelligence?.industry_expansion as IndustryResult | null
  );
  const [goodsQuery, setGoodsQuery] = useState("");
  const [goodsResult, setGoodsResult] = useState<GoodsResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function runDiscovery(force = false) {
    setLoading(true); setActive("discover"); setError(null);
    try {
      const res = await fetch("/api/intelligence/discover", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ company_id: companyId, force_refresh: force, background: false }),
      });
      const d = await res.json() as DiscoveryResult & { error?: string };
      if (!res.ok) throw new Error(d.error ?? "Discovery failed");
      setDiscoveryResult(d);
    } catch (e) { setError(e instanceof Error ? e.message : "Failed"); setActive(null); }
    finally { setLoading(false); }
  }

  async function runIndustryExpand() {
    if (!industry) { setError("No industry set for this company"); return; }
    setLoading(true); setActive("industry"); setError(null);
    try {
      const res = await fetch("/api/intelligence/industry-expand", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ industry, company_id: companyId, scope: "national" }),
      });
      const d = await res.json() as IndustryResult & { error?: string };
      if (!res.ok) throw new Error(d.error ?? "Failed");
      setIndustryResult(d);
    } catch (e) { setError(e instanceof Error ? e.message : "Failed"); setActive(null); }
    finally { setLoading(false); }
  }

  async function runGoodsSearch() {
    if (!goodsQuery.trim()) return;
    setLoading(true); setActive("goods"); setError(null);
    try {
      const res = await fetch("/api/intelligence/goods-search", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ query: goodsQuery, location: "Brasil" }),
      });
      const d = await res.json() as GoodsResult & { error?: string };
      if (!res.ok) throw new Error(d.error ?? "Failed");
      setGoodsResult(d);
    } catch (e) { setError(e instanceof Error ? e.message : "Failed"); setActive(null); }
    finally { setLoading(false); }
  }

  return (
    <div className="space-y-4">
      {/* Action Buttons */}
      <div className="flex flex-wrap gap-2">
        <Button size="sm" variant={discoveryResult ? "outline" : "default"} onClick={() => runDiscovery(false)} disabled={loading} className="gap-1.5">
          {loading && active === "discover" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Zap className="h-3.5 w-3.5" />}
          {discoveryResult ? "Re-run Discovery" : "Run Autonomous Discovery"}
        </Button>
        <Button size="sm" variant="outline" onClick={runIndustryExpand} disabled={loading || !industry} className="gap-1.5">
          {loading && active === "industry" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <TrendingUp className="h-3.5 w-3.5" />}
          Expand Industry
        </Button>
        {discoveryResult && (
          <Button size="sm" variant="ghost" onClick={() => runDiscovery(true)} disabled={loading} className="gap-1 text-xs text-muted-foreground">
            <RefreshCw className="h-3 w-3" /> Refresh
          </Button>
        )}
      </div>

      {/* Goods Search */}
      <div className="flex gap-2">
        <input
          value={goodsQuery} onChange={(e) => setGoodsQuery(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") runGoodsSearch(); }}
          placeholder="Find by goods/services… e.g. energy drinks, uniforms, tech"
          className="flex-1 text-xs border rounded-lg px-3 py-1.5 bg-card outline-none focus:ring-2 ring-primary/30"
        />
        <Button size="sm" onClick={runGoodsSearch} disabled={loading || !goodsQuery.trim()} className="gap-1.5">
          {loading && active === "goods" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Package className="h-3.5 w-3.5" />}
          Find Companies
        </Button>
      </div>

      {error && <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{error}</p>}

      {/* Loading state */}
      {loading && (
        <div className="flex items-center gap-3 p-4 rounded-xl border bg-muted/30">
          <Loader2 className="h-5 w-5 animate-spin text-primary flex-shrink-0" />
          <div>
            <p className="text-sm font-medium">Running Apify commercial intelligence…</p>
            <p className="text-xs text-muted-foreground">Searching web + AI enrichment — this may take up to 60 seconds</p>
          </div>
        </div>
      )}

      {/* Tab selector when results exist */}
      {(discoveryResult || industryResult || goodsResult) && !loading && (
        <div className="flex gap-1 flex-wrap">
          {discoveryResult && <button onClick={() => setActive("discover")} className={`px-3 py-1 rounded-md text-xs font-medium transition-colors ${active === "discover" ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground hover:bg-accent"}`}>Competitors ({discoveryResult.competitors?.length ?? 0})</button>}
          {industryResult && <button onClick={() => setActive("industry")} className={`px-3 py-1 rounded-md text-xs font-medium transition-colors ${active === "industry" ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground hover:bg-accent"}`}>Industry ({industryResult.brands?.length ?? 0})</button>}
          {goodsResult && <button onClick={() => setActive("goods")} className={`px-3 py-1 rounded-md text-xs font-medium transition-colors ${active === "goods" ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground hover:bg-accent"}`}>Goods ({goodsResult.companies?.length ?? 0})</button>}
        </div>
      )}

      {/* Competitor Discovery Results */}
      {active === "discover" && discoveryResult && !loading && (
        <div className="space-y-3">
          <Badge variant={discoveryResult.apify_used ? "default" : "secondary"} className="text-[10px]">
            {discoveryResult.apify_used ? "⚡ Live Apify + AI" : "🤖 AI analysis only"}
          </Badge>
          {(discoveryResult.competitors ?? []).map((c, i) => (
            <div key={i} className="rounded-lg border bg-card p-3 space-y-1.5">
              <div className="flex items-start justify-between gap-2">
                <div className="flex items-center gap-2">
                  <Building2 className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0" />
                  <span className="font-medium text-sm">{c.name}</span>
                  {c.domain && <span className="text-[10px] text-muted-foreground">{c.domain}</span>}
                </div>
                <div className="flex gap-1 flex-shrink-0">
                  <Badge variant="outline" className="text-[9px] capitalize">{c.relationship?.replace(/_/g, " ")}</Badge>
                  <Badge variant="outline" className="text-[9px] capitalize">{c.geographic_reach}</Badge>
                </div>
              </div>
              <p className="text-xs text-muted-foreground">{c.why_relevant}</p>
              <div className="flex gap-3 text-[10px] text-muted-foreground">
                <span>Sponsorship: <strong className="text-foreground">{c.sponsorship_likelihood}/10</strong></span>
                <span>Sports: <strong className="text-foreground">{c.sports_partnership_probability}/10</strong></span>
                <span className="capitalize">{c.business_type}</span>
              </div>
            </div>
          ))}
          {discoveryResult.sponsorship_landscape && (
            <div className="rounded-lg bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 p-3">
              <p className="text-xs font-semibold text-blue-700 dark:text-blue-400 mb-1">Market Landscape</p>
              <p className="text-xs">{discoveryResult.sponsorship_landscape}</p>
            </div>
          )}
          {(discoveryResult.keyword_clusters ?? []).length > 0 && (
            <div className="flex flex-wrap gap-1">
              {discoveryResult.keyword_clusters!.slice(0, 15).map((k, i) => <Badge key={i} variant="outline" className="text-[10px]">{k}</Badge>)}
            </div>
          )}
          {discoveryResult.coritiba_positioning?.unique_angle && (
            <div className="rounded-lg bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 p-3">
              <p className="text-xs font-semibold text-green-700 dark:text-green-400 mb-1">Coritiba FC Angle</p>
              <p className="text-xs">{discoveryResult.coritiba_positioning.unique_angle}</p>
            </div>
          )}
        </div>
      )}

      {/* Industry Expansion Results */}
      {active === "industry" && industryResult && !loading && (
        <div className="space-y-2">
          <Badge variant={industryResult.apify_used ? "default" : "secondary"} className="text-[10px]">
            {industryResult.apify_used ? "⚡ Live Apify + AI" : "🤖 AI only"}
          </Badge>
          {(industryResult.brands ?? []).map((b, i) => (
            <div key={i} className="p-2.5 rounded-lg border bg-card">
              <div className="flex items-center gap-2 flex-wrap mb-1">
                <span className="font-medium text-sm">{b.name}</span>
                {b.domain && <span className="text-[10px] text-muted-foreground">{b.domain}</span>}
                {b.sponsorship_active && <Badge variant="outline" className="text-[9px] border-green-300 text-green-700">Active sponsor</Badge>}
              </div>
              <p className="text-xs text-muted-foreground">{b.why_interesting ?? b.why_good_prospect}</p>
              <div className="flex gap-3 text-[10px] text-muted-foreground mt-1">
                <span>{b.estimated_size}</span><span>{b.locality}</span><span>{b.business_type}</span>
                <span>Fit: <strong className="text-foreground">{b.sponsorship_likelihood ?? b.sponsorship_fit}/10</strong></span>
              </div>
            </div>
          ))}
          {(industryResult.keywords ?? []).length > 0 && (
            <div className="flex flex-wrap gap-1 pt-1">
              {industryResult.keywords!.slice(0, 12).map((k, i) => <Badge key={i} variant="outline" className="text-[10px]">{k}</Badge>)}
            </div>
          )}
        </div>
      )}

      {/* Goods/Services Results */}
      {active === "goods" && goodsResult && !loading && (
        <div className="space-y-2">
          <div className="flex items-center gap-2 flex-wrap">
            <Badge variant={goodsResult.apify_used ? "default" : "secondary"} className="text-[10px]">
              {goodsResult.apify_used ? "⚡ Live Apify + AI" : "🤖 AI only"}
            </Badge>
            {(goodsResult.related_categories ?? []).map((c, i) => <Badge key={i} variant="outline" className="text-[10px]">{c}</Badge>)}
          </div>
          {(goodsResult.companies ?? []).map((c, i) => (
            <div key={i} className="p-2.5 rounded-lg border bg-card space-y-1">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="font-medium text-sm">{c.name}</span>
                {c.domain && <span className="text-[10px] text-muted-foreground">{c.domain}</span>}
                {c.barter_potential && <Badge variant="outline" className="text-[9px] border-amber-300 text-amber-700">Barter ↔</Badge>}
              </div>
              <p className="text-xs text-muted-foreground">{c.products_services}</p>
              <p className="text-xs">{c.why_good_prospect ?? c.why_interesting}</p>
              <div className="flex gap-3 text-[10px] text-muted-foreground">
                <span>{c.locality}</span><span>{c.business_type}</span><span>{c.estimated_size}</span>
                <span>Fit: <strong className="text-foreground">{c.sponsorship_fit}/10</strong></span>
              </div>
            </div>
          ))}
          {(goodsResult.market_keywords ?? []).length > 0 && (
            <div className="flex flex-wrap gap-1 pt-1">
              {goodsResult.market_keywords!.slice(0, 12).map((k, i) => <Badge key={i} variant="outline" className="text-[10px]">{k}</Badge>)}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
