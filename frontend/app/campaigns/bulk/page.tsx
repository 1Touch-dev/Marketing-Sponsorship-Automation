"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { PageHeader } from "@/components/shared/page-header";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/components/ui/toaster";
import { Loader2, Zap, CheckCircle2, XCircle, Building2, FileText, ArrowRight } from "lucide-react";
import Link from "next/link";

const COMMON_INDUSTRIES = [
  "Automotive", "Banking & Finance", "Food & Beverage", "Healthcare", "Insurance",
  "Real Estate", "Retail", "Technology", "Telecommunications", "Tourism & Hospitality",
];

type BulkResult = {
  company_id: string;
  company_name: string;
  campaign_id?: string;
  proposal_id?: string;
  status: "success" | "error";
  error?: string;
};

export default function BulkCampaignsPage() {
  const router = useRouter();
  const { toast } = useToast();
  const [industry, setIndustry] = useState("");
  const [objective, setObjective] = useState("brand awareness and fan engagement");
  const [maxCompanies, setMaxCompanies] = useState(5);
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState<BulkResult[] | null>(null);
  const [summary, setSummary] = useState<{ message: string; successful: number; failed: number } | null>(null);
  const [progress, setProgress] = useState("");

  async function run() {
    if (!industry.trim()) {
      toast({ variant: "destructive", title: "Select or enter an industry first" });
      return;
    }
    setLoading(true);
    setResults(null);
    setSummary(null);
    setProgress(`Generating campaigns for ${maxCompanies} companies in "${industry}"…`);

    try {
      const res = await fetch("/api/campaigns/bulk", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ industry, objective, max_companies: maxCompanies }),
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
        title="Bulk Industry Campaigns"
        description="Generate Coritiba FC sponsorship campaigns for all companies in an industry at once"
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
              Set the target industry and run. The AI will generate a campaign + proposal for every matching company.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="industry">Industry *</Label>
              <Input
                id="industry"
                value={industry}
                onChange={(e) => setIndustry(e.target.value)}
                placeholder="e.g. Automotive, Banking, Retail…"
              />
              <div className="flex flex-wrap gap-1 mt-2">
                {COMMON_INDUSTRIES.map((ind) => (
                  <button
                    key={ind}
                    type="button"
                    onClick={() => setIndustry(ind)}
                    className={`text-xs px-2 py-1 rounded-full border transition-colors ${
                      industry === ind
                        ? "bg-primary text-primary-foreground border-primary"
                        : "border-border hover:border-primary/50 hover:bg-accent"
                    }`}
                  >
                    {ind}
                  </button>
                ))}
              </div>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="objective">Campaign objective</Label>
              <Input
                id="objective"
                value={objective}
                onChange={(e) => setObjective(e.target.value)}
                placeholder="brand awareness and fan engagement"
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="max">Max companies to process</Label>
              <Input
                id="max"
                type="number"
                min={1}
                max={20}
                value={maxCompanies}
                onChange={(e) => setMaxCompanies(Math.min(20, Math.max(1, Number(e.target.value))))}
              />
              <p className="text-xs text-muted-foreground">Maximum 20 per batch. Each company runs several Claude calls in sequence (~1–2 min each).</p>
            </div>

            <Button
              className="w-full gap-2 mt-2"
              onClick={run}
              disabled={loading || !industry.trim()}
            >
              {loading ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" /> Generating…
                </>
              ) : (
                <>
                  <Zap className="h-4 w-4" /> Generate Bulk Campaigns
                </>
              )}
            </Button>

            {progress && (
              <p className="text-xs text-muted-foreground text-center animate-pulse">{progress}</p>
            )}

            <div className="rounded-lg bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-800 p-3 text-xs text-amber-700 dark:text-amber-300 space-y-1">
              <p className="font-medium">What gets generated:</p>
              <ul className="list-disc list-inside space-y-0.5 text-amber-600 dark:text-amber-400">
                <li>Campaign strategy per company</li>
                <li>Full proposal with all sections</li>
                <li>3 pricing tiers</li>
                <li>3 strategy variants</li>
              </ul>
              <p className="text-amber-500 mt-2">
                Est. time: ~{Math.ceil(maxCompanies * 1.2)}–{Math.ceil(maxCompanies * 2)} min for {maxCompanies} companies
                (sequential Bedrock calls; use a broad industry like Automotivo or Energia to match many rows).
              </p>
            </div>
          </CardContent>
        </Card>

        {/* Results */}
        <div className="lg:col-span-2 space-y-4">
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

          {results && results.length > 0 && (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base">Results</CardTitle>
              </CardHeader>
              <CardContent>
                <ul className="space-y-2">
                  {results.map((r) => (
                    <li
                      key={r.company_id}
                      className={`flex items-center justify-between rounded-lg border p-3 gap-3 ${
                        r.status === "success"
                          ? "border-green-200 bg-green-50/50 dark:bg-green-950/10"
                          : "border-red-200 bg-red-50/50 dark:bg-red-950/10"
                      }`}
                    >
                      <div className="flex items-center gap-2 min-w-0">
                        {r.status === "success" ? (
                          <CheckCircle2 className="h-4 w-4 text-green-600 shrink-0" />
                        ) : (
                          <XCircle className="h-4 w-4 text-red-500 shrink-0" />
                        )}
                        <div className="min-w-0">
                          <p className="text-sm font-medium truncate">{r.company_name}</p>
                          {r.error && (
                            <p className="text-xs text-red-600 truncate">{r.error}</p>
                          )}
                        </div>
                      </div>
                      {r.status === "success" && (r.campaign_id || r.proposal_id) && (
                        <div className="flex gap-2 shrink-0">
                          {r.campaign_id && (
                            <Button size="sm" variant="outline" className="h-7 text-xs gap-1" asChild>
                              <Link href={`/campaigns/${r.campaign_id}`}>
                                <Building2 className="h-3 w-3" /> Campaign
                              </Link>
                            </Button>
                          )}
                          {r.proposal_id && (
                            <Button size="sm" className="h-7 text-xs gap-1" asChild>
                              <Link href={`/proposals/${r.proposal_id}`}>
                                <FileText className="h-3 w-3" /> Proposal <ArrowRight className="h-3 w-3" />
                              </Link>
                            </Button>
                          )}
                        </div>
                      )}
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          )}

          {!loading && !results && (
            <Card className="border-dashed">
              <CardContent className="flex flex-col items-center justify-center py-16 text-center gap-3">
                <Zap className="h-10 w-10 text-muted-foreground/30" />
                <p className="text-muted-foreground font-medium">Select an industry and click Generate</p>
                <p className="text-xs text-muted-foreground/70">
                  The AI will create personalized campaigns for each company in the selected industry.
                </p>
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </>
  );
}
