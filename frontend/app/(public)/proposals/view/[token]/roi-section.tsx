import type { ProposalRoiData } from "@/lib/proposals/roi";

function formatViews(n: number): string {
  const trim = (v: number) => (Number.isInteger(v) ? String(v) : v.toFixed(1));
  if (n >= 1_000_000) return `${trim(n / 1_000_000)}M`;
  if (n >= 1_000) return `${trim(n / 1_000)}mil`;
  return String(n);
}

const STAT_CARDS: Array<{ key: keyof ProposalRoiData; label: string; accent: string }> = [
  { key: "total_official_views", label: "Canais oficiais", accent: "text-[#006B3F]" },
  { key: "total_unofficial_fan_views", label: "Torcida / fãs", accent: "text-emerald-600" },
  { key: "total_media_tv_radio_views", label: "Mídia / TV / Rádio", accent: "text-indigo-600" },
  { key: "total_rival_account_views", label: "Contas rivais", accent: "text-slate-500" },
];

/**
 * Phase 5 — sponsor-facing real-time ROI dashboard, see
 * lib/proposals/roi.ts. Grounded entirely in real match_media_reach data
 * entered by staff after each match — never renders unless real numbers
 * exist for at least one match (roi.has_data), so a brand-new sponsorship
 * never shows a hollow, all-zero "dashboard."
 */
export function ProposalRoiSection({ roi }: { roi: ProposalRoiData }) {
  if (!roi.has_data) return null;

  return (
    <section className="max-w-5xl mx-auto px-6 py-12 print:break-inside-avoid">
      <div className="text-center mb-8">
        <h2 className="text-2xl font-bold text-slate-800">Desempenho em Tempo Real</h2>
        <p className="text-sm text-slate-500 mt-1">
          Alcance real de exposição desde o início da parceria — {roi.matches_covered} jogo
          {roi.matches_covered !== 1 ? "s" : ""} contabilizado{roi.matches_covered !== 1 ? "s" : ""}
        </p>
      </div>

      <div className="rounded-2xl border border-slate-200 bg-gradient-to-br from-[#006B3F]/5 to-transparent p-6 mb-6 text-center">
        <div className="text-4xl font-extrabold text-[#006B3F]">{formatViews(roi.total_reach)}</div>
        <div className="text-sm text-slate-600 mt-1">visualizações combinadas de exposição da marca</div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-8">
        {STAT_CARDS.map((c) => (
          <div key={c.label} className="rounded-xl border border-slate-200 bg-white p-4 text-center">
            <div className={`text-xl font-bold ${c.accent}`}>{formatViews(roi[c.key] as number)}</div>
            <div className="text-xs text-slate-500 mt-1">{c.label}</div>
          </div>
        ))}
      </div>

      {roi.deliverables.length > 0 && (
        <div className="mb-8">
          <h3 className="text-sm font-semibold text-slate-700 mb-2">Contrapartidas ativas</h3>
          <div className="flex flex-wrap gap-2">
            {roi.deliverables.map((d, i) => (
              <span key={i} className="inline-flex items-center rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs text-slate-600">
                {d.name}
                {d.quantity && d.quantity > 1 ? ` × ${d.quantity}` : ""}
              </span>
            ))}
          </div>
        </div>
      )}

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs text-slate-400 border-b border-slate-200">
              <th className="py-2 font-medium">Jogo</th>
              <th className="py-2 font-medium">Resultado</th>
              <th className="py-2 font-medium text-right">Alcance total</th>
            </tr>
          </thead>
          <tbody>
            {roi.matches.map((m) => {
              const matchTotal = m.official_views + m.unofficial_fan_views + m.rival_account_views + m.media_tv_radio_views;
              return (
                <tr key={m.id} className="border-b border-slate-100 last:border-0">
                  <td className="py-2.5 text-slate-700">
                    Coritiba × {m.opponent}
                    {m.competition ? <span className="text-slate-400"> · {m.competition}</span> : null}
                  </td>
                  <td className="py-2.5 text-slate-500">{m.result ?? "—"}</td>
                  <td className="py-2.5 text-right font-medium text-slate-700">{formatViews(matchTotal)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}
