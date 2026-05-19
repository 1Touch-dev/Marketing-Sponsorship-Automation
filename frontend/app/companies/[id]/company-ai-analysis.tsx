"use client";

import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Brain, Sparkles, TrendingUp, Users, Target, Lightbulb,
  Trophy, RotateCcw, Globe, Search, Building2, CheckCircle,
  AlertCircle, Loader2, ExternalLink,
} from "lucide-react";
import { ApifyDiscoveryPanel } from "@/components/intelligence/apify-discovery-panel";

interface Props {
  companyId: string;
  companyName: string;
  industry: string | null;
  website: string | null;
  notes: string | null;
  hasIntelligence: boolean;
  intelligence: Record<string, unknown> | null;
  competitors: string[];
}

export function CompanyAIAnalysis({
  companyId, companyName, industry, website, notes, intelligence,
}: Props) {
  const [loading, setLoading] = useState(false);
  const [scraping, setScraping] = useState(false);
  const [serpLoading, setSerpLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<Record<string, unknown> | null>(intelligence);
  const [scrapeStatus, setScrapeStatus] = useState<string | null>(null);
  const [serpData, setSerpData] = useState<Record<string, unknown> | null>(
    (intelligence?.serp_intelligence as Record<string, unknown>) ?? null
  );
  const [activeTab, setActiveTab] = useState<"intelligence" | "competitors" | "scrape" | "serp" | "discover">("intelligence");

  const scrapeMetadata = data?.scrape_metadata as Record<string, unknown> | null;
  const competitors = (data?.competitors as Array<Record<string, string>>) ?? [];
  const sponsorshipProfile = (data?.sponsorship_profile as Record<string, unknown>) ?? {};

  async function runAnalysis() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/companies/intelligence", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ company_id: companyId, company_name: companyName, industry, website, notes }),
      });
      const j = await res.json() as { intelligence: Record<string, unknown>; error?: string };
      if (!res.ok) throw new Error(j?.error ?? "Analysis failed");
      setData(j.intelligence);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setLoading(false);
    }
  }

  async function runScrape() {
    if (!website) { setError("No website configured for this company"); return; }
    setScraping(true);
    setScrapeStatus("Fetching website…");
    setError(null);
    try {
      setScrapeStatus("Scraping website…");
      const res = await fetch("/api/intelligence/scrape", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ company_id: companyId, domain: website }),
      });
      setScrapeStatus("Enriching with AI…");
      const j = await res.json() as { intelligence: Record<string, unknown>; error?: string };
      if (!res.ok) throw new Error(j?.error ?? "Scrape failed");
      setData(j.intelligence);
      setScrapeStatus("Complete");
      setActiveTab("intelligence");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Scrape failed");
      setScrapeStatus(null);
    } finally {
      setScraping(false);
    }
  }

  async function runSerp() {
    setSerpLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/intelligence/serp", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ company_id: companyId, company_name: companyName, industry, website }),
      });
      const j = await res.json() as Record<string, unknown>;
      if (!res.ok) throw new Error(String(j?.error ?? "SERP analysis failed"));
      setSerpData(j);
      // Also refresh main intelligence data
      if (j.competitors) {
        setData(prev => prev ? { ...prev, competitors: j.competitors, market_context: j.market_context } : prev);
      }
      setActiveTab("serp");
    } catch (err) {
      setError(err instanceof Error ? err.message : "SERP analysis failed");
    } finally {
      setSerpLoading(false);
    }
  }

  const fitScore = data?.coritiba_fit_score ?? data?.sponsorship_fit_score;

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <CardTitle className="text-base flex items-center gap-2">
            <Brain className="h-4 w-4 text-purple-500" />
            Company Intelligence
            {data && <Badge variant="secondary" className="text-xs ml-1">✓ Analyzed</Badge>}
            {scrapeMetadata && <Badge variant="outline" className="text-xs text-blue-600 border-blue-200">Scraped</Badge>}
          </CardTitle>
          <div className="flex items-center gap-2">
            {website && (
              <Button variant="outline" size="sm" onClick={runScrape} disabled={scraping || loading} className="gap-1.5 text-xs">
                {scraping ? <><Loader2 className="h-3 w-3 animate-spin" />{scrapeStatus ?? "Scraping…"}</> : <><Globe className="h-3 w-3" /> Scrape Website</>}
              </Button>
            )}
            <Button variant="outline" size="sm" onClick={runSerp} disabled={serpLoading || loading} className="gap-1.5 text-xs">
              {serpLoading ? <><Loader2 className="h-3 w-3 animate-spin" /> Discovering…</> : <><Search className="h-3 w-3" /> Find Competitors</>}
            </Button>
            <Button variant={data ? "outline" : "default"} size="sm" onClick={runAnalysis} disabled={loading || scraping} className="gap-1.5">
              {loading ? <><Loader2 className="h-3.5 w-3.5 animate-spin" /> Analyzing…</> :
               data ? <><RotateCcw className="h-3.5 w-3.5" /> Re-analyze</> :
               <><Sparkles className="h-3.5 w-3.5" /> Run AI Analysis</>}
            </Button>
          </div>
        </div>
        {!data && !loading && (
          <p className="text-xs text-muted-foreground mt-1">
            AI will analyze {companyName}&apos;s sponsorship fit, marketing goals, and recommended Coritiba FC strategy.
            {website && " Or use Scrape Website to extract live data."}
          </p>
        )}

        {/* Tabs */}
        {data && (
          <div className="flex gap-1 mt-2 flex-wrap">
            {(["intelligence", "competitors", "scrape", "serp", "discover"] as const).map(tab => (
              <button key={tab} onClick={() => setActiveTab(tab)}
                className={`px-3 py-1 rounded-md text-xs font-medium transition-colors capitalize ${activeTab === tab ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground hover:bg-accent"}`}>
                {tab === "competitors" ? `Competitors (${competitors.length})` :
                 tab === "scrape" ? "Scrape Data" :
                 tab === "serp" ? `Market Intel${serpData ? " ✓" : ""}` :
                 tab === "discover" ? "⚡ Apify Discovery" :
                 "Intelligence"}
              </button>
            ))}
          </div>
        )}
      </CardHeader>

      {error && (
        <CardContent className="pt-0">
          <div className="text-sm text-destructive bg-destructive/10 rounded-md p-2 flex items-center gap-2">
            <AlertCircle className="h-4 w-4 flex-shrink-0" />{error}
          </div>
        </CardContent>
      )}

      {data && (
        <CardContent className="pt-0 space-y-4">

          {/* Tab: Intelligence */}
          {activeTab === "intelligence" && (
            <>
              {fitScore !== undefined && (
                <div className="flex items-center gap-4 p-3 rounded-lg bg-gradient-to-r from-green-50 to-emerald-50 dark:from-green-900/20 dark:to-emerald-900/20 border border-green-200 dark:border-green-800">
                  <Trophy className="h-5 w-5 text-green-600 shrink-0" />
                  <div className="flex-1">
                    <p className="text-xs text-green-700 dark:text-green-400 font-medium">Coritiba FC Fit Score</p>
                    <p className="text-2xl font-bold text-green-800 dark:text-green-300">
                      {typeof fitScore === "number" ? `${fitScore}/10` : String(fitScore)}
                    </p>
                    {!!data.coritiba_fit_rationale && <p className="text-xs text-green-700 dark:text-green-400 mt-0.5 line-clamp-2">{String(data.coritiba_fit_rationale)}</p>}
                  </div>
                  {!!sponsorshipProfile.likelihood_score && (
                    <div className="text-right">
                      <p className="text-xs text-muted-foreground">Likelihood</p>
                      <p className="text-lg font-bold">{String(sponsorshipProfile.likelihood_score)}/10</p>
                    </div>
                  )}
                </div>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {!!data.marketing_goals && <IntelSection icon={<Target className="h-4 w-4 text-blue-500" />} title="Marketing Goals" content={data.marketing_goals} />}
                {!!data.brand_positioning && <IntelSection icon={<TrendingUp className="h-4 w-4 text-purple-500" />} title="Brand Positioning" content={data.brand_positioning} />}
                {!!data.target_audience && <IntelSection icon={<Users className="h-4 w-4 text-orange-500" />} title="Target Audience" content={data.target_audience} />}
                {!!data.products_services && <IntelSection icon={<Brain className="h-4 w-4 text-gray-500" />} title="Products & Services" content={data.products_services} />}
                {!!data.recommended_direction && <IntelSection icon={<Lightbulb className="h-4 w-4 text-yellow-500" />} title="Partnership Direction" content={data.recommended_direction} wide />}
                {!!data.key_messages && <IntelSection icon={<Sparkles className="h-4 w-4 text-amber-500" />} title="Key Messages for Proposal" content={data.key_messages} wide />}
              </div>

              {!!data.sponsorship_activation_ideas && (
                <div className="p-3 rounded-lg bg-purple-50 dark:bg-purple-900/20 border border-purple-200 dark:border-purple-800">
                  <p className="text-xs font-medium text-purple-700 dark:text-purple-300 uppercase tracking-wide mb-2">💡 Activation Ideas</p>
                  <p className="text-sm text-purple-900 dark:text-purple-100 whitespace-pre-line leading-relaxed">{String(data.sponsorship_activation_ideas)}</p>
                </div>
              )}

              {!!data.local_context && (
                <div className="p-3 rounded-lg bg-muted/50 border">
                  <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-1">📍 Curitiba / Paraná Context</p>
                  <p className="text-sm leading-relaxed">{String(data.local_context)}</p>
                </div>
              )}

              {!!data.best_contact_timing && (
                <div className="flex items-center gap-2 text-sm p-2 rounded-lg bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800">
                  <CheckCircle className="h-4 w-4 text-amber-500 flex-shrink-0" />
                  <span className="text-amber-800 dark:text-amber-300"><strong>Best timing:</strong> {String(data.best_contact_timing)}</span>
                </div>
              )}
            </>
          )}

          {/* Tab: Competitors */}
          {activeTab === "competitors" && (
            <div className="space-y-3">
              {competitors.length === 0 ? (
                <div className="text-center py-6 text-muted-foreground text-sm">
                  <Search className="h-8 w-8 mx-auto mb-2 opacity-20" />
                  No competitor data yet. Use &quot;Scrape Website&quot; to auto-discover competitors.
                </div>
              ) : (
                competitors.map((comp, i) => (
                  <div key={i} className="flex items-start gap-3 p-3 rounded-lg border bg-muted/30">
                    <Building2 className="h-4 w-4 text-muted-foreground mt-0.5 flex-shrink-0" />
                    <div className="flex-1 min-w-0">
                      <div className="font-medium text-sm">{comp.name}</div>
                      <div className="text-xs text-muted-foreground mt-0.5">{comp.reason}</div>
                      {comp.sponsorship_spend && <div className="text-xs text-muted-foreground mt-0.5">Spend: {comp.sponsorship_spend}</div>}
                    </div>
                    {comp.website && (
                      <a href={`https://${comp.website}`} target="_blank" rel="noopener noreferrer" className="text-muted-foreground hover:text-primary"><ExternalLink className="h-3.5 w-3.5" /></a>
                    )}
                  </div>
                ))
              )}
              {!!sponsorshipProfile.estimated_budget_range && (
                <div className="p-3 rounded-lg bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800">
                  <p className="text-xs font-medium text-green-700 dark:text-green-400 mb-1">Estimated Budget Range</p>
                  <p className="text-sm font-semibold text-green-800 dark:text-green-300">{String(sponsorshipProfile.estimated_budget_range)}</p>
                  {!!sponsorshipProfile.best_contact_approach && <p className="text-xs text-green-700 dark:text-green-400 mt-1">{String(sponsorshipProfile.best_contact_approach)}</p>}
                </div>
              )}
            </div>
          )}

          {/* Tab: Scrape Data */}
          {activeTab === "scrape" && (
            <div className="space-y-3">
              {!scrapeMetadata ? (
                <div className="text-center py-6 text-muted-foreground text-sm">
                  <Globe className="h-8 w-8 mx-auto mb-2 opacity-20" />
                  No scrape data yet.
                  {website && <><br /><Button size="sm" variant="outline" onClick={runScrape} disabled={scraping} className="mt-3 gap-1.5"><Globe className="h-3 w-3" /> Scrape {website}</Button></>}
                </div>
              ) : (
                <>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="p-3 rounded-lg border bg-muted/30">
                      <p className="text-xs text-muted-foreground">Domain</p>
                      <p className="text-sm font-medium">{String(scrapeMetadata.domain ?? "—")}</p>
                    </div>
                    <div className="p-3 rounded-lg border bg-muted/30">
                      <p className="text-xs text-muted-foreground">Scraped</p>
                      <p className="text-sm font-medium">{scrapeMetadata.scraped_at ? new Date(String(scrapeMetadata.scraped_at)).toLocaleDateString("pt-BR") : "—"}</p>
                    </div>
                  </div>
                  {!!scrapeMetadata.title && <div className="p-3 rounded-lg border"><p className="text-xs text-muted-foreground mb-1">Page Title</p><p className="text-sm">{String(scrapeMetadata.title)}</p></div>}
                  {!!scrapeMetadata.meta_description && <div className="p-3 rounded-lg border"><p className="text-xs text-muted-foreground mb-1">Meta Description</p><p className="text-sm">{String(scrapeMetadata.meta_description)}</p></div>}
                  {Array.isArray(scrapeMetadata.keywords) && (scrapeMetadata.keywords as string[]).length > 0 && (
                    <div><p className="text-xs text-muted-foreground mb-2">Keywords</p>
                      <div className="flex flex-wrap gap-1">{(scrapeMetadata.keywords as string[]).map((k, i) => <Badge key={i} variant="outline" className="text-xs">{k}</Badge>)}</div>
                    </div>
                  )}
                  {Array.isArray(scrapeMetadata.social_links) && (scrapeMetadata.social_links as string[]).length > 0 && (
                    <div><p className="text-xs text-muted-foreground mb-2">Social Presence</p>
                      <div className="flex gap-2">{(scrapeMetadata.social_links as string[]).map((s, i) => <Badge key={i} variant="secondary" className="text-xs capitalize">{s}</Badge>)}</div>
                    </div>
                  )}
                </>
              )}
            </div>
          )}

          {/* Tab: Market Intel (SERP) */}
          {activeTab === "serp" && (
            <div className="space-y-3">
              {!serpData ? (
                <div className="text-center py-6 text-muted-foreground text-sm">
                  <Search className="h-8 w-8 mx-auto mb-2 opacity-20" />
                  No market intelligence yet.
                  <br />
                  <Button size="sm" variant="outline" onClick={runSerp} disabled={serpLoading} className="mt-3 gap-1.5">
                    <Search className="h-3 w-3" /> Discover Competitors &amp; Market
                  </Button>
                </div>
              ) : (
                <>
                  {!!serpData.data_source && (
                    <div className={`text-xs px-3 py-1.5 rounded-full inline-flex items-center gap-1 ${serpData.serp_worked ? "bg-green-50 text-green-700 dark:bg-green-900/20 dark:text-green-400" : "bg-blue-50 text-blue-700 dark:bg-blue-900/20 dark:text-blue-400"}`}>
                      <span className="h-1.5 w-1.5 rounded-full bg-current" />
                      {serpData.serp_worked ? "Live web search + AI analysis" : "AI analysis (web search unavailable)"}
                    </div>
                  )}

                  {/* Competitors */}
                  {Array.isArray(serpData.competitors) && (serpData.competitors as Array<Record<string,string>>).length > 0 && (
                    <div className="space-y-2">
                      <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Competitors Discovered</p>
                      {(serpData.competitors as Array<Record<string,string>>).map((c, i) => (
                        <div key={i} className="flex items-start gap-3 p-2.5 rounded-lg border bg-muted/20">
                          <Building2 className="h-3.5 w-3.5 text-muted-foreground mt-0.5 flex-shrink-0" />
                          <div className="flex-1 min-w-0">
                            <div className="text-sm font-medium">{c.name}</div>
                            <div className="text-xs text-muted-foreground mt-0.5">{c.reason}</div>
                            {c.estimated_spend && <div className="text-xs text-green-700 dark:text-green-400 mt-0.5">Est. spend: {c.estimated_spend}</div>}
                          </div>
                          {c.sponsorship_active === "true" || c.sponsorship_active === true as unknown as string ? <Badge variant="outline" className="text-xs border-green-300 text-green-700">Active sponsor</Badge> : null}
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Market Context */}
                  {serpData.market_context && typeof serpData.market_context === "object" && (
                    <div className="p-3 rounded-lg bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 space-y-2">
                      <p className="text-xs font-semibold text-blue-700 dark:text-blue-400 uppercase tracking-wide">Market Context</p>
                      {(serpData.market_context as Record<string, string>).industry_summary && (
                        <p className="text-sm text-blue-900 dark:text-blue-100">{(serpData.market_context as Record<string, string>).industry_summary}</p>
                      )}
                      {(serpData.market_context as Record<string, string>).average_sponsorship_budget && (
                        <p className="text-xs text-blue-700 dark:text-blue-300"><strong>Avg budget:</strong> {(serpData.market_context as Record<string,string>).average_sponsorship_budget}</p>
                      )}
                    </div>
                  )}

                  {/* Keyword Clusters */}
                  {serpData.keyword_clusters && typeof serpData.keyword_clusters === "object" && (() => {
                    const kc = serpData.keyword_clusters as Record<string, string[]>;
                    const hasKw = (kc.primary_keywords?.length ?? 0) > 0 || (kc.sponsorship_language?.length ?? 0) > 0;
                    if (!hasKw) return null;
                    return (
                      <div className="space-y-2">
                        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Keyword Clusters</p>
                        {kc.primary_keywords?.length > 0 && (
                          <div><p className="text-xs text-muted-foreground mb-1">Primary</p>
                            <div className="flex flex-wrap gap-1">{kc.primary_keywords.map((k, i) => <Badge key={i} variant="outline" className="text-xs">{k}</Badge>)}</div>
                          </div>
                        )}
                        {kc.sponsorship_language?.length > 0 && (
                          <div><p className="text-xs text-muted-foreground mb-1">Sponsorship Language</p>
                            <div className="flex flex-wrap gap-1">{kc.sponsorship_language.map((k, i) => <Badge key={i} variant="secondary" className="text-xs">{k}</Badge>)}</div>
                          </div>
                        )}
                      </div>
                    );
                  })()}

                  {/* Coritiba Positioning */}
                  {!!serpData.coritiba_positioning && typeof serpData.coritiba_positioning === "object" && (() => {
                    const cp = serpData.coritiba_positioning as Record<string,string>;
                    return (
                      <div className="p-3 rounded-lg bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800">
                        <p className="text-xs font-semibold text-green-700 dark:text-green-400 uppercase tracking-wide mb-2">Coritiba FC Positioning</p>
                        {cp.unique_angle && <p className="text-sm text-green-900 dark:text-green-100 mb-1"><strong>Unique angle:</strong> {cp.unique_angle}</p>}
                        {cp.risk_mitigation && <p className="text-xs text-green-700 dark:text-green-300">{cp.risk_mitigation}</p>}
                      </div>
                    );
                  })()}
                </>
              )}
            </div>
          )}

          {/* Tab: Apify Commercial Discovery */}
          {activeTab === "discover" && (
            <ApifyDiscoveryPanel
              companyId={companyId}
              companyName={companyName}
              industry={industry}
              website={website}
              existingIntelligence={data}
            />
          )}
        </CardContent>
      )}
    </Card>
  );
}

function IntelSection({
  icon, title, content, wide,
}: {
  icon: React.ReactNode;
  title: string;
  content: unknown;
  wide?: boolean;
}) {
  const text = Array.isArray(content)
    ? (content as string[]).map((s, i) => `${i + 1}. ${s}`).join("\n")
    : String(content ?? "");

  return (
    <div className={`space-y-1.5 ${wide ? "sm:col-span-2" : ""}`}>
      <div className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground uppercase tracking-wide">
        {icon}
        {title}
      </div>
      <p className="text-sm leading-relaxed whitespace-pre-line">{text}</p>
    </div>
  );
}
