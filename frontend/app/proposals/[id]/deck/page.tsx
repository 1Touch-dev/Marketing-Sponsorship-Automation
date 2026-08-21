import { supabaseAdmin } from "@/lib/supabase/server";
import { notFound } from "next/navigation";
import { formatDate } from "@/lib/utils";
import { fetchProposalImagesForLanding } from "@/lib/proposals/fetch-proposal-images";
import {
  groupProposalImages,
  resolveProposalImageLabel,
  type ProposalImageAsset,
} from "@/lib/proposals/proposal-images";
import { PrintButton } from "../view/print-button";

export const dynamic = "force-dynamic";

/** Keeps only the most recent image per label — jobs are re-run over time and
 * the deck should show one representative mockup per placement, not every
 * historical regeneration. Input must already be ordered newest-first. */
function dedupeImagesByLabel(
  images: ProposalImageAsset[]
): Array<ProposalImageAsset & { label: string }> {
  const seen = new Set<string>();
  const out: Array<ProposalImageAsset & { label: string }> = [];
  for (const img of images) {
    const label = resolveProposalImageLabel(img);
    if (seen.has(label)) continue;
    seen.add(label);
    out.push({ ...img, label });
  }
  return out;
}

// Fallback opportunity copy per primary asset category — used only when the
// AI-generated executive_summary/campaign_rationale aren't available yet.
const ASSET_FALLBACK: Record<string, { title: string; text: string }> = {
  jersey: {
    title: "Visibilidade no Uniforme Oficial",
    text: "A camisa do Coritiba é um veículo de mídia em movimento — vista em campo, nas redes sociais, na TV e nas arquibancadas por milhares de torcedores a cada partida.",
  },
  led_board: {
    title: "LED Perimetral — Visibilidade Máxima em Campo",
    text: "Os painéis LED do Couto Pereira garantem exposição direta durante transmissões, com presença garantida nos cortes de câmera e replays.",
  },
  vip_area: {
    title: "Experiência VIP — B2B e Hospitalidade Premium",
    text: "O camarote do Coritiba é o ambiente ideal para relacionamento com clientes, parceiros e executivos em dias de jogo.",
  },
  social_post: {
    title: "Presença Digital — Redes Sociais do Coritiba",
    text: "Com mais de 500 mil seguidores nas redes, o Coritiba FC conecta sua marca diretamente ao torcedor engajado.",
  },
  default: {
    title: "Por que patrocinar o Coritiba FC?",
    text: "Uma parceria com o Coritiba FC oferece visibilidade em partidas para mais de 40.000 torcedores, presença nos uniformes durante toda a temporada, e ativações criativas que conectam sua marca ao coração verde e branco do Paraná.",
  },
};

// Club constants — same figures used across the platform (README, HTML deck
// template). Not sponsor-specific, so safe to hardcode rather than fabricate.
const CLUB_STATS = [
  { v: "23 mil", l: "NO COUTO · público médio, top 10 do Brasil" },
  { v: "36 mil", l: "SÓCIOS COXA · meta de 40 mil no ano" },
  { v: "204 mil", l: "NO COXA iD · torcedores identificados" },
  { v: "231 mi", l: "NAS REDES OFICIAIS · alcance acumulado" },
  { v: "320 mi", l: "NO MATCHDAY · views acumulados" },
];

export default async function ProposalDeckPage({ params }: { params: { id: string } }) {
  const sb = supabaseAdmin();
  const { data: proposal } = await sb
    .from("proposals")
    .select("*, companies(company_name, logo_url, industry, website)")
    .eq("id", params.id)
    .single();

  if (!proposal) notFound();

  const { data: packages } = await sb
    .from("proposal_packages")
    .select("name, description, price_brl, category")
    .eq("proposal_id", params.id);

  const primaryCategory = (packages ?? []).length > 0 ? (packages![0].category ?? "default") : "default";
  const fallback = ASSET_FALLBACK[primaryCategory] ?? ASSET_FALLBACK.default;

  const content = (proposal.content ?? {}) as Record<string, unknown>;
  const company = proposal.companies as { company_name: string; logo_url?: string | null; industry?: string | null } | null;
  const currentYear = new Date().getFullYear();

  const approvedImages = await fetchProposalImagesForLanding(proposal.id);
  const { campaign: campaignVisuals, inventory: inventoryVisuals } = groupProposalImages(approvedImages);
  const deckVisuals = dedupeImagesByLabel([...inventoryVisuals, ...campaignVisuals]).slice(0, 6);

  // Per-match media reach — only present when this proposal is scoped to a
  // match (frontend/app/matches). Real, editable club data — no fabrication.
  let match: { opponent: string; match_date: string } | null = null;
  let reach: Record<string, number> | null = null;
  const matchId = (proposal as { match_id?: string | null }).match_id;
  if (matchId) {
    const { data: matchRow } = await sb
      .from("matches")
      .select("opponent, match_date, match_media_reach(*)")
      .eq("id", matchId)
      .maybeSingle();
    if (matchRow) {
      match = { opponent: matchRow.opponent as string, match_date: matchRow.match_date as string };
      const reachRaw = (matchRow as Record<string, unknown>).match_media_reach;
      reach = (Array.isArray(reachRaw) ? reachRaw[0] : reachRaw) as Record<string, number> | null;
    }
  }
  const officialViews = reach?.official_views ?? 0;
  const unofficialViews = reach?.unofficial_fan_views ?? 0;
  const rivalViews = reach?.rival_account_views ?? 0;
  const mediaTvViews = reach?.media_tv_radio_views ?? 0;
  const reachTotal = officialViews + unofficialViews + rivalViews + mediaTvViews;

  const executiveSummary = (content.executive_summary as string | undefined) ?? fallback.text;
  const campaignRationale = content.campaign_rationale as string | undefined;
  const sponsorshipValue = content.sponsorship_value as string | undefined;
  const investmentNote = content.investment_note as string | undefined;
  const cta = content.cta as string | undefined;
  const deliverables = (content.deliverables as string[] | undefined) ?? [];

  return (
    <>
      <style>{`
        @page { size: A4; margin: 0; }
        .deck-wrap * { box-sizing: border-box; margin: 0; padding: 0; }
        .deck-wrap { font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; background: #e5e7eb; min-height: 100vh; padding: 0; }
        .deck-page { width: 210mm; min-height: 297mm; margin: 0 auto 32px; position: relative; overflow: hidden; box-shadow: 0 4px 24px rgba(0,0,0,0.18); }
        .deck-toolbar { width: 100%; background: #1a1a1a; padding: 12px 24px; display: flex; align-items: center; justify-content: space-between; position: sticky; top: 0; z-index: 100; }
        @media print {
          .deck-toolbar { display: none !important; }
          .deck-wrap { background: white; padding: 0; }
          .deck-page { box-shadow: none; margin: 0; width: 100%; }
          body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
        }
        @media screen and (max-width: 900px) {
          .deck-page { width: 100%; min-height: auto; }
        }
      `}</style>
      <div className="deck-wrap">
        {/* Toolbar */}
        <div className="deck-toolbar">
          <div style={{ color: "white", fontWeight: 700, fontSize: 14 }}>Coritiba FC · Aliança Estratégica</div>
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <a
              href={`/proposals/${proposal.id}`}
              style={{ background: "#374151", color: "white", border: "none", borderRadius: 6, padding: "7px 14px", cursor: "pointer", fontSize: 13, textDecoration: "none", display: "inline-flex", alignItems: "center", gap: 6 }}
            >
              ← Voltar
            </a>
            <PrintButton proposalId={proposal.id} exportType="pdf_print" label="Imprimir / Salvar PDF" />
          </div>
        </div>

        {/* PAGE 1 — COVER */}
        <div className="deck-page" style={{ background: "linear-gradient(135deg,#0e3327 0%,#0b241b 60%,#031008 100%)", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "48px" }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", width: "100%", marginBottom: 48 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/brand/coritiba-logo.svg" alt="Coritiba FC" style={{ height: 44, width: 44, borderRadius: "50%", background: "white" }} />
              <div style={{ color: "white", fontSize: 20, fontWeight: 700, letterSpacing: 1 }}>Coritiba Foot Ball Club</div>
            </div>
            {company?.logo_url && (
              <div style={{ background: "white", borderRadius: 12, padding: "10px 16px", display: "flex", alignItems: "center", justifyContent: "center" }}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={company.logo_url} alt={company.company_name} style={{ height: 40, maxWidth: 160, objectFit: "contain" }} />
              </div>
            )}
          </div>
          <div style={{ textAlign: "center", flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center" }}>
            <div style={{ color: "#7be89a", fontSize: 12, textTransform: "uppercase", letterSpacing: 4, marginBottom: 20, fontWeight: 700 }}>Aliança Estratégica · {currentYear}</div>
            <h1 style={{ color: "white", fontSize: 34, fontWeight: 800, lineHeight: 1.25, textAlign: "center", maxWidth: "82%", marginBottom: 28 }}>
              O Coritiba transforma a paixão da sua torcida em preferência de compra para {company?.company_name ?? "sua marca"}
            </h1>
            <div style={{ width: 60, height: 3, background: "#7be89a", borderRadius: 2, marginBottom: 28 }}></div>
            <div style={{ color: "rgba(255,255,255,0.85)", fontSize: 17, fontWeight: 500 }}>{proposal.title}</div>
          </div>
          <div style={{ color: "rgba(255,255,255,0.4)", fontSize: 12, textAlign: "center", marginTop: 48 }}>Documento confidencial · {formatDate(new Date().toISOString())} · Coritiba FC Comercial</div>
        </div>

        {/* PAGE 2 — OPPORTUNITY */}
        <div className="deck-page" style={{ padding: "48px", background: "white" }}>
          <div style={{ borderLeft: "4px solid #0e3327", paddingLeft: 16, marginBottom: 32 }}>
            <div style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: 3, color: "#0e3327", marginBottom: 4 }}>A Oportunidade</div>
            <h2 style={{ fontSize: 26, fontWeight: 700, color: "#1a1a1a" }}>{fallback.title}</h2>
          </div>
          <p style={{ color: "#374151", lineHeight: 1.7, fontSize: 14, marginBottom: 16 }}>{executiveSummary}</p>
          {campaignRationale && <p style={{ color: "#374151", lineHeight: 1.7, fontSize: 14 }}>{campaignRationale}</p>}
        </div>

        {/* PAGE 3 — MÍDIA DE ALTO IMPACTO */}
        <div className="deck-page" style={{ padding: "48px", background: "#0e3327", display: "flex", flexDirection: "column", justifyContent: "center" }}>
          <div style={{ borderLeft: "4px solid #7be89a", paddingLeft: 16, marginBottom: 32 }}>
            <div style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: 3, color: "#7be89a", marginBottom: 4 }}>Mídia de Alto Impacto</div>
            <h2 style={{ fontSize: 26, fontWeight: 700, color: "white" }}>Um canal exclusivo, com audiência garantida toda semana</h2>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
            {CLUB_STATS.map((s) => (
              <div key={s.l} style={{ background: "rgba(255,255,255,0.06)", borderRadius: 12, padding: 18 }}>
                <div style={{ fontSize: 28, fontWeight: 800, color: "#7be89a" }}>{s.v}</div>
                <div style={{ fontSize: 11, color: "rgba(255,255,255,0.7)", marginTop: 4 }}>{s.l}</div>
              </div>
            ))}
          </div>
          <div style={{ color: "rgba(255,255,255,0.4)", fontSize: 10, marginTop: 20 }}>Fonte: Bentview · Horizm · Coxa iD · Fan Base</div>
        </div>

        {/* PAGE 4 — MATCH-SPECIFIC MEDIA REACH (only when proposal is scoped to a match) */}
        {match && reach && (
          <div className="deck-page" style={{ padding: "48px", background: "white" }}>
            <div style={{ borderLeft: "4px solid #0e3327", paddingLeft: 16, marginBottom: 32 }}>
              <div style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: 3, color: "#0e3327", marginBottom: 4 }}>Alcance por Partida</div>
              <h2 style={{ fontSize: 26, fontWeight: 700, color: "#1a1a1a" }}>
                Coritiba × {match.opponent} · {new Date(match.match_date + "T00:00:00").toLocaleDateString("pt-BR")}
              </h2>
            </div>
            <div style={{ background: "#f0fdf4", borderRadius: 12, padding: 24, marginBottom: 20 }}>
              <div style={{ fontSize: 36, fontWeight: 800, color: "#0e3327" }}>{reachTotal.toLocaleString("pt-BR")}</div>
              <div style={{ fontSize: 13, color: "#4b5563" }}>views totais estimados para este jogo</div>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
              {[
                ["Canais oficiais", officialViews],
                ["Torcida / contas não oficiais", unofficialViews],
                ["Contas rivais", rivalViews],
                ["Mídia / TV / rádio", mediaTvViews],
              ].map(([label, value]) => (
                <div key={label as string} style={{ padding: 16, border: "1px solid #e5e7eb", borderRadius: 8 }}>
                  <div style={{ fontSize: 11, color: "#9ca3af", textTransform: "uppercase", letterSpacing: 1, marginBottom: 4 }}>{label}</div>
                  <div style={{ fontSize: 18, fontWeight: 700, color: "#0e3327" }}>{(value as number).toLocaleString("pt-BR")}</div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* PAGE 5 — SPONSORSHIP VALUE */}
        {sponsorshipValue && (
          <div className="deck-page" style={{ padding: "48px", background: "white" }}>
            <div style={{ borderLeft: "4px solid #0e3327", paddingLeft: 16, marginBottom: 32 }}>
              <div style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: 3, color: "#0e3327", marginBottom: 4 }}>Valor da Parceria</div>
              <h2 style={{ fontSize: 26, fontWeight: 700, color: "#1a1a1a" }}>O que está em jogo</h2>
            </div>
            <p style={{ color: "#374151", lineHeight: 1.7, fontSize: 14 }}>{sponsorshipValue}</p>
          </div>
        )}

        {/* PAGE 6 — COUTO PEREIRA */}
        <div className="deck-page" style={{ padding: "48px", background: "#f9fafb", display: "flex", flexDirection: "column", justifyContent: "center" }}>
          <div style={{ borderLeft: "4px solid #0e3327", paddingLeft: 16, marginBottom: 32 }}>
            <div style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: 3, color: "#0e3327", marginBottom: 4 }}>O Nosso Maior Ativo Físico</div>
            <h2 style={{ fontSize: 26, fontWeight: 700, color: "#1a1a1a" }}>Couto Pereira: onde a magia e o consumo acontecem</h2>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 16 }}>
            {[["40.000", "lugares, com 23 mil de público médio"], ["58", "camarotes com TVs e catering premium"], ["89 PDVs", "pontos de venda ativados a cada jogo"]].map(([v, l]) => (
              <div key={l} style={{ background: "white", border: "1px solid #e5e7eb", borderRadius: 12, padding: 20 }}>
                <div style={{ fontSize: 26, fontWeight: 800, color: "#0e3327" }}>{v}</div>
                <div style={{ fontSize: 12, color: "#4b5563", marginTop: 4 }}>{l}</div>
              </div>
            ))}
          </div>
        </div>

        {/* PAGE 7 — DELIVERABLES / ACTIVATIONS */}
        <div className="deck-page" style={{ padding: "48px", background: "white" }}>
          <div style={{ borderLeft: "4px solid #0e3327", paddingLeft: 16, marginBottom: 32 }}>
            <div style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: 3, color: "#0e3327", marginBottom: 4 }}>Entregas e Ativações</div>
            <h2 style={{ fontSize: 26, fontWeight: 700, color: "#1a1a1a" }}>O que está incluído</h2>
          </div>
          {(packages ?? []).length > 0 ? (
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
              {packages!.map((pkg, i) => (
                <div key={i} style={{ padding: 16, border: "1px solid #e5e7eb", borderRadius: 8, background: "#f9fafb" }}>
                  <div style={{ fontSize: 13, fontWeight: 600, color: "#1a1a1a", marginBottom: 4 }}>{pkg.name}</div>
                  {pkg.description && <div style={{ fontSize: 12, color: "#6b7280", marginBottom: 8 }}>{pkg.description}</div>}
                  {pkg.price_brl && <div style={{ fontSize: 14, fontWeight: 700, color: "#0e3327" }}>R$ {Number(pkg.price_brl).toLocaleString("pt-BR")}</div>}
                </div>
              ))}
            </div>
          ) : deliverables.length > 0 ? (
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
              {deliverables.map((d, i) => (
                <div key={i} style={{ display: "flex", alignItems: "flex-start", gap: 10, padding: 12, border: "1px solid #e5e7eb", borderRadius: 8 }}>
                  <div style={{ width: 20, height: 20, borderRadius: "50%", background: "#0e3327", flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center" }}>
                    <span style={{ color: "white", fontSize: 11, fontWeight: 700 }}>✓</span>
                  </div>
                  <span style={{ fontSize: 13, color: "#374151", lineHeight: 1.5 }}>{d}</span>
                </div>
              ))}
            </div>
          ) : (
            <p style={{ color: "#9ca3af", fontSize: 13 }}>Pacote a definir com a equipe comercial.</p>
          )}
        </div>

        {/* PAGE 8 — INVESTMENT */}
        <div className="deck-page" style={{ padding: "48px", background: "white" }}>
          <div style={{ borderLeft: "4px solid #0e3327", paddingLeft: 16, marginBottom: 32 }}>
            <div style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: 3, color: "#0e3327", marginBottom: 4 }}>Investimento</div>
            <h2 style={{ fontSize: 26, fontWeight: 700, color: "#1a1a1a" }}>Condições Comerciais</h2>
          </div>
          {investmentNote && (
            <div style={{ background: "#f0fdf4", border: "2px solid #0e3327", borderRadius: 12, padding: 24, marginBottom: 24 }}>
              <p style={{ color: "#1a1a1a", fontSize: 15, lineHeight: 1.7 }}>{investmentNote}</p>
            </div>
          )}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
            {([["Formato", "Patrocínio Direto"], ["Vigência", `Temporada ${currentYear}`], ["Forma de Pagamento", "A definir em contrato"], ["Validade da Proposta", "30 dias"]] as [string, string][]).map(([k, v]) => (
              <div key={k} style={{ padding: 16, border: "1px solid #e5e7eb", borderRadius: 8 }}>
                <div style={{ fontSize: 11, color: "#9ca3af", textTransform: "uppercase", letterSpacing: 1, marginBottom: 4 }}>{k}</div>
                <div style={{ fontSize: 14, fontWeight: 600, color: "#1a1a1a" }}>{v}</div>
              </div>
            ))}
          </div>
        </div>

        {/* PAGE 9 — VISUAL MOCKUPS (reuses already-approved images — no new generation cost) */}
        <div className="deck-page" style={{ padding: "48px", background: "#f9fafb", display: "flex", flexDirection: "column", justifyContent: "center", alignItems: "center" }}>
          <div style={{ borderLeft: "4px solid #0e3327", paddingLeft: 16, marginBottom: 32, alignSelf: "flex-start" }}>
            <div style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: 3, color: "#0e3327", marginBottom: 4 }}>Visuais da Campanha</div>
            <h2 style={{ fontSize: 26, fontWeight: 700, color: "#1a1a1a" }}>Mockups e Criações</h2>
          </div>
          {deckVisuals.length > 0 ? (
            <>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, width: "100%" }}>
                {deckVisuals.map((img) => (
                  <div key={img.id} style={{ background: "white", borderRadius: 12, overflow: "hidden", border: "1px solid #e5e7eb" }}>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={img.url} alt={img.label} style={{ width: "100%", height: 150, objectFit: "cover", display: "block" }} />
                    <div style={{ padding: "8px 12px", fontSize: 12, fontWeight: 600, color: "#374151" }}>{img.label}</div>
                  </div>
                ))}
              </div>
              <p style={{ color: "#9ca3af", fontSize: 11, marginTop: 16, textAlign: "center" }}>Mockups gerados a partir do logo oficial de {company?.company_name ?? "patrocinador"}</p>
            </>
          ) : (
            <>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, width: "100%" }}>
                {(["Jersey Mockup", "LED Board", "Post de Redes Sociais", "Backdrop de Imprensa"] as string[]).map((label) => (
                  <div key={label} style={{ background: "#e5e7eb", borderRadius: 12, height: 150, display: "flex", alignItems: "center", justifyContent: "center" }}>
                    <span style={{ color: "#9ca3af", fontSize: 13 }}>{label}</span>
                  </div>
                ))}
              </div>
              <p style={{ color: "#9ca3af", fontSize: 12, marginTop: 16, textAlign: "center" }}>Mockups definitivos gerados após aprovação da proposta</p>
            </>
          )}
        </div>

        {/* PAGE 10 — WHY CORITIBA */}
        <div className="deck-page" style={{ padding: "48px", background: "#0e3327", display: "flex", flexDirection: "column", justifyContent: "center" }}>
          <div style={{ borderLeft: "4px solid #7be89a", paddingLeft: 16, marginBottom: 36 }}>
            <div style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: 3, color: "#7be89a", marginBottom: 4 }}>Por Que o Coritiba</div>
            <h2 style={{ fontSize: 26, fontWeight: 700, color: "white" }}>Escutamos, planejamos, executamos e medimos junto com você</h2>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: 16 }}>
            {[["01", "Escuta", "Sua meta primeiro, nosso inventário depois."], ["02", "Planeja", "Ideias e soluções desenhadas sob medida."], ["03", "Executa", "Time próprio em ação: estádio, atletas, redes e CRM."], ["04", "Mede", "Relatório assinado todo mês."]].map(([n, t, d]) => (
              <div key={n}>
                <div style={{ fontSize: 26, fontWeight: 800, color: "rgba(255,255,255,0.35)" }}>{n}</div>
                <div style={{ color: "white", fontWeight: 600, fontSize: 14, marginTop: 4 }}>{t}</div>
                <div style={{ color: "rgba(255,255,255,0.65)", fontSize: 12, marginTop: 4 }}>{d}</div>
              </div>
            ))}
          </div>
        </div>

        {/* PAGE 11 — NEXT STEPS */}
        <div className="deck-page" style={{ padding: "48px", background: "linear-gradient(135deg,#0e3327 0%,#0b241b 100%)", display: "flex", flexDirection: "column", justifyContent: "center" }}>
          <div style={{ borderLeft: "4px solid #7be89a", paddingLeft: 16, marginBottom: 32 }}>
            <div style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: 3, color: "#7be89a", marginBottom: 4 }}>Próximos Passos</div>
            <h2 style={{ fontSize: 26, fontWeight: 700, color: "white" }}>Como avançar</h2>
          </div>
          {cta && (
            <div style={{ background: "rgba(255,255,255,0.1)", borderRadius: 12, padding: 20, marginBottom: 32 }}>
              <p style={{ color: "#7be89a", fontSize: 16, fontWeight: 600 }}>{cta}</p>
            </div>
          )}
          <div>
            {(([
              ["01", "Confirme seu interesse", "Responda este email ou clique em Tenho Interesse na proposta online"],
              ["02", "Reunião de alinhamento", "Agendamos uma apresentação de 30 minutos com nossa equipe comercial"],
              ["03", "Proposta final", "Ajustamos os detalhes e enviamos o contrato para assinatura"],
            ]) as [string, string, string][]).map(([n, t, desc]) => (
              <div key={n} style={{ display: "flex", gap: 20, marginBottom: 24 }}>
                <div style={{ width: 40, height: 40, borderRadius: "50%", background: "#7be89a", flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center" }}>
                  <span style={{ color: "#0e3327", fontWeight: 800, fontSize: 16 }}>{n}</span>
                </div>
                <div>
                  <div style={{ color: "white", fontWeight: 600, fontSize: 15, marginBottom: 4 }}>{t}</div>
                  <div style={{ color: "rgba(255,255,255,0.7)", fontSize: 13 }}>{desc}</div>
                </div>
              </div>
            ))}
          </div>
          <div style={{ marginTop: 40, borderTop: "1px solid rgba(255,255,255,0.2)", paddingTop: 24 }}>
            <div style={{ color: "rgba(255,255,255,0.6)", fontSize: 11, textAlign: "center" }}>
              Coritiba FC · Departamento Comercial · comercial@coritiba.com.br<br />
              Rua Campo Comprido, 669 · Curitiba · PR · CNPJ 75.094.050/0001-72
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
