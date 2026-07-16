"use client";

import React, { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Radar, Loader2, Building2, Save, CheckCircle2 } from "lucide-react";

type Tier = "local" | "state" | "national";

type Seller = {
  name: string;
  domain?: string;
  role: string;
  products_services: string;
  locality: string;
  tier: Tier;
  business_type: string;
  sponsorship_fit: number;
  barter_potential: boolean;
  estimated_size: string;
  why_good_prospect: string;
};

type Result = {
  product: string;
  tiers: Tier[];
  by_tier: Record<Tier, Seller[]>;
  sellers: Seller[];
  total_found: number;
  saved_as_companies: number;
  apify_used: boolean;
  duration_ms: number;
};

const TIER_LABEL: Record<Tier, string> = {
  local: "City · Curitiba",
  state: "State · Paraná",
  national: "National · Brasil",
};

export function ProductDiscoveryClient() {
  const router = useRouter();
  const [product, setProduct] = useState("");
  const [tiers, setTiers] = useState<Tier[]>(["local", "state", "national"]);
  const [autoSave, setAutoSave] = useState(true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<Result | null>(null);

  const toggleTier = (t: Tier) => {
    setTiers((prev) => (prev.includes(t) ? prev.filter((x) => x !== t) : [...prev, t]));
  };

  async function run() {
    if (product.trim().length < 2) {
      setError("Enter a product or goods type (min 2 characters).");
      return;
    }
    if (tiers.length === 0) {
      setError("Select at least one geographic tier.");
      return;
    }
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      const res = await fetch("/api/intelligence/product-discovery", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ product: product.trim(), tiers, auto_save: autoSave }),
      });
      const d = (await res.json()) as Result & { error?: string };
      if (!res.ok) throw new Error(d.error ?? "Discovery failed");
      setResult(d);
      if (autoSave && d.saved_as_companies > 0) router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-5">
      <div className="rounded-xl border bg-card p-4 space-y-4">
        <div className="flex flex-col sm:flex-row gap-2">
          <input
            value={product}
            onChange={(e) => setProduct(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") run();
            }}
            placeholder="Product / goods — e.g. energy drinks, sportswear uniforms, beer, banking"
            className="flex-1 text-sm border rounded-lg px-3 py-2 bg-background outline-none focus:ring-2 ring-primary/30"
          />
          <Button onClick={run} disabled={loading} className="gap-1.5">
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Radar className="h-4 w-4" />}
            Discover sellers
          </Button>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <span className="text-xs font-medium text-muted-foreground">Geographic scope:</span>
          {(["local", "state", "national"] as Tier[]).map((t) => (
            <label key={t} className="flex items-center gap-1.5 text-xs cursor-pointer">
              <input
                type="checkbox"
                checked={tiers.includes(t)}
                onChange={() => toggleTier(t)}
                className="accent-primary"
              />
              {TIER_LABEL[t]}
            </label>
          ))}
          <label className="flex items-center gap-1.5 text-xs cursor-pointer ml-auto">
            <input
              type="checkbox"
              checked={autoSave}
              onChange={(e) => setAutoSave(e.target.checked)}
              className="accent-primary"
            />
            <Save className="h-3.5 w-3.5" /> Auto-save results as prospect companies
          </label>
        </div>
      </div>

      {error && (
        <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{error}</p>
      )}

      {loading && (
        <div className="flex items-center gap-3 p-4 rounded-xl border bg-muted/30">
          <Loader2 className="h-5 w-5 animate-spin text-primary shrink-0" />
          <div>
            <p className="text-sm font-medium">Scraping the web + AI classification…</p>
            <p className="text-xs text-muted-foreground">
              Searching city, state and national tiers — this can take up to 2 minutes
            </p>
          </div>
        </div>
      )}

      {result && !loading && (
        <div className="space-y-4">
          <div className="flex items-center gap-2 flex-wrap">
            <Badge variant={result.apify_used ? "default" : "secondary"} className="text-[10px]">
              {result.apify_used ? "⚡ Live web scrape + AI" : "🤖 AI analysis only"}
            </Badge>
            <span className="text-xs text-muted-foreground">
              {result.total_found} companies found for <strong>{result.product}</strong>
            </span>
            {result.saved_as_companies > 0 && (
              <span className="flex items-center gap-1 text-xs text-emerald-700">
                <CheckCircle2 className="h-3.5 w-3.5" /> {result.saved_as_companies} saved as prospects
              </span>
            )}
          </div>

          {result.tiers.map((tier) => {
            const items = result.by_tier[tier] ?? [];
            if (!items.length) return null;
            return (
              <div key={tier} className="space-y-2">
                <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  {TIER_LABEL[tier]} · {items.length}
                </div>
                {items.map((s, i) => (
                  <div key={`${tier}-${i}`} className="p-2.5 rounded-lg border bg-card space-y-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <Building2 className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                      <span className="font-medium text-sm">{s.name}</span>
                      {s.domain && <span className="text-[10px] text-muted-foreground">{s.domain}</span>}
                      <Badge variant="outline" className="text-[9px] capitalize">
                        {s.role}
                      </Badge>
                      {s.barter_potential && (
                        <Badge variant="outline" className="text-[9px] border-amber-300 text-amber-700">
                          Barter ↔
                        </Badge>
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground">{s.products_services}</p>
                    <p className="text-xs">{s.why_good_prospect}</p>
                    <div className="flex gap-3 text-[10px] text-muted-foreground">
                      <span>{s.locality}</span>
                      <span>{s.business_type}</span>
                      <span>{s.estimated_size}</span>
                      <span>
                        Fit: <strong className="text-foreground">{s.sponsorship_fit}/10</strong>
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
