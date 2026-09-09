import type { FulfillmentData } from "@/lib/proposals/fulfillment";

function formatDatePt(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString("pt-BR", { day: "2-digit", month: "short", year: "numeric" });
}

/**
 * Phase 6 — proof-of-delivery timeline, see lib/proposals/fulfillment.ts.
 * Only renders when real fulfillment events exist (fulfillment.has_data).
 */
export function FulfillmentSection({ fulfillment }: { fulfillment: FulfillmentData }) {
  if (!fulfillment.has_data) return null;

  return (
    <section className="max-w-5xl mx-auto px-6 py-12 print:break-inside-avoid">
      <div className="text-center mb-8">
        <h2 className="text-2xl font-bold text-slate-800">Comprovação de Entrega</h2>
        <p className="text-sm text-slate-500 mt-1">Cada item abaixo é um evento real, com data — não uma projeção</p>
      </div>

      <div className="space-y-4">
        {fulfillment.events.map((e, i) => (
          <div key={i} className="flex gap-4 rounded-xl border border-slate-200 bg-white p-4">
            {e.image_url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={e.image_url} alt={e.label} className="w-20 h-20 rounded-lg object-cover border border-slate-100 shrink-0" />
            ) : (
              <div className="w-20 h-20 rounded-lg bg-[#006B3F]/5 border border-slate-100 shrink-0 flex items-center justify-center">
                <span className="text-[#006B3F] text-2xl">✓</span>
              </div>
            )}
            <div className="min-w-0">
              <div className="text-xs text-slate-400">{formatDatePt(e.date)}</div>
              <div className="font-medium text-slate-800 mt-0.5">{e.label}</div>
              {e.detail && <div className="text-xs text-slate-500 mt-0.5">{e.detail}</div>}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
