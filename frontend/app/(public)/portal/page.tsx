import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { supabaseAdmin } from "@/lib/supabase/server";
import { PORTAL_COOKIE } from "@/lib/portal/session";
import { resolvePortalSession } from "@/lib/portal/guard";
import { portalDelivery, portalProposals, portalRecaps } from "@/lib/portal/data";
import { getTenantById } from "@/lib/tenants/current";
import { CORITIBA_TENANT_ID } from "@/lib/tenants/types";
import type { ProposalContent } from "@/types/database";
import { UNFROZEN_SPONSOR_NOTICE } from "@/lib/proposals/frozen";
import { ExternalLink } from "lucide-react";
import { PortalShell } from "./portal-shell";
import { PortalDeliveryList, type PortalDeliveryItem } from "./portal-delivery";

export const dynamic = "force-dynamic";

const DEFAULT_CLUB_NAME = "Coritiba FC";
const DEFAULT_CREST = "/brand/coritiba-crest.png";
const DEFAULT_PRIMARY_HEX = "#1a8f3c"; // Coritiba green

export default async function PortalDashboardPage() {
  const sb = supabaseAdmin();
  // The one guard for the sponsor portal: genuine cookie, sponsor still exists, still a contact there, access not ended.
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
  const { data: company } = await sb.from("companies").select("id, company_name, logo_url, industry").eq("id", ctx.companyId).eq("tenant_id", ctx.tenantId).maybeSingle();
  if (!company) redirect("/portal/login");

  // White-label the sponsor's own dashboard under the club's brand, resolved from the sponsor's own company.
  const tenant = await getTenantById(ctx.tenantId);
  const isCoritiba = !tenant || tenant.id === CORITIBA_TENANT_ID;
  const clubName = tenant?.club_facts.short_name ?? tenant?.club_facts.club_name ?? DEFAULT_CLUB_NAME;
  const crestUrl = isCoritiba ? DEFAULT_CREST : (tenant?.branding.crest_url ?? tenant?.branding.logo_url ?? null);
  const primaryHex = (tenant?.branding.primary_color && /^#[0-9a-f]{6}$/i.test(tenant.branding.primary_color))
    ? tenant.branding.primary_color
    : DEFAULT_PRIMARY_HEX;

  // Only proposals the club has approved or sent, already reduced to what a sponsor may read.
  const shown = await portalProposals(sb, ctx);
  const proposals = (shown.ok ? shown.value : []) as unknown as Array<{
    id: string;
    title: string;
    content: ProposalContent;
    share_token: string | null;
    created_at: string;
    approval_frozen?: boolean;
    approved_revision_number?: number | null;
  }>;
  const delivery = await portalDelivery(sb, ctx);
  const recaps = await portalRecaps(sb, ctx);
  const deliveries = (delivery.ok ? delivery.value : []) as unknown as PortalDeliveryItem[];
  const issued = (recaps.ok ? recaps.value : []) as Array<{ id: string; version: number; issued_at: string; open_items: number }>;

  return (
    <PortalShell clubName={clubName} crestUrl={crestUrl} companyName={company.company_name}>
      <div>
        <h1 className="text-xl font-bold text-slate-900">Suas propostas e contratos</h1>
        <p className="text-sm text-slate-500 mt-1">Acompanhe o andamento das parcerias com o {clubName}.</p>
      </div>

      {!shown.ok && (
        <p role="alert" className="rounded-2xl bg-white border border-slate-200 p-8 text-center text-sm text-slate-700">
          Couldn&apos;t load proposals.
        </p>
      )}

      {shown.ok && proposals.length === 0 && (
        <div className="rounded-2xl bg-white border border-slate-200 p-8 text-center text-sm text-slate-500">
          Nenhuma proposta encontrada para {company.company_name} no momento.
        </div>
      )}

      {shown.ok && proposals.map((p) => {
        if (p.approval_frozen !== true) {
          return (
            <div key={p.id} className="rounded-2xl bg-white border border-slate-200 shadow-sm overflow-hidden">
              <p className="p-5 sm:p-6 text-sm text-slate-700">{UNFROZEN_SPONSOR_NOTICE}</p>
            </div>
          );
        }
        const summary = typeof p.content?.executive_summary === "string" ? p.content.executive_summary.trim() : "";
        return (
          <div key={p.id} className="rounded-2xl bg-white border border-slate-200 shadow-sm overflow-hidden">
            <div className="p-5 sm:p-6">
              <h2 className="text-base font-semibold text-slate-900 truncate">{p.title}</h2>
              <p className="text-xs text-slate-400 mt-0.5">
                {typeof p.approved_revision_number === "number" ? `Versão ${p.approved_revision_number} · ` : ""}
                Criada em {new Date(p.created_at).toLocaleDateString("pt-BR")}
              </p>
              {summary && <p className="text-sm text-slate-600 mt-3 whitespace-pre-wrap">{summary}</p>}
            </div>

            {p.share_token && (
              <div className="px-5 sm:px-6 pb-5">
                <a
                  href={`/proposals/view/${p.share_token}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{ color: primaryHex }}
                  className="inline-flex items-center gap-1.5 text-sm hover:opacity-80 font-medium"
                >
                  Ver proposta completa <ExternalLink className="h-3.5 w-3.5" />
                </a>
              </div>
            )}
          </div>
        );
      })}

      <section className="space-y-3">
        <h2 className="text-lg font-semibold text-slate-900">Entregas</h2>
        {!delivery.ok && (
          <p role="alert" className="rounded-2xl bg-white border border-slate-200 p-8 text-center text-sm text-slate-700">
            Couldn&apos;t load delivery.
          </p>
        )}
        {delivery.ok && deliveries.length === 0 && (
          <p className="rounded-2xl bg-white border border-slate-200 p-8 text-center text-sm text-slate-500">
            Nenhuma entrega para {company.company_name} no momento.
          </p>
        )}
        {delivery.ok && deliveries.length > 0 && <PortalDeliveryList items={deliveries} />}
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold text-slate-900">Recaps</h2>
        {!recaps.ok && (
          <p role="alert" className="rounded-2xl bg-white border border-slate-200 p-8 text-center text-sm text-slate-700">
            Couldn&apos;t load recaps.
          </p>
        )}
        {recaps.ok && issued.length === 0 && (
          <p className="rounded-2xl bg-white border border-slate-200 p-8 text-center text-sm text-slate-500">
            Nenhum recap emitido para {company.company_name} no momento.
          </p>
        )}
        {recaps.ok && issued.map((recap) => (
          <a key={recap.id} href={`/portal/recaps/${recap.id}`} className="block rounded-2xl bg-white border border-slate-200 p-5 sm:p-6 hover:border-slate-300">
            <h3 className="text-base font-semibold text-slate-900">Versão {recap.version}</h3>
            <p className="text-xs text-slate-400 mt-1">
              {recap.issued_at ? new Date(recap.issued_at).toLocaleDateString("pt-BR") : ""}
              {" · "}
              {recap.open_items} {recap.open_items === 1 ? "item em aberto" : "itens em aberto"}
            </p>
          </a>
        ))}
      </section>
    </PortalShell>
  );
}
