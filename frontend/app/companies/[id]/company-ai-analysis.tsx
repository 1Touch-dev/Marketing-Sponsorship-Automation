"use client";

import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Brain, Sparkles, TrendingUp, Users, Target, Lightbulb,
  Trophy, RotateCcw, Globe, Search, Building2, CheckCircle,
  AlertCircle, Loader2, ExternalLink, Mail, Linkedin,
  Instagram, Twitter, Youtube, Facebook, Megaphone, UserCheck,
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
  companyId, companyName, industry, website, notes, intelligence, competitors: rawCompetitors,
}: Props) {
  const [loading, setLoading] = useState(false);
  const [scraping, setScraping] = useState(false);
  const [serpLoading, setSerpLoading] = useState(false);
  const [enrichLoading, setEnrichLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<Record<string, unknown> | null>(intelligence);
  const [scrapeStatus, setScrapeStatus] = useState<string | null>(null);
  const [serpData, setSerpData] = useState<Record<string, unknown> | null>(
    (intelligence?.serp_intelligence as Record<string, unknown>) ?? null
  );
  const [enrichData, setEnrichData] = useState<Record<string, unknown> | null>(
    (intelligence?.enrichment as Record<string, unknown>) ?? null
  );
  const [activeTab, setActiveTab] = useState<"intelligence" | "competitors" | "scrape" | "serp" | "discover" | "contacts">("intelligence");

  const scrapeMetadata = data?.scrape_metadata as Record<string, unknown> | null;
  const sponsorshipProfile = (data?.sponsorship_profile as Record<string, unknown>) ?? {};

  // Normalize competitors — can be string[] or object[] from intelligence, or raw string[] from DB
  function normalizeCompetitors(raw: unknown[]): Array<{ name: string; reason?: string; website?: string; sponsorship_spend?: string }> {
    return raw.map(c => {
      if (typeof c === "string") return { name: c };
      if (typeof c === "object" && c !== null) return c as { name: string; reason?: string; website?: string };
      return { name: String(c) };
    });
  }
  const aiCompetitors = normalizeCompetitors((data?.competitors as unknown[]) ?? []);
  const dbCompetitors = normalizeCompetitors(rawCompetitors as unknown[]);
  // Merge: AI competitors take priority, fill in DB competitors not already listed
  const allCompetitorNames = new Set(aiCompetitors.map(c => c.name.toLowerCase()));
  const extraFromDb = dbCompetitors.filter(c => !allCompetitorNames.has(c.name.toLowerCase()));
  const competitors = [...aiCompetitors, ...extraFromDb];

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

  async function runEnrich() {
    setEnrichLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/intelligence/enrich", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ company_id: companyId }),
      });
      const j = await res.json() as { enrichment: Record<string, unknown>; summary?: Record<string, unknown>; error?: string };
      if (!res.ok) throw new Error(j?.error ?? "Enrichment failed");
      setEnrichData(j.enrichment);
      setActiveTab("contacts");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Enrichment failed");
    } finally {
      setEnrichLoading(false);
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
            {website && (
              <Button variant="outline" size="sm" onClick={runEnrich} disabled={enrichLoading || loading} className="gap-1.5 text-xs text-blue-600 border-blue-200 hover:bg-blue-50">
                {enrichLoading ? <><Loader2 className="h-3 w-3 animate-spin" /> Enriching…</> : <><UserCheck className="h-3 w-3" /> Enrich Contacts</>}
              </Button>
            )}
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
        {(data || enrichData) && (
          <div className="flex gap-1 mt-2 flex-wrap">
            {(["intelligence", "competitors", "scrape", "serp", "discover", "contacts"] as const).map(tab => (
              <button key={tab} onClick={() => setActiveTab(tab)}
                className={`px-3 py-1 rounded-md text-xs font-medium transition-colors capitalize ${activeTab === tab ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground hover:bg-accent"}`}>
                {tab === "competitors" ? `Competitors (${competitors.length})` :
                 tab === "scrape" ? "Scrape Data" :
                 tab === "serp" ? `Market Intel${serpData ? " ✓" : ""}` :
                 tab === "discover" ? "⚡ Apify Discovery" :
                 tab === "contacts" ? `Contacts${enrichData ? ` (${(enrichData.hunter as Record<string,unknown[]> | null)?.emails?.length ?? 0})` : ""}` :
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

      {(data || enrichData) && (
        <CardContent className="pt-0 space-y-4">

          {/* Tab: Intelligence */}
          {activeTab === "intelligence" && data && (
            <>
              {fitScore !== undefined && (
                <div className="flex items-center gap-4 p-3 rounded-lg bg-gradient-to-r from-green-50 to-emerald-50 dark:from-green-900/20 dark:to-emerald-900/20 border border-green-200 dark:border-green-800">
                  <Trophy className="h-5 w-5 text-green-600 shrink-0" />
                  <div className="flex-1">
                    <p className="text-xs text-green-700 dark:text-green-400 font-medium">Coritiba FC Fit Score</p>
                    <p className="text-2xl font-bold text-green-800 dark:text-green-300">
                      {typeof fitScore === "number" ? `${fitScore}/10` : String(fitScore)}
                    </p>
                    {!!data?.coritiba_fit_rationale && <p className="text-xs text-green-700 dark:text-green-400 mt-0.5 line-clamp-2">{String(data.coritiba_fit_rationale)}</p>}
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
          {activeTab === "competitors" && data && (
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
          {activeTab === "scrape" && data && (
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
          {activeTab === "serp" && data && (
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
          {activeTab === "discover" && data && (
            <ApifyDiscoveryPanel
              companyId={companyId}
              companyName={companyName}
              industry={industry}
              website={website}
              existingIntelligence={data}
            />
          )}

          {/* Tab: Contacts (Hunter.io + Social + Ads) */}
          {activeTab === "contacts" && (
            <div className="space-y-4">
              {!enrichData ? (
                <div className="text-center py-8 text-muted-foreground text-sm">
                  <UserCheck className="h-8 w-8 mx-auto mb-2 opacity-20" />
                  <p>No contact data yet.</p>
                  {website && (
                    <Button size="sm" variant="outline" onClick={runEnrich} disabled={enrichLoading} className="mt-3 gap-1.5 text-blue-600 border-blue-200">
                      {enrichLoading ? <><Loader2 className="h-3 w-3 animate-spin" /> Enriching…</> : <><UserCheck className="h-3 w-3" /> Enrich {website}</>}
                    </Button>
                  )}
                </div>
              ) : (() => {
                const hunter = enrichData.hunter as HunterResult | null;
                const apollo = enrichData.apollo as ApolloEnrichment | null;
                const apolloOrg = apollo?.organization ?? null;
                const apolloPeople = (apollo?.decision_makers ?? []) as ApolloPersonRow[];
                const social = (enrichData.social as Record<string, unknown>) ?? null;
                const ads = social?.ads as AdsResult | null;
                const socialPresence = social?.social as SocialResult | null;
                const linkedin = social?.linkedin as LinkedInResult | null;
                const decisionMakers = (hunter?.decision_makers ?? []) as ContactRow[];
                const allContacts = (hunter?.emails ?? []) as ContactRow[];
                const otherContacts = allContacts.filter((e) => !decisionMakers.some((d) => d.email === e.email));

                return (
                  <>
                    {/* Apollo company intelligence */}
                    {apolloOrg && (
                      <div className="p-3 rounded-lg border bg-violet-50 dark:bg-violet-900/10 space-y-2">
                        <p className="text-xs font-semibold text-violet-700 dark:text-violet-400 uppercase tracking-wide flex items-center gap-1.5">
                          <Building2 className="h-3.5 w-3.5" /> Apollo Company Intelligence
                        </p>
                        <div className="grid grid-cols-2 gap-2 text-xs">
                          {apolloOrg.industry && <div><span className="text-muted-foreground">Industry:</span> <span className="font-medium capitalize">{apolloOrg.industry}</span></div>}
                          {apolloOrg.estimated_num_employees != null && <div><span className="text-muted-foreground">Employees:</span> <span className="font-medium">{apolloOrg.estimated_num_employees.toLocaleString()}</span></div>}
                          {apolloOrg.marketing_team_size != null && <div><span className="text-muted-foreground">Marketing team:</span> <span className="font-medium">~{apolloOrg.marketing_team_size.toLocaleString()}</span></div>}
                          {apolloOrg.annual_revenue_printed && <div><span className="text-muted-foreground">Revenue:</span> <span className="font-medium">{apolloOrg.annual_revenue_printed}</span></div>}
                          {apolloOrg.latest_funding_stage && <div><span className="text-muted-foreground">Funding:</span> <span className="font-medium capitalize">{apolloOrg.latest_funding_stage}</span></div>}
                          {(apolloOrg.city || apolloOrg.country) && <div><span className="text-muted-foreground">HQ:</span> <span className="font-medium">{[apolloOrg.city, apolloOrg.country].filter(Boolean).join(", ")}</span></div>}
                        </div>
                        {Object.keys(apolloOrg.departmental_head_count ?? {}).length > 0 && (
                          <div>
                            <p className="text-xs text-muted-foreground mb-1">Department headcount (top)</p>
                            <div className="flex flex-wrap gap-1">
                              {Object.entries(apolloOrg.departmental_head_count ?? {})
                                .sort(([, a], [, b]) => b - a)
                                .slice(0, 6)
                                .map(([dept, count]) => (
                                  <Badge key={dept} variant="outline" className="text-xs capitalize">{dept.replace(/_/g, " ")}: {count}</Badge>
                                ))}
                            </div>
                          </div>
                        )}
                        {apollo?.people_search_note && !apollo.people_search_available && (
                          <p className="text-xs text-amber-700 dark:text-amber-400">{apollo.people_search_note}</p>
                        )}
                        {apolloOrg.linkedin_url && (
                          <a href={apolloOrg.linkedin_url} target="_blank" rel="noopener noreferrer" className="text-xs text-violet-600 hover:underline flex items-center gap-1">
                            <Linkedin className="h-3 w-3" /> Company LinkedIn
                          </a>
                        )}
                      </div>
                    )}

                    {/* Apollo decision makers (paid plan) */}
                    {apolloPeople.length > 0 && (
                      <div>
                        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2 flex items-center gap-1.5">
                          <UserCheck className="h-3.5 w-3.5 text-violet-500" /> Apollo Decision Makers ({apolloPeople.length})
                        </p>
                        <div className="space-y-2">
                          {apolloPeople.map((p, i) => (
                            <div key={i} className="flex items-start gap-3 p-3 rounded-lg border bg-violet-50/50 dark:bg-violet-900/10">
                              <UserCheck className="h-4 w-4 text-violet-400 mt-0.5 shrink-0" />
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2 flex-wrap">
                                  <span className="text-sm font-semibold">{p.name}</span>
                                  {p.title && <Badge variant="outline" className="text-xs">{p.title}</Badge>}
                                  {p.seniority && <Badge variant="secondary" className="text-xs capitalize">{p.seniority}</Badge>}
                                </div>
                                {p.email && <p className="text-xs text-violet-700 dark:text-violet-300 mt-0.5">{p.email}</p>}
                              </div>
                              {p.linkedin_url && (
                                <a href={p.linkedin_url} target="_blank" rel="noopener noreferrer" className="text-muted-foreground hover:text-violet-600 shrink-0">
                                  <Linkedin className="h-3.5 w-3.5" />
                                </a>
                              )}
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Hunter decision makers */}
                    {decisionMakers.length > 0 && (
                      <div>
                        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2 flex items-center gap-1.5">
                          <UserCheck className="h-3.5 w-3.5 text-blue-500" /> Hunter Decision Makers ({decisionMakers.length})
                        </p>
                        <div className="space-y-2">
                          {decisionMakers.map((c, i) => (
                            <div key={i} className="flex items-start gap-3 p-3 rounded-lg border bg-blue-50/50 dark:bg-blue-900/10">
                              <Mail className="h-4 w-4 text-blue-400 mt-0.5 shrink-0" />
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2 flex-wrap">
                                  <span className="text-sm font-semibold">{c.full_name || c.email}</span>
                                  {c.position && <Badge variant="outline" className="text-xs">{c.position}</Badge>}
                                  {c.seniority && <Badge variant="secondary" className="text-xs capitalize">{c.seniority}</Badge>}
                                  <span className="text-xs text-muted-foreground ml-auto">{c.confidence}% confidence</span>
                                </div>
                                <p className="text-xs text-blue-700 dark:text-blue-300 mt-0.5">{c.email}</p>
                                {c.department && <p className="text-xs text-muted-foreground">{c.department}</p>}
                              </div>
                              {c.linkedin && (
                                <a href={c.linkedin} target="_blank" rel="noopener noreferrer" className="text-muted-foreground hover:text-blue-600 shrink-0">
                                  <Linkedin className="h-3.5 w-3.5" />
                                </a>
                              )}
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Other contacts */}
                    {otherContacts.length > 0 && (
                      <div>
                        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2 flex items-center gap-1.5">
                          <Mail className="h-3.5 w-3.5" /> All Contacts ({allContacts.length} found via Hunter.io)
                        </p>
                        <div className="space-y-1.5 max-h-48 overflow-y-auto">
                          {otherContacts.map((c, i) => (
                            <div key={i} className="flex items-center gap-2 p-2 rounded border text-sm bg-muted/20">
                              <Mail className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                              <span className="flex-1 truncate">{c.email}</span>
                              {c.full_name && <span className="text-xs text-muted-foreground truncate max-w-[120px]">{c.full_name}</span>}
                              {c.position && <span className="text-xs text-muted-foreground truncate max-w-[100px]">{c.position}</span>}
                              <span className="text-xs text-muted-foreground shrink-0">{c.confidence}%</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* LinkedIn org info */}
                    {linkedin && (
                      <div className="p-3 rounded-lg border bg-sky-50 dark:bg-sky-900/10 space-y-2">
                        <p className="text-xs font-semibold text-sky-700 dark:text-sky-400 uppercase tracking-wide flex items-center gap-1.5">
                          <Linkedin className="h-3.5 w-3.5" /> LinkedIn Profile
                        </p>
                        <div className="grid grid-cols-2 gap-2 text-xs">
                          {linkedin.employee_count && <div><span className="text-muted-foreground">Employees:</span> <span className="font-medium">{linkedin.employee_count}</span></div>}
                          {linkedin.founded && <div><span className="text-muted-foreground">Founded:</span> <span className="font-medium">{linkedin.founded}</span></div>}
                          {linkedin.headquarters && <div><span className="text-muted-foreground">HQ:</span> <span className="font-medium">{linkedin.headquarters}</span></div>}
                          {linkedin.follower_count && <div><span className="text-muted-foreground">Followers:</span> <span className="font-medium">{linkedin.follower_count.toLocaleString()}</span></div>}
                        </div>
                        {linkedin.description && <p className="text-xs text-sky-900 dark:text-sky-100 line-clamp-2">{linkedin.description}</p>}
                        {(linkedin.specialties?.length ?? 0) > 0 && (
                          <div className="flex flex-wrap gap-1 mt-1">
                            {(linkedin.specialties as string[]).slice(0, 5).map((s, i) => (
                              <Badge key={i} variant="outline" className="text-xs">{s}</Badge>
                            ))}
                          </div>
                        )}
                        {linkedin.linkedin_url && (
                          <a href={linkedin.linkedin_url} target="_blank" rel="noopener noreferrer" className="text-xs text-sky-600 hover:underline flex items-center gap-1">
                            <Linkedin className="h-3 w-3" /> View on LinkedIn
                          </a>
                        )}
                        {(linkedin.leadership?.length ?? 0) > 0 && (
                          <div>
                            <p className="text-xs text-muted-foreground mb-1">Leadership found:</p>
                            <div className="flex flex-wrap gap-1">
                              {(linkedin.leadership as Array<{ name: string; title: string }>).map((l, i) => (
                                <Badge key={i} variant="outline" className="text-xs">{l.name} — {l.title}</Badge>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    )}

                    {/* Ads signals */}
                    {ads && (
                      <div className="p-3 rounded-lg border space-y-2">
                        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide flex items-center gap-1.5">
                          <Megaphone className="h-3.5 w-3.5 text-orange-400" /> Active Ad Signals
                        </p>
                        <div className="flex flex-wrap gap-2 text-xs">
                          <Badge variant={ads.has_active_google_ads ? "default" : "outline"} className={ads.has_active_google_ads ? "bg-orange-100 text-orange-800 hover:bg-orange-100" : ""}>
                            Google Ads: {ads.has_active_google_ads ? "Active" : "None detected"}
                          </Badge>
                          <Badge variant={ads.has_active_meta_ads ? "default" : "outline"} className={ads.has_active_meta_ads ? "bg-blue-100 text-blue-800 hover:bg-blue-100" : ""}>
                            Meta Ads: {ads.has_active_meta_ads ? "Active" : "None detected"}
                          </Badge>
                          <Badge variant="outline" className="capitalize">
                            Spend signal: {ads.estimated_ad_spend_signal}
                          </Badge>
                        </div>
                        {(ads.active_campaigns?.length ?? 0) > 0 && (
                          <div className="flex flex-wrap gap-1">
                            {(ads.active_campaigns as string[]).map((c, i) => (
                              <Badge key={i} variant="secondary" className="text-xs">{c}</Badge>
                            ))}
                          </div>
                        )}
                        {(ads.ad_headlines?.length ?? 0) > 0 && (
                          <div>
                            <p className="text-xs text-muted-foreground mb-1">Ad headlines detected:</p>
                            {(ads.ad_headlines as string[]).filter(Boolean).map((h, i) => (
                              <p key={i} className="text-xs italic text-muted-foreground">"{h}"</p>
                            ))}
                          </div>
                        )}
                      </div>
                    )}

                    {/* Social presence */}
                    {socialPresence && (
                      <div className="p-3 rounded-lg border space-y-2">
                        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Social Presence (score: {socialPresence.total_social_score}/10)</p>
                        <div className="flex flex-wrap gap-2">
                          {socialPresence.instagram_handle && <Badge variant="outline" className="text-xs gap-1"><Instagram className="h-3 w-3" />@{socialPresence.instagram_handle}</Badge>}
                          {socialPresence.twitter_handle && <Badge variant="outline" className="text-xs gap-1"><Twitter className="h-3 w-3" />@{socialPresence.twitter_handle}</Badge>}
                          {socialPresence.linkedin_url && <Badge variant="outline" className="text-xs gap-1"><Linkedin className="h-3 w-3" />LinkedIn</Badge>}
                          {socialPresence.facebook_url && <Badge variant="outline" className="text-xs gap-1"><Facebook className="h-3 w-3" />Facebook</Badge>}
                          {socialPresence.youtube_url && <Badge variant="outline" className="text-xs gap-1"><Youtube className="h-3 w-3" />YouTube</Badge>}
                        </div>
                      </div>
                    )}

                    {decisionMakers.length === 0 && apolloPeople.length === 0 && !apolloOrg && !linkedin && (
                      <div className="text-center py-4 text-muted-foreground text-sm">
                        <p>No enrichment data yet. Configure <code className="text-xs bg-muted px-1 py-0.5 rounded">HUNTER_API_KEY</code> and <code className="text-xs bg-muted px-1 py-0.5 rounded">APOLLO_API_KEY</code>.</p>
                      </div>
                    )}
                  </>
                );
              })()}
            </div>
          )}
        </CardContent>
      )}
    </Card>
  );
}

// ── Local type aliases for enrichment data ────────────────────────────────────

type ContactRow = {
  email: string;
  full_name?: string;
  first_name?: string | null;
  last_name?: string | null;
  position?: string | null;
  seniority?: string | null;
  department?: string | null;
  linkedin?: string | null;
  confidence?: number;
};

type HunterResult = {
  emails?: ContactRow[];
  decision_makers?: ContactRow[];
  total_emails_found?: number;
  organization?: string | null;
};

type AdsResult = {
  has_active_google_ads?: boolean;
  has_active_meta_ads?: boolean;
  ad_headlines?: string[];
  ad_descriptions?: string[];
  estimated_ad_spend_signal?: string;
  active_campaigns?: string[];
};

type SocialResult = {
  instagram_handle?: string | null;
  twitter_handle?: string | null;
  linkedin_url?: string | null;
  facebook_url?: string | null;
  youtube_url?: string | null;
  total_social_score?: number;
};

type LinkedInResult = {
  name?: string | null;
  description?: string | null;
  employee_count?: string | null;
  founded?: string | null;
  headquarters?: string | null;
  follower_count?: number | null;
  linkedin_url?: string | null;
  industry?: string | null;
  specialties?: string[];
  leadership?: Array<{ name: string; title: string; linkedin_url?: string }>;
};

type ApolloEnrichment = {
  organization?: ApolloOrgRow | null;
  decision_makers?: ApolloPersonRow[];
  people_search_available?: boolean;
  people_search_note?: string | null;
};

type ApolloOrgRow = {
  name?: string | null;
  industry?: string | null;
  estimated_num_employees?: number | null;
  marketing_team_size?: number | null;
  annual_revenue_printed?: string | null;
  latest_funding_stage?: string | null;
  city?: string | null;
  country?: string | null;
  linkedin_url?: string | null;
  departmental_head_count?: Record<string, number>;
};

type ApolloPersonRow = {
  name: string;
  title?: string | null;
  email?: string | null;
  linkedin_url?: string | null;
  seniority?: string | null;
};

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
