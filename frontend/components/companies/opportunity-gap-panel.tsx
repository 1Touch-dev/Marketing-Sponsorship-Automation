"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Loader2, Compass, RefreshCw, AlertCircle } from "lucide-react";

interface OpportunityGapData {
  grounded: boolean;
  current_sponsorship_summary?: string;
  gap_summary?: string;
  opportunity_angle?: string;
  generated_at?: string;
}

export function OpportunityGapPanel({
  companyId,
  companyName,
}: {
  companyId: string;
  companyName: string;
}) {
  const [data, setData] = useState<OpportunityGapData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function run() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/companies/${companyId}/opportunity-gap`, { method: "POST" });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Failed");
      setData(json.opportunity_gap);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        const res = await fetch(`/api/companies/${companyId}/opportunity-gap`);
        const json = await res.json();
        if (json.opportunity_gap) setData(json.opportunity_gap);
      } catch {
        // No cached data yet — user can run it
      } finally {
        setLoading(false);
      }
    })();
  }, [companyId]);

  return (
    <div className="rounded-xl border border-slate-200 bg-white overflow-hidden">
      <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="h-7 w-7 rounded-lg bg-sky-100 flex items-center justify-center">
            <Compass className="h-4 w-4 text-sky-600" />
          </div>
          <div>
            <div className="text-sm font-semibold text-slate-800">Opportunity Gap</div>
            <div className="text-xs text-slate-500">White-space in their sponsorship presence</div>
          </div>
        </div>
        <Button
          size="sm"
          variant={data ? "outline" : "default"}
          onClick={run}
          disabled={loading}
          className={data ? "" : "bg-sky-600 hover:bg-sky-700 text-white"}
        >
          {loading ? (
            <><Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />Analisando…</>
          ) : data ? (
            <><RefreshCw className="h-3.5 w-3.5 mr-1.5" />Re-executar</>
          ) : (
            <><Compass className="h-3.5 w-3.5 mr-1.5" />Analisar</>
          )}
        </Button>
      </div>

      {error && (
        <div className="px-5 py-3 text-sm text-red-600 bg-red-50 border-b border-red-100">{error}</div>
      )}

      {!data && !loading && !error && (
        <div className="px-5 py-8 text-center text-sm text-slate-500">
          <Compass className="h-8 w-8 text-slate-300 mx-auto mb-2" />
          <p>Identifique onde <strong>{companyName}</strong> tem menos presença em patrocínio</p>
          <p className="text-xs mt-1 text-slate-400">Baseado apenas em dados reais já coletados sobre a empresa</p>
        </div>
      )}

      {loading && !data && (
        <div className="px-5 py-8 text-center text-sm text-slate-500">
          <Loader2 className="h-7 w-7 animate-spin text-sky-400 mx-auto mb-2" />
          <p>Buscando white-space…</p>
        </div>
      )}

      {data && (
        <div className="p-5 space-y-3">
          {!data.grounded && (
            <div className="flex items-start gap-2 rounded-lg bg-amber-50 border border-amber-200 p-2.5 text-xs text-amber-800">
              <AlertCircle className="h-3.5 w-3.5 shrink-0 mt-0.5" />
              <span>Sem dados reais de patrocínio para esta empresa ainda — análise em termos gerais do setor. Rode a Análise de Inteligência ou Descoberta de Competidores para refinar.</span>
            </div>
          )}

          {data.current_sponsorship_summary && (
            <div>
              <div className="text-xs font-semibold text-slate-600 mb-1">Presença Atual</div>
              <p className="text-xs text-slate-700 leading-relaxed bg-slate-50 rounded-lg border border-slate-200 p-3">
                {data.current_sponsorship_summary}
              </p>
            </div>
          )}

          {data.gap_summary && (
            <div>
              <div className="text-xs font-semibold text-slate-600 mb-1">Oportunidade Identificada</div>
              <p className="text-xs text-sky-800 leading-relaxed bg-sky-50 rounded-lg border border-sky-200 p-3">
                {data.gap_summary}
              </p>
            </div>
          )}

          {data.opportunity_angle && (
            <div>
              <div className="text-xs font-semibold text-slate-600 mb-1">Ângulo de Abordagem</div>
              <p className="text-xs text-emerald-800 leading-relaxed bg-emerald-50 rounded-lg border border-emerald-200 p-3">
                {data.opportunity_angle}
              </p>
            </div>
          )}

          <div className="flex items-center gap-2 pt-1">
            <Badge variant="outline" className="text-[10px] h-4">
              {data.grounded ? "Baseado em dados reais" : "Framing genérico do setor"}
            </Badge>
          </div>
        </div>
      )}
    </div>
  );
}
