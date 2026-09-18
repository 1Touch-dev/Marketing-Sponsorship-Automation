import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { supabaseAdmin } from "@/lib/supabase/server";
import { verifySessionToken, PORTAL_COOKIE } from "@/lib/portal/session";
import { getTenantById } from "@/lib/tenants/current";
import { CORITIBA_TENANT_ID } from "@/lib/tenants/types";
import type { ProposalContent } from "@/types/database";
import { LogOut, CheckCircle2, Circle, ExternalLink, FileDown } from "lucide-react";

export const dynamic = "force-dynamic";

const DEFAULT_CLUB_NAME = "Coritiba FC";
const DEFAULT_CREST = "/brand/coritiba-crest.png";
const DEFAULT_PRIMARY_HEX = "#1a8f3c"; // Coritiba green

const STATUS_LABELS: Record<string, { label: string; color: string }> = {
  draft: { label: "Em preparação", color: "bg-slate-100 text-slate-600" },
  under_review: { label: "Em análise", color: "bg-amber-100 text-amber-700" },
  revision_requested: { label: "Em revisão", color: "bg-amber-100 text-amber-700" },
  approved: { label: "Aprovada", color: "bg-blue-100 text-blue-700" },
  sent: { label: "Enviada", color: "bg-blue-100 text-blue-700" },
  active_contract: { label: "Contrato Ativo", color: "bg-green-100 text-green-700" },
  rejected: { label: "Rejeitada", color: "bg-red-100 text-red-600" },
};

export default async function PortalDashboardPage() {
  const cookieStore = cookies();
  const session = verifySessionToken(cookieStore.get(PORTAL_COOKIE)?.value);
  if (!session) redirect("/portal/login");

  const sb = supabaseAdmin();
  const { data: company } = await sb
    .from("companies")
    .select("id, company_name, logo_url, industry, tenant_id")
    .eq("id", session.companyId)
    .maybeSingle();

  if (!company) redirect("/portal/login");

  // White-label the sponsor's own dashboard — this is exactly the surface
  // master_report.md §6.1 means by "each customer's sponsors see a branded
  // portal under the customer's own brand, not the platform's." Portal
  // sessions have no platform_users identity (magic-link cookie, not a
  // Supabase session), so getCurrentTenant() can't be used here — resolve
  // via the sponsor's own company.tenant_id instead.
  const tenant = company.tenant_id ? await getTenantById(company.tenant_id) : null;
  const isCoritiba = !tenant || tenant.id === CORITIBA_TENANT_ID;
  const clubName = tenant?.club_facts.short_name ?? tenant?.club_facts.club_name ?? DEFAULT_CLUB_NAME;
  const crestUrl = isCoritiba ? DEFAULT_CREST : (tenant?.branding.crest_url ?? tenant?.branding.logo_url ?? null);
  const primaryHex = (tenant?.branding.primary_color && /^#[0-9a-f]{6}$/i.test(tenant.branding.primary_color))
    ? tenant.branding.primary_color
    : DEFAULT_PRIMARY_HEX;

  const { data: proposals } = await sb
    .from("proposals")
    .select("id, title, status, content, share_token, created_at, approved_at")
    .eq("company_id", session.companyId)
    .neq("status", "rejected")
    .order("created_at", { ascending: false });

  return (
    <div className="min-h-screen w-full bg-slate-50">
      <div className="sticky top-0 z-10 bg-white border-b border-slate-100 px-6 py-4">
        <div className="max-w-4xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            {crestUrl && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={crestUrl} alt={clubName} className="h-8 w-8 object-contain" />
            )}
            <div>
              <div className="text-sm font-bold text-slate-800">Portal do Patrocinador</div>
              <div className="text-xs text-slate-400">{company.company_name}</div>
            </div>
          </div>
          <form action="/api/portal/logout" method="POST">
            <button type="submit" className="inline-flex items-center gap-1.5 text-xs text-slate-500 hover:text-slate-800">
              <LogOut className="h-3.5 w-3.5" /> Sair
            </button>
          </form>
        </div>
      </div>

      <div className="max-w-4xl mx-auto px-6 py-8 space-y-6">
        <div>
          <h1 className="text-xl font-bold text-slate-900">Suas propostas e contratos</h1>
          <p className="text-sm text-slate-500 mt-1">Acompanhe o andamento das parcerias com o {clubName}.</p>
        </div>

        {(!proposals || proposals.length === 0) && (
          <div className="rounded-2xl bg-white border border-slate-200 p-8 text-center text-sm text-slate-500">
            Nenhuma proposta encontrada para {company.company_name} no momento.
          </div>
        )}

        {(proposals ?? []).map((p) => {
          const content = p.content as ProposalContent;
          const statusMeta = STATUS_LABELS[p.status] ?? { label: p.status, color: "bg-slate-100 text-slate-600" };
          const tasks = content?.fulfillment_tasks ?? [];
          const doneCount = tasks.filter((t) => t.status === "done").length;
          const documents = content?.document_bundle ?? [];

          return (
            <div key={p.id} className="rounded-2xl bg-white border border-slate-200 shadow-sm overflow-hidden">
              <div className="p-5 sm:p-6 flex items-start justify-between gap-4">
                <div className="min-w-0">
                  <h2 className="text-base font-semibold text-slate-900 truncate">{p.title}</h2>
                  <p className="text-xs text-slate-400 mt-0.5">
                    Criada em {new Date(p.created_at).toLocaleDateString("pt-BR")}
                  </p>
                </div>
                <span className={`shrink-0 rounded-full px-3 py-1 text-xs font-semibold ${statusMeta.color}`}>
                  {statusMeta.label}
                </span>
              </div>

              {p.share_token && (
                <div className="px-5 sm:px-6 pb-4">
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

              {tasks.length > 0 && (
                <div className="border-t border-slate-100 p-5 sm:p-6 space-y-2">
                  <div className="flex items-center justify-between text-xs text-muted-foreground mb-1">
                    <span className="font-medium text-slate-600">Progresso da entrega</span>
                    <span>{doneCount}/{tasks.length}</span>
                  </div>
                  <div className="h-1.5 w-full rounded-full bg-slate-100 overflow-hidden">
                    <div
                      className="h-full"
                      style={{ width: `${tasks.length ? (doneCount / tasks.length) * 100 : 0}%`, backgroundColor: primaryHex }}
                    />
                  </div>
                  <div className="space-y-1 pt-2">
                    {tasks.map((t) => (
                      <div key={t.id} className="flex items-start gap-2 text-xs">
                        {t.status === "done" ? (
                          <CheckCircle2 className="h-3.5 w-3.5 text-green-600 shrink-0 mt-0.5" />
                        ) : (
                          <Circle className="h-3.5 w-3.5 text-slate-300 shrink-0 mt-0.5" />
                        )}
                        <span className={t.status === "done" ? "text-slate-400 line-through" : "text-slate-600"}>
                          {t.title}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {documents.length > 0 && (
                <div className="border-t border-slate-100 p-5 sm:p-6 space-y-2">
                  <div className="text-xs font-medium text-slate-600 mb-1">Documentos</div>
                  {documents.map((doc) => (
                    <a
                      key={doc.path}
                      href={doc.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-2 text-xs text-slate-600 hover:text-green-700"
                    >
                      <FileDown className="h-3.5 w-3.5 shrink-0" />
                      {doc.name}
                    </a>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
