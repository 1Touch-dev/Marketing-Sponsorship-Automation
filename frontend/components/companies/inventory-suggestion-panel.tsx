"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Sparkles, Loader2, Package, TrendingUp, Star,
  DollarSign, Target, Lightbulb, CheckCircle, ArrowRight,
} from "lucide-react";
import { useToast } from "@/components/ui/toaster";
import Link from "next/link";

interface InventoryItem {
  inventory_id: string;
  inventory_name: string;
  priority: "primary" | "secondary" | "optional";
  reason: string;
  suggested_price_brl: number;
  activation_idea: string;
  inventory_data?: {
    id: string; name: string; inventory_type: string;
    price_min: number; price_max: number;
  } | null;
}

interface Suggestion {
  proposal_type: string;
  proposal_type_reason: string;
  recommended_items: InventoryItem[];
  total_package_min: number;
  total_package_max: number;
  key_selling_points: string[];
  outreach_angle: string;
  fit_score: number;
  barter_opportunities: string[];
  ideal_campaign_themes: string[];
  company_name: string;
}

const PRIORITY_COLORS: Record<string, string> = {
  primary: "bg-green-100 text-green-700 border-green-200",
  secondary: "bg-blue-100 text-blue-700 border-blue-200",
  optional: "bg-slate-100 text-slate-600 border-slate-200",
};

const PROPOSAL_TYPE_LABELS: Record<string, string> = {
  sponsorship: "Commercial Sponsorship",
  barter: "Barter / Exchange",
  lei_de_incentivo: "Lei de Incentivo",
  hybrid: "Hybrid (Sponsorship + Barter)",
};

function formatBRL(val: number): string {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 }).format(val);
}

export function InventorySuggestionPanel({
  companyId,
  companyName,
}: {
  companyId: string;
  companyName: string;
}) {
  const [loading, setLoading] = useState(false);
  const [suggestion, setSuggestion] = useState<Suggestion | null>(null);
  const { toast } = useToast();

  async function getSuggestions() {
    setLoading(true);
    try {
      const res = await fetch("/api/inventory/suggest", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ company_id: companyId }),
      });
      const data = await res.json() as Suggestion & { error?: string };
      if (!res.ok) throw new Error(data.error ?? "Failed");
      setSuggestion(data);
    } catch (err) {
      toast({ variant: "destructive", title: "Suggestion failed", description: err instanceof Error ? err.message : "Unknown error" });
    } finally {
      setLoading(false);
    }
  }

  if (!suggestion) {
    return (
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-amber-500" />
            AI Inventory & Proposal Suggestion
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground mb-4">
            Let AI analyze {companyName}&apos;s profile and recommend the best sponsorship inventory package and proposal type.
          </p>
          <Button onClick={getSuggestions} disabled={loading} className="gap-2 w-full">
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
            {loading ? "Analysing profile…" : "Suggest Inventory & Proposal Type"}
          </Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-2">
          <CardTitle className="text-base flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-amber-500" />
            AI Recommendation for {companyName}
          </CardTitle>
          <Button size="sm" variant="ghost" onClick={getSuggestions} disabled={loading} className="h-7 px-2 text-xs gap-1 flex-shrink-0">
            {loading ? <Loader2 className="h-3 w-3 animate-spin" /> : "Refresh"}
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-5">

        {/* Fit Score + Proposal Type */}
        <div className="grid grid-cols-2 gap-3">
          <div className="p-3 rounded-lg bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800">
            <p className="text-xs text-amber-600 dark:text-amber-400 font-medium flex items-center gap-1">
              <Star className="h-3 w-3" /> Sponsorship Fit
            </p>
            <p className="text-2xl font-bold text-amber-700 dark:text-amber-300 mt-0.5">
              {suggestion.fit_score}/10
            </p>
          </div>
          <div className="p-3 rounded-lg bg-primary/5 border border-primary/20">
            <p className="text-xs text-muted-foreground font-medium flex items-center gap-1">
              <Target className="h-3 w-3" /> Suggested Type
            </p>
            <p className="text-sm font-semibold mt-0.5 capitalize">
              {PROPOSAL_TYPE_LABELS[suggestion.proposal_type] ?? suggestion.proposal_type}
            </p>
            <p className="text-xs text-muted-foreground mt-0.5">{suggestion.proposal_type_reason}</p>
          </div>
        </div>

        {/* Package range */}
        <div className="p-3 rounded-lg border bg-green-50 dark:bg-green-900/20">
          <p className="text-xs text-green-600 dark:text-green-400 font-medium flex items-center gap-1 mb-1">
            <DollarSign className="h-3 w-3" /> Suggested Package Value
          </p>
          <p className="text-lg font-bold text-green-700 dark:text-green-300">
            {formatBRL(suggestion.total_package_min)} – {formatBRL(suggestion.total_package_max)} / year
          </p>
        </div>

        {/* Outreach angle */}
        {suggestion.outreach_angle && (
          <div className="p-3 rounded-lg border bg-blue-50 dark:bg-blue-900/20">
            <p className="text-xs text-blue-600 dark:text-blue-400 font-medium mb-1 flex items-center gap-1">
              <Lightbulb className="h-3 w-3" /> Opening Pitch Angle
            </p>
            <p className="text-sm italic text-blue-800 dark:text-blue-200">&ldquo;{suggestion.outreach_angle}&rdquo;</p>
          </div>
        )}

        {/* Recommended inventory */}
        <div>
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2 flex items-center gap-1">
            <Package className="h-3.5 w-3.5" /> Recommended Inventory
          </p>
          <div className="space-y-2">
            {suggestion.recommended_items.map((item, i) => (
              <div key={i} className="p-3 rounded-lg border bg-card space-y-1">
                <div className="flex items-start justify-between gap-2">
                  <div className="font-medium text-sm leading-tight">{item.inventory_name}</div>
                  <span className={`text-[10px] px-1.5 py-0.5 rounded border font-medium flex-shrink-0 capitalize ${PRIORITY_COLORS[item.priority] ?? ""}`}>
                    {item.priority}
                  </span>
                </div>
                <div className="text-xs text-muted-foreground">{item.reason}</div>
                {item.activation_idea && (
                  <div className="text-xs text-blue-600 dark:text-blue-400 italic">💡 {item.activation_idea}</div>
                )}
                {item.suggested_price_brl > 0 && (
                  <div className="text-xs font-medium text-green-700 dark:text-green-400">
                    {formatBRL(item.suggested_price_brl)}/yr
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>

        {/* Key selling points */}
        {suggestion.key_selling_points.length > 0 && (
          <div>
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">Key Selling Points</p>
            <ul className="space-y-1">
              {suggestion.key_selling_points.map((pt, i) => (
                <li key={i} className="flex items-start gap-2 text-sm">
                  <CheckCircle className="h-3.5 w-3.5 text-green-500 mt-0.5 flex-shrink-0" />
                  {pt}
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* Campaign themes */}
        {suggestion.ideal_campaign_themes.length > 0 && (
          <div>
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2 flex items-center gap-1">
              <TrendingUp className="h-3.5 w-3.5" /> Campaign Theme Ideas
            </p>
            <div className="flex flex-wrap gap-1.5">
              {suggestion.ideal_campaign_themes.map((t, i) => (
                <Badge key={i} variant="outline" className="text-xs">{t}</Badge>
              ))}
            </div>
          </div>
        )}

        {/* Barter opportunities */}
        {suggestion.barter_opportunities.length > 0 && (
          <div>
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">Barter Opportunities</p>
            <ul className="space-y-1">
              {suggestion.barter_opportunities.map((b, i) => (
                <li key={i} className="text-xs text-muted-foreground flex items-start gap-1.5">
                  <span className="text-amber-500 mt-0.5">↔</span> {b}
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* CTA */}
        <div className="pt-1">
          <Link href={`/proposals/new?company_id=${companyId}&type=${suggestion.proposal_type}`}>
            <Button className="w-full gap-2" size="sm">
              <Sparkles className="h-4 w-4" />
              Create {PROPOSAL_TYPE_LABELS[suggestion.proposal_type] ?? "Proposal"} Now
              <ArrowRight className="h-4 w-4" />
            </Button>
          </Link>
        </div>
      </CardContent>
    </Card>
  );
}
