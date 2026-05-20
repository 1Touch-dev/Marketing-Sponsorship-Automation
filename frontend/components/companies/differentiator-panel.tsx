"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Loader2, Zap, Star, Target, Mail, TrendingUp, Users, RefreshCw } from "lucide-react";

interface DifferentiatorData {
  brand_strengths?: string[];
  competitor_gaps?: string[];
  unique_angles?: string[];
  campaign_themes?: Array<{
    theme: string;
    description: string;
    why_it_fits: string;
    call_to_action: string;
  }>;
  personalised_proposal_intro?: string;
  personalised_outreach_email?: string;
  sponsorship_fit?: {
    score: number;
    reasoning: string;
    best_format: string;
    ideal_package: string;
  };
  competitive_advantage_summary?: string;
}

export function DifferentiatorPanel({
  companyId,
  companyName,
}: {
  companyId: string;
  companyName: string;
}) {
  const [data, setData] = useState<DifferentiatorData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<"overview" | "themes" | "outreach">("overview");

  async function run() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/companies/${companyId}/differentiators`, { method: "POST" });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Failed");
      setData(json.differentiators);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error");
    } finally {
      setLoading(false);
    }
  }

  async function loadCached() {
    setLoading(true);
    try {
      const res = await fetch(`/api/companies/${companyId}/differentiators`);
      const json = await res.json();
      if (json.differentiators) setData(json.differentiators);
    } finally {
      setLoading(false);
    }
  }

  // Load cached on first render
  if (!data && !loading && !error) {
    loadCached();
  }

  const fitScore = data?.sponsorship_fit?.score ?? 0;
  const fitColor =
    fitScore >= 8 ? "text-emerald-600" :
    fitScore >= 6 ? "text-amber-600" : "text-red-500";

  return (
    <div className="rounded-xl border border-slate-200 bg-white overflow-hidden">
      {/* Header */}
      <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="h-7 w-7 rounded-lg bg-violet-100 flex items-center justify-center">
            <Zap className="h-4 w-4 text-violet-600" />
          </div>
          <div>
            <div className="text-sm font-semibold text-slate-800">Differentiator Analysis</div>
            <div className="text-xs text-slate-500">Competitive position vs industry</div>
          </div>
        </div>
        <Button
          size="sm"
          variant={data ? "outline" : "default"}
          onClick={run}
          disabled={loading}
          className={data ? "" : "bg-violet-600 hover:bg-violet-700 text-white"}
        >
          {loading ? (
            <><Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />Analysing…</>
          ) : data ? (
            <><RefreshCw className="h-3.5 w-3.5 mr-1.5" />Re-run</>
          ) : (
            <><Zap className="h-3.5 w-3.5 mr-1.5" />Analyse</>
          )}
        </Button>
      </div>

      {error && (
        <div className="px-5 py-3 text-sm text-red-600 bg-red-50 border-b border-red-100">{error}</div>
      )}

      {!data && !loading && !error && (
        <div className="px-5 py-8 text-center text-sm text-slate-500">
          <Zap className="h-8 w-8 text-slate-300 mx-auto mb-2" />
          <p>Run analysis to see how <strong>{companyName}</strong> differentiates from competitors</p>
          <p className="text-xs mt-1 text-slate-400">Generates personalised proposal angles, outreach emails, and campaign themes</p>
        </div>
      )}

      {loading && (
        <div className="px-5 py-8 text-center text-sm text-slate-500">
          <Loader2 className="h-7 w-7 animate-spin text-violet-400 mx-auto mb-2" />
          <p>Comparing against competitors…</p>
        </div>
      )}

      {data && (
        <>
          {/* Fit score */}
          {data.sponsorship_fit && (
            <div className="px-5 py-3 bg-slate-50 border-b border-slate-100 flex items-center gap-4">
              <div>
                <div className="text-xs text-slate-500">Sponsorship Fit</div>
                <div className={`text-2xl font-bold ${fitColor}`}>{fitScore.toFixed(1)}<span className="text-sm font-normal text-slate-400">/10</span></div>
              </div>
              <div className="flex-1">
                <div className="text-xs font-medium text-slate-600">{data.sponsorship_fit.best_format?.replace(/_/g, " ")}</div>
                <div className="text-xs text-slate-500 mt-0.5 line-clamp-2">{data.sponsorship_fit.reasoning}</div>
              </div>
            </div>
          )}

          {/* Tabs */}
          <div className="flex border-b border-slate-100">
            {([
              { key: "overview", label: "Overview" },
              { key: "themes", label: "Campaign Themes" },
              { key: "outreach", label: "Outreach" },
            ] as const).map(t => (
              <button
                key={t.key}
                onClick={() => setTab(t.key)}
                className={`flex-1 py-2 text-xs font-medium transition-colors ${
                  tab === t.key
                    ? "text-violet-700 border-b-2 border-violet-600 bg-violet-50/50"
                    : "text-slate-500 hover:text-slate-700"
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>

          <div className="p-5 space-y-4 max-h-[500px] overflow-y-auto">
            {tab === "overview" && (
              <>
                {data.competitive_advantage_summary && (
                  <div className="rounded-lg bg-violet-50 border border-violet-200 p-3">
                    <div className="text-xs font-semibold text-violet-700 mb-1 flex items-center gap-1">
                      <Star className="h-3 w-3" />Competitive Advantage
                    </div>
                    <p className="text-xs text-violet-800 leading-relaxed">{data.competitive_advantage_summary}</p>
                  </div>
                )}

                {data.brand_strengths && data.brand_strengths.length > 0 && (
                  <div>
                    <div className="text-xs font-semibold text-slate-600 mb-2 flex items-center gap-1">
                      <TrendingUp className="h-3.5 w-3.5 text-emerald-500" />Brand Strengths
                    </div>
                    <ul className="space-y-1">
                      {data.brand_strengths.map((s, i) => (
                        <li key={i} className="flex items-start gap-2 text-xs text-slate-700">
                          <span className="text-emerald-500 font-bold mt-0.5">+</span>{s}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {data.competitor_gaps && data.competitor_gaps.length > 0 && (
                  <div>
                    <div className="text-xs font-semibold text-slate-600 mb-2 flex items-center gap-1">
                      <Target className="h-3.5 w-3.5 text-amber-500" />Competitor Gaps to Exploit
                    </div>
                    <ul className="space-y-1">
                      {data.competitor_gaps.map((g, i) => (
                        <li key={i} className="flex items-start gap-2 text-xs text-slate-700">
                          <span className="text-amber-500 font-bold mt-0.5">→</span>{g}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {data.sponsorship_fit?.ideal_package && (
                  <div className="rounded-lg bg-blue-50 border border-blue-100 p-3">
                    <div className="text-xs font-semibold text-blue-700 mb-1 flex items-center gap-1">
                      <Users className="h-3 w-3" />Ideal Package
                    </div>
                    <p className="text-xs text-blue-800 leading-relaxed">{data.sponsorship_fit.ideal_package}</p>
                  </div>
                )}
              </>
            )}

            {tab === "themes" && (
              <div className="space-y-3">
                {data.campaign_themes?.map((t, i) => (
                  <div key={i} className="rounded-lg border border-slate-200 p-3">
                    <div className="flex items-center gap-2 mb-1">
                      <Badge variant="outline" className="text-[10px] h-4">{i + 1}</Badge>
                      <span className="text-xs font-semibold text-slate-800">{t.theme}</span>
                    </div>
                    <p className="text-xs text-slate-600 mb-2">{t.description}</p>
                    <div className="text-xs text-indigo-700 bg-indigo-50 rounded px-2 py-1">
                      <span className="font-medium">Why it fits: </span>{t.why_it_fits}
                    </div>
                    {t.call_to_action && (
                      <div className="text-xs text-slate-500 mt-1 italic">&ldquo;{t.call_to_action}&rdquo;</div>
                    )}
                  </div>
                ))}
              </div>
            )}

            {tab === "outreach" && (
              <>
                {data.personalised_proposal_intro && (
                  <div>
                    <div className="text-xs font-semibold text-slate-600 mb-1">Personalized Proposal Intro</div>
                    <div className="text-xs text-slate-700 leading-relaxed bg-slate-50 rounded-lg border border-slate-200 p-3">
                      {data.personalised_proposal_intro}
                    </div>
                  </div>
                )}
                {data.personalised_outreach_email && (
                  <div>
                    <div className="text-xs font-semibold text-slate-600 mb-1 flex items-center gap-1">
                      <Mail className="h-3 w-3" />Cold Outreach Email
                    </div>
                    <pre className="text-xs text-slate-700 leading-relaxed whitespace-pre-wrap bg-slate-50 rounded-lg border border-slate-200 p-3 font-sans">
                      {data.personalised_outreach_email}
                    </pre>
                  </div>
                )}
              </>
            )}
          </div>
        </>
      )}
    </div>
  );
}
