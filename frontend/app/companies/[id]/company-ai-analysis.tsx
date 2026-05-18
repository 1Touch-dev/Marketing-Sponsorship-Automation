"use client";

import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Brain, Sparkles, TrendingUp, Users, Target, Lightbulb,
  Trophy, RotateCcw,
} from "lucide-react";

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
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<Record<string, unknown> | null>(intelligence);

  async function runAnalysis() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/companies/intelligence", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ company_id: companyId, company_name: companyName, industry, website, notes }),
      });
      const j = await res.json();
      if (!res.ok) throw new Error(j?.error ?? "Analysis failed");
      setData(j.intelligence);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setLoading(false);
    }
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <CardTitle className="text-base flex items-center gap-2">
            <Brain className="h-4 w-4 text-purple-500" />
            AI Company Intelligence
            {data && <Badge variant="secondary" className="text-xs ml-1">Analyzed</Badge>}
          </CardTitle>
          <Button
            variant={data ? "outline" : "default"}
            size="sm"
            onClick={runAnalysis}
            disabled={loading}
          >
            {loading ? (
              <><span className="animate-spin mr-1">⏳</span> Analyzing…</>
            ) : data ? (
              <><RotateCcw className="h-3.5 w-3.5 mr-1" /> Re-analyze</>
            ) : (
              <><Sparkles className="h-3.5 w-3.5 mr-1" /> Run AI Analysis</>
            )}
          </Button>
        </div>
        {!data && (
          <p className="text-xs text-muted-foreground mt-1">
            AI will analyze {companyName}&apos;s business, sponsorship fit, marketing goals,
            competitor positioning, and recommended Coritiba FC partnership strategy.
          </p>
        )}
      </CardHeader>

      {error && (
        <CardContent className="pt-0">
          <div className="text-sm text-destructive bg-destructive/10 rounded-md p-2">{error}</div>
        </CardContent>
      )}

      {/* Intelligence content — always visible when data exists, no collapse */}
      {data && (
        <CardContent className="pt-0 space-y-4">
          {/* Sponsorship Fit Score */}
          {!!data.sponsorship_fit_score && (
            <div className="flex items-center gap-3 p-3 rounded-lg bg-green-50 border border-green-100">
              <Trophy className="h-5 w-5 text-green-600 shrink-0" />
              <div>
                <p className="text-xs text-green-700 font-medium">Sponsorship Fit Score</p>
                <p className="text-xl font-bold text-green-800">
                  {typeof data.sponsorship_fit_score === "number"
                    ? `${data.sponsorship_fit_score}/10`
                    : String(data.sponsorship_fit_score).replace(/\/10.*/, "/10")}
                </p>
              </div>
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {!!data.marketing_goals && (
              <IntelSection
                icon={<Target className="h-4 w-4 text-blue-500" />}
                title="Marketing Goals"
                content={data.marketing_goals}
              />
            )}
            {!!data.brand_positioning && (
              <IntelSection
                icon={<TrendingUp className="h-4 w-4 text-purple-500" />}
                title="Brand Positioning"
                content={data.brand_positioning}
              />
            )}
            {!!data.target_audience && (
              <IntelSection
                icon={<Users className="h-4 w-4 text-orange-500" />}
                title="Target Audience"
                content={data.target_audience}
              />
            )}
            {!!data.audience_alignment && (
              <IntelSection
                icon={<Users className="h-4 w-4 text-green-500" />}
                title="Audience Alignment"
                content={data.audience_alignment}
              />
            )}
            {!!data.recommended_direction && (
              <IntelSection
                icon={<Lightbulb className="h-4 w-4 text-yellow-500" />}
                title="Recommended Partnership Direction"
                content={data.recommended_direction}
                wide
              />
            )}
            {!!data.products_services && (
              <IntelSection
                icon={<Brain className="h-4 w-4 text-gray-500" />}
                title="Products & Services"
                content={data.products_services}
              />
            )}
            {!!data.sponsorship_fit_rationale && (
              <IntelSection
                icon={<Trophy className="h-4 w-4 text-green-500" />}
                title="Fit Rationale"
                content={data.sponsorship_fit_rationale}
                wide
              />
            )}
          </div>

          {/* Activation Ideas */}
          {!!data.sponsorship_activation_ideas && (
            <div className="p-3 rounded-lg bg-purple-50 border border-purple-100">
              <p className="text-xs font-medium text-purple-700 uppercase tracking-wide mb-2">
                💡 Activation Ideas (Coritiba FC)
              </p>
              <p className="text-sm text-purple-900 whitespace-pre-line leading-relaxed">
                {String(data.sponsorship_activation_ideas)}
              </p>
            </div>
          )}

          {/* Global inspiration */}
          {!!data.global_inspiration && (
            <div className="p-3 rounded-lg bg-blue-50 border border-blue-100">
              <p className="text-xs font-medium text-blue-700 uppercase tracking-wide mb-2">
                🌍 Global Inspiration
              </p>
              <p className="text-sm text-blue-900 leading-relaxed">
                {String(data.global_inspiration)}
              </p>
            </div>
          )}

          {/* Competitor list from AI */}
          {Array.isArray(data.competitor_brands) && (data.competitor_brands as string[]).length > 0 && (
            <div>
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-2">
                Identified Competitors
              </p>
              <div className="flex flex-wrap gap-1.5">
                {(data.competitor_brands as string[]).map((c, i) => (
                  <Badge key={i} variant="outline" className="text-xs">{c}</Badge>
                ))}
              </div>
            </div>
          )}

          {/* Local context */}
          {!!data.local_context && (
            <div className="p-3 rounded-lg bg-muted/50 border">
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-1">
                Curitiba / Paraná Context
              </p>
              <p className="text-sm leading-relaxed">{String(data.local_context)}</p>
            </div>
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
