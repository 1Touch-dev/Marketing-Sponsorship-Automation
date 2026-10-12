import Link from "next/link";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { supabaseAdmin } from "@/lib/supabase/server";
import { PORTAL_COOKIE } from "@/lib/portal/session";
import { resolvePortalSession } from "@/lib/portal/guard";
import { portalRecap } from "@/lib/portal/data";
import { getTenantById } from "@/lib/tenants/current";
import { CORITIBA_TENANT_ID } from "@/lib/tenants/types";
import { PortalShell } from "../../portal-shell";

export const dynamic = "force-dynamic";

const DEFAULT_CLUB_NAME = "Coritiba FC";
const DEFAULT_CREST = "/brand/coritiba-crest.png";
const COUNTS = [
  ["sold", "Vendidos"],
  ["scheduled", "Agendados"],
  ["delivered", "Entregues"],
  ["evidenced", "Com comprovação"],
  ["accepted", "Aceitos"],
] as const;

function countOf(commitments: unknown, key: string): number | null {
  if (!commitments || typeof commitments !== "object") return null;
  const value = (commitments as Record<string, unknown>)[key];
  return typeof value === "number" ? value : null;
}

export default async function PortalRecapPage({ params }: { params: { id: string } }) {
  const sb = supabaseAdmin();
  const auth = await resolvePortalSession(sb, cookies().get(PORTAL_COOKIE)?.value);
  if (!auth.ok) {
    if (auth.reason === "access_ended" || auth.reason === "contact_removed") {
      return (
        <PortalShell clubName={DEFAULT_CLUB_NAME} crestUrl={DEFAULT_CREST}>
          <p role="alert" className="rounded-2xl bg-white border border-slate-200 p-8 text-center text-sm text-slate-700">{auth.error}</p>
        </PortalShell>
      );
    }
    redirect("/portal/login");
  }

  const { ctx } = auth;
  const tenant = await getTenantById(ctx.tenantId);
  const isCoritiba = !tenant || tenant.id === CORITIBA_TENANT_ID;
  const clubName = tenant?.club_facts.short_name ?? tenant?.club_facts.club_name ?? DEFAULT_CLUB_NAME;
  const crestUrl = isCoritiba ? DEFAULT_CREST : (tenant?.branding.crest_url ?? tenant?.branding.logo_url ?? null);

  const shown = await portalRecap(sb, ctx, params.id);
  const recap = shown.ok ? shown.value : null;
  const contract = recap && recap.contract && typeof recap.contract === "object" ? recap.contract as Record<string, unknown> : null;
  const title = typeof contract?.title === "string" ? contract.title : "Recap";
  const periodStart = typeof contract?.start_date === "string" ? contract.start_date : null;
  const periodEnd = typeof contract?.end_date === "string" ? contract.end_date : null;
  const measured = Array.isArray(recap?.measured) ? recap.measured as Array<Record<string, unknown>> : [];
  const openItems = typeof recap?.open_items === "number" ? recap.open_items : 0;

  return (
    <PortalShell clubName={clubName} crestUrl={crestUrl} companyName={ctx.companyName}>
      <Link href="/portal" className="text-sm text-slate-500 hover:text-slate-800">Voltar</Link>
      {!shown.ok && (
        <p role="alert" className="rounded-2xl bg-white border border-slate-200 p-8 text-center text-sm text-slate-700">
          {shown.error}
        </p>
      )}
      {shown.ok && (
        <>
          <div>
            <h1 className="text-xl font-bold text-slate-900">{title}</h1>
            <p className="text-sm text-slate-500 mt-1">
              {periodStart ?? "—"} — {periodEnd ?? "—"}
            </p>
          </div>

          <section className="grid grid-cols-2 gap-3 sm:grid-cols-5">
            {COUNTS.map(([key, label]) => (
              <div key={key} className="rounded-2xl bg-white border border-slate-200 p-4">
                <div className="text-xs text-slate-400">{label}</div>
                <div className="text-xl font-bold text-slate-900">{countOf(recap?.commitments, key) ?? "—"}</div>
              </div>
            ))}
          </section>

          <section className="rounded-2xl bg-white border border-slate-200 p-5 sm:p-6 space-y-3">
            <h2 className="text-base font-semibold text-slate-900">Resultados medidos</h2>
            {measured.length === 0 ? (
              <p className="text-sm text-slate-500">Nenhum resultado medido neste recap.</p>
            ) : (
              <ul className="space-y-3">
                {measured.map((figure, index) => (
                  <li key={index}>
                    <p className="text-sm font-medium text-slate-800">{typeof figure.label === "string" ? figure.label : "Resultado"}</p>
                    <p className="text-sm text-slate-700">
                      {typeof figure.value === "number" ? figure.value.toLocaleString("pt-BR") : String(figure.value ?? "—")}
                      {typeof figure.unit === "string" && figure.unit ? ` ${figure.unit}` : ""}
                    </p>
                    {typeof figure.source === "string" && figure.source && (
                      <p className="text-xs text-slate-400">Fonte: {figure.source}</p>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </section>

          <p className="rounded-2xl bg-white border border-slate-200 p-5 text-sm text-slate-700">
            Itens em aberto: {openItems}
          </p>
        </>
      )}
    </PortalShell>
  );
}
