"use client";

import React from "react";
import { cn } from "@/lib/utils";
import { formatDate } from "@/lib/utils";
import type { PricingTier, StrategyVariant, VisualPrompt, CompanyIntelligence } from "@/lib/ai/schemas";
import type { ProposalContent } from "@/types/database";
import { PricingTiers } from "./pricing-tiers";
import { StrategyCards } from "./strategy-cards";
import { VisualMockupGrid } from "./visual-mockup-grid";
import { IntelligencePanel } from "./intelligence-panel";
import {
  TrendingUp, Users, MapPin, Target, CheckCircle2, Building2,
  ArrowRight, Trophy, Tv2, Zap, Globe, Megaphone, BarChart3,
  Star, Shield,
} from "lucide-react";
import Image from "next/image";

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────
interface ProposalLandingPageProps {
  proposal: {
    id: string;
    title: string;
    status: string;
    version: number;
    created_at: string;
    content: ProposalContent;
    content_md?: string | null;
    strategy_variants?: StrategyVariant[] | null;
    pricing_tiers?: PricingTier[] | null;
    visual_prompts?: VisualPrompt[] | null;
    intelligence?: CompanyIntelligence | null;
    share_token?: string | null;
  };
  company: {
    company_name: string;
    industry?: string | null;
    website?: string | null;
    country?: string | null;
  };
  campaign?: { title: string; summary?: string | null } | null;
  approvedImages?: Array<{ url: string; job_type: string; prompt?: string }>;
  adminMode?: boolean;
  onPrint?: () => void;
  onShare?: () => void;
}

// ─────────────────────────────────────────────────────────────────────────────
// Coritiba green palette tokens
// ─────────────────────────────────────────────────────────────────────────────
// Primary: #006400 (dark green)  Secondary: #FFFFFF  Accent: #008000
// Used throughout for brand consistency

// ─────────────────────────────────────────────────────────────────────────────
// Hero stat card  (dark hero area)
// ─────────────────────────────────────────────────────────────────────────────
function HeroStat({
  icon: Icon, label, value, sub, color = "green",
}: {
  icon: React.ElementType; label: string; value: string; sub?: string;
  color?: "green" | "white" | "amber" | "emerald";
}) {
  const colors = {
    green:   "from-green-700/60 to-green-900/60 border-green-500/30",
    white:   "from-white/10 to-white/5 border-white/20",
    amber:   "from-amber-500/20 to-orange-500/20 border-amber-400/30",
    emerald: "from-emerald-600/30 to-teal-700/30 border-emerald-500/30",
  };
  const iconColors = { green: "text-green-200", white: "text-white/70", amber: "text-amber-300", emerald: "text-emerald-200" };
  return (
    <div className={cn("flex flex-col gap-1.5 rounded-xl bg-gradient-to-br border backdrop-blur-sm p-3", colors[color])}>
      <div className="flex items-center gap-1.5">
        <div className="rounded-md bg-white/10 p-1.5 shrink-0">
          <Icon className={cn("h-3.5 w-3.5", iconColors[color])} />
        </div>
        <div className="text-[10px] text-white/60 font-semibold uppercase tracking-wide leading-tight">{label}</div>
      </div>
      <div className="text-lg font-extrabold text-white leading-none">{value}</div>
      {sub && <div className="text-[10px] text-white/50 leading-tight">{sub}</div>}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Section wrapper
// ─────────────────────────────────────────────────────────────────────────────
function Section({
  id, title, subtitle, badge, children, className, dark,
}: {
  id?: string; title: string; subtitle?: string; badge?: string;
  children: React.ReactNode; className?: string; dark?: boolean;
}) {
  return (
    <section
      id={id}
      className={cn(
        "py-12 border-t",
        dark ? "border-green-900 bg-[#0a1f0a] -mx-6 px-6 sm:-mx-8 sm:px-8" : "border-slate-100",
        className
      )}
    >
      <div className="mb-8">
        {badge && (
          <div className="inline-flex items-center rounded-full bg-green-100 text-green-800 px-3 py-1 text-xs font-semibold uppercase tracking-wider mb-3">
            {badge}
          </div>
        )}
        <h2 className={cn("text-2xl sm:text-3xl font-bold", dark ? "text-white" : "text-slate-900")}>
          {title}
        </h2>
        {subtitle && (
          <p className={cn("mt-2 text-base", dark ? "text-green-300/70" : "text-slate-500")}>
            {subtitle}
          </p>
        )}
      </div>
      {children}
    </section>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Metric card
// ─────────────────────────────────────────────────────────────────────────────
function MetricCard({
  icon: Icon, value, label, color,
}: { icon: React.ElementType; value: string; label: string; color: string }) {
  return (
    <div className="text-center p-5 rounded-xl bg-white border border-slate-100 shadow-sm hover:shadow-md transition-shadow">
      <div className={cn("inline-flex items-center justify-center rounded-full p-3 mb-3", color)}>
        <Icon className="h-6 w-6" />
      </div>
      <div className="text-2xl font-extrabold text-slate-900">{value}</div>
      <div className="text-xs text-slate-500 mt-1 font-medium">{label}</div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Main component
// ─────────────────────────────────────────────────────────────────────────────
export function ProposalLandingPage({
  proposal, company, campaign, approvedImages = [], adminMode = false, onPrint, onShare,
}: ProposalLandingPageProps) {
  const content = proposal.content as unknown as {
    title: string;
    executive_summary: string;
    campaign_rationale: string;
    sponsorship_value: string;
    activation_plan: string;
    deliverables: string[];
    investment_note: string;
    cta: string;
  };

  const statusColor =
    proposal.status === "approved" ? "bg-emerald-500 text-white" :
    proposal.status === "rejected" ? "bg-red-500 text-white" :
    "bg-white/20 text-white border border-white/30";

  return (
    <article className="min-h-screen w-full bg-slate-50 print:bg-white">

      {/* ─── HERO — Coritiba green/white ──────────────────────────────────── */}
      <header className="relative w-full overflow-hidden print:bg-green-900"
        style={{ background: "linear-gradient(135deg, #003300 0%, #006400 50%, #004d00 100%)" }}>

        {/* Stripe pattern — Coritiba vertical stripes */}
        <div className="absolute inset-0 opacity-[0.04] pointer-events-none"
          style={{
            backgroundImage: "repeating-linear-gradient(90deg, white 0px, white 20px, transparent 20px, transparent 60px)",
          }} />

        {/* Glow accents — green tones */}
        <div className="absolute -top-24 -right-24 w-96 h-96 bg-green-400/15 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute -bottom-24 -left-24 w-96 h-96 bg-emerald-600/15 rounded-full blur-3xl pointer-events-none" />

        <div className="relative max-w-5xl mx-auto px-6 sm:px-8 py-16 sm:py-20 lg:py-24">

          {/* Top bar: company chip + club logo + status */}
          <div className="flex flex-wrap items-center gap-3 mb-6 sm:mb-8">
            <span className="inline-flex items-center gap-1.5 rounded-full bg-white/10 border border-white/20 px-3 py-1.5 text-xs font-semibold text-white/90 backdrop-blur-sm">
              <Building2 className="h-3 w-3" />
              {company.company_name}
            </span>
            {company.industry && (
              <span className="rounded-full bg-green-500/30 border border-green-400/30 px-3 py-1.5 text-xs text-green-100 font-medium">
                {company.industry}
              </span>
            )}
            {/* Coritiba FC chip */}
            <span className="inline-flex items-center gap-2 rounded-full bg-white/15 border border-white/25 px-3 py-1.5 text-xs font-semibold text-white backdrop-blur-sm">
              <Image src="/brand/coritiba-logo.svg" alt="Coritiba FC" width={16} height={16} className="rounded-full" />
              Coritiba FC
            </span>
            <span className={cn("ml-auto rounded-full px-3 py-1.5 text-xs font-bold uppercase tracking-wider backdrop-blur-sm", statusColor)}>
              {proposal.status}
            </span>
          </div>

          {/* Club + Sponsor lockup */}
          <div className="flex items-center gap-4 mb-5">
            <div className="flex-shrink-0">
              <Image
                src="/brand/coritiba-logo.svg"
                alt="Coritiba FC"
                width={64}
                height={64}
                className="rounded-full border-2 border-white/30"
              />
            </div>
            <div className="h-12 w-px bg-white/20" />
            <h1 className="text-3xl sm:text-4xl lg:text-5xl font-extrabold text-white leading-tight tracking-tight">
              {content?.title || proposal.title}
            </h1>
          </div>

          {campaign && (
            <div className="mb-8 sm:mb-10">
              <p className="text-green-200 text-base sm:text-lg font-medium">
                Campanha: <span className="text-white font-semibold">{campaign.title}</span>
              </p>
              {campaign.summary && (
                <p className="text-green-300/80 text-sm mt-1 max-w-2xl">{campaign.summary}</p>
              )}
            </div>
          )}

          {/* Hero stats */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            <HeroStat icon={Trophy}      label="Clube Parceiro"      value="Coritiba FC"  sub="Couto Pereira · Curitiba, PR"       color="green" />
            <HeroStat icon={Users}       label="Torcedores Coxa"     value="1.5M+"        sub="Seguidores digitais combinados"     color="emerald" />
            <HeroStat icon={Tv2}         label="Jogos / Temporada"   value="38+"          sub="Broadcast nacional + streaming"    color="white" />
            <HeroStat icon={TrendingUp}  label="Crescimento Digital" value="+47%"         sub="Engajamento nas redes em 2025"     color="amber" />
          </div>

          {/* Meta */}
          <div className="mt-8 flex flex-wrap items-center gap-x-4 gap-y-1 text-white/40 text-xs">
            <span className="flex items-center gap-1"><Star className="h-3 w-3" /> Proposta v{proposal.version}</span>
            <span>·</span>
            <span className="flex items-center gap-1"><MapPin className="h-3 w-3" /> Curitiba, Paraná, Brasil</span>
            <span>·</span>
            <span suppressHydrationWarning>Gerada em {formatDate(proposal.created_at)}</span>
          </div>
        </div>
      </header>

      {/* ─── MAIN CONTENT ──────────────────────────────────────────────────── */}
      <main className="w-full max-w-5xl mx-auto px-6 sm:px-8">

        {/* Partnership summary card */}
        <div className="relative -mt-6 z-10 mb-2">
          <div className="rounded-2xl bg-white border border-slate-200 shadow-xl p-6 sm:p-8">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
              <div>
                <div className="text-xs font-semibold uppercase tracking-wider text-slate-400 mb-1">Parceria Estratégica</div>
                <h2 className="text-xl font-bold text-slate-900">
                  {company.company_name} × Futebol Paranaense
                </h2>
              </div>
              {proposal.intelligence && (
                <div className="flex items-center gap-2 rounded-xl bg-green-50 border border-green-100 px-4 py-2.5">
                  <Zap className="h-4 w-4 text-green-700" />
                  <div>
                    <div className="text-xs text-green-700 font-medium">Score de Fit</div>
                    <div className="text-lg font-extrabold text-green-900">
                      {proposal.intelligence.sponsorship_fit_score?.toFixed(1)}/10
                    </div>
                  </div>
                </div>
              )}
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              <MetricCard icon={Globe}      value="5M+"   label="Impressões/Temporada"  color="bg-green-100 text-green-700" />
              <MetricCard icon={Megaphone}  value="18–35" label="Faixa Etária Principal" color="bg-blue-100 text-blue-600" />
              <MetricCard icon={BarChart3}  value="68%"   label="Audiência Masculina"    color="bg-amber-100 text-amber-600" />
              <MetricCard icon={Shield}     value="92%"   label="Recall de Marca Jogo"   color="bg-violet-100 text-violet-600" />
            </div>
          </div>
        </div>

        {/* Executive summary */}
        {content?.executive_summary && (
          <Section id="summary" title="Sumário Executivo" badge="Visão Geral"
            subtitle="Por que esta parceria é estratégica para o seu negócio">
            <div className="rounded-2xl bg-white border border-slate-200 shadow-sm p-7 sm:p-9">
              <p className="text-slate-700 text-lg sm:text-xl leading-relaxed font-light">
                {content.executive_summary}
              </p>
            </div>
          </Section>
        )}

        {/* Intelligence */}
        {proposal.intelligence && (
          <Section id="intelligence" title="Inteligência Comercial" badge="Análise IA"
            subtitle="Análise estratégica do fit entre sua marca e o futebol paranaense">
            <IntelligencePanel intelligence={proposal.intelligence} />
          </Section>
        )}

        {/* ─── STRATEGY VARIANTS — each gets its own dedicated card (#8) ─── */}
        {proposal.strategy_variants && proposal.strategy_variants.length > 0 && (
          <Section id="strategies" title="Estratégias de Patrocínio" badge="Direções Estratégicas"
            subtitle="Três abordagens distintas — cada uma com ativações, alcance e diferenciais próprios">
            <StrategyCards variants={proposal.strategy_variants} />
          </Section>
        )}

        {/* Campaign detail */}
        <Section id="campaign" title="Proposta Detalhada" badge="Plano de Ativação">
          <div className="space-y-5">
            {content?.campaign_rationale && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                <div className="rounded-xl bg-white border border-slate-200 shadow-sm p-6 sm:p-7">
                  <div className="flex items-center gap-2.5 mb-4">
                    <div className="rounded-lg bg-green-100 p-2">
                      <Megaphone className="h-4 w-4 text-green-700" />
                    </div>
                    <div className="font-semibold text-slate-700">Racional da Campanha</div>
                  </div>
                  <p className="text-slate-600 text-sm leading-relaxed">{content.campaign_rationale}</p>
                </div>
                {content?.sponsorship_value && (
                  <div className="rounded-xl bg-white border border-slate-200 shadow-sm p-6 sm:p-7">
                    <div className="flex items-center gap-2.5 mb-4">
                      <div className="rounded-lg bg-emerald-100 p-2">
                        <Target className="h-4 w-4 text-emerald-700" />
                      </div>
                      <div className="font-semibold text-slate-700">Valor para o Patrocinador</div>
                    </div>
                    <p className="text-slate-600 text-sm leading-relaxed">{content.sponsorship_value}</p>
                  </div>
                )}
              </div>
            )}
            {content?.activation_plan && (
              <div className="rounded-xl p-6 sm:p-7 text-white"
                style={{ background: "linear-gradient(135deg, #003300 0%, #006400 100%)" }}>
                <div className="flex items-center gap-2.5 mb-5">
                  <div className="rounded-lg bg-white/10 p-2">
                    <Zap className="h-4 w-4 text-green-200" />
                  </div>
                  <div className="font-semibold text-white">Plano de Ativação</div>
                </div>
                <p className="text-green-100 text-sm leading-relaxed whitespace-pre-line">{content.activation_plan}</p>
              </div>
            )}
          </div>
        </Section>

        {/* Deliverables */}
        {content?.deliverables && content.deliverables.length > 0 && (
          <Section id="deliverables" title="Entregas e Benefícios" badge="O que está incluso"
            subtitle="Todos os benefícios garantidos ao longo da parceria">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {content.deliverables.map((d, i) => (
                <div key={i} className="flex items-start gap-3 rounded-xl bg-white border border-slate-200 p-4 sm:p-5 hover:border-green-200 hover:shadow-sm transition-all">
                  <div className="rounded-full bg-green-100 p-1 shrink-0 mt-0.5">
                    <CheckCircle2 className="h-4 w-4 text-green-600" />
                  </div>
                  <p className="text-slate-700 text-sm leading-relaxed">{d}</p>
                </div>
              ))}
            </div>
          </Section>
        )}

        {/* Pricing tiers */}
        {proposal.pricing_tiers && proposal.pricing_tiers.length > 0 && (
          <Section id="pricing" title="Opções de Investimento" badge="Pacotes de Patrocínio"
            subtitle="Três níveis de parceria para se adaptar ao seu orçamento e objetivos estratégicos">
            <PricingTiers tiers={proposal.pricing_tiers} />
          </Section>
        )}

        {/* Visual mockups */}
        {proposal.visual_prompts && proposal.visual_prompts.length > 0 && (
          <Section id="visuals" title="Conceitos Visuais" badge="Identidade Visual"
            subtitle="Mockups e prompts de geração de imagem criados especificamente para sua marca">
            <VisualMockupGrid visuals={proposal.visual_prompts} companyName={company.company_name} />
          </Section>
        )}

        {/* AI Generated Images */}
        {approvedImages.length > 0 && (
          <Section id="generated-images" title="Imagens Geradas" badge="AI Visual Assets"
            subtitle="Imagens criadas por inteligência artificial aprovadas para esta proposta">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {approvedImages.map((img, idx) => (
                <div key={idx} className="rounded-xl overflow-hidden border border-slate-200 shadow-sm bg-white">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={img.url}
                    alt={img.prompt ?? `Generated visual ${idx + 1}`}
                    className="w-full object-cover"
                    style={{ maxHeight: 400 }}
                  />
                  {img.job_type && (
                    <div className="px-4 py-2 border-t border-slate-100">
                      <span className="text-xs text-slate-500 capitalize">{img.job_type.replace(/_/g, " ")}</span>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </Section>
        )}

        {/* Investment note */}
        {content?.investment_note && (
          <Section id="investment" title="Sobre o Investimento">
            <div className="rounded-xl bg-gradient-to-r from-green-50 to-emerald-50 border border-green-200 p-6 sm:p-8">
              <div className="flex items-start gap-4">
                <div className="rounded-lg bg-green-100 p-2.5 shrink-0">
                  <TrendingUp className="h-5 w-5 text-green-700" />
                </div>
                <p className="text-green-900 text-sm sm:text-base leading-relaxed">{content.investment_note}</p>
              </div>
            </div>
          </Section>
        )}

        {/* CTA */}
        {content?.cta && (
          <section className="py-14 border-t border-slate-100 print:hidden">
            <div className="rounded-2xl overflow-hidden p-10 sm:p-14 text-center text-white relative"
              style={{ background: "linear-gradient(135deg, #002200 0%, #006400 50%, #004d00 100%)" }}>
              <div className="absolute inset-0 opacity-[0.05]"
                style={{ backgroundImage: "repeating-linear-gradient(90deg, white 0px, white 20px, transparent 20px, transparent 60px)" }} />
              <div className="relative">
                <div className="flex justify-center mb-5">
                  <Image src="/brand/coritiba-logo.svg" alt="Coritiba FC" width={56} height={56}
                    className="rounded-full border-2 border-white/30" />
                </div>
                <div className="inline-flex items-center gap-2 rounded-full bg-white/10 border border-white/20 px-4 py-1.5 text-xs font-semibold text-white/70 mb-5 uppercase tracking-wider">
                  <Zap className="h-3 w-3" />
                  Próximo Passo
                </div>
                <p className="text-xl sm:text-2xl font-bold text-white mb-8 max-w-2xl mx-auto leading-relaxed">{content.cta}</p>
                <div className="flex flex-wrap justify-center gap-3">
                  {onPrint && (
                    <button onClick={onPrint}
                      className="inline-flex items-center gap-2 rounded-xl bg-white/10 hover:bg-white/20 border border-white/20 px-6 py-3 text-sm font-semibold text-white transition-all">
                      Baixar Proposta (PDF)
                    </button>
                  )}
                  {onShare && (
                    <button onClick={onShare}
                      className="inline-flex items-center gap-2 rounded-xl bg-white text-green-900 hover:bg-green-50 px-6 py-3 text-sm font-semibold transition-all shadow-lg">
                      Compartilhar Proposta
                      <ArrowRight className="h-4 w-4" />
                    </button>
                  )}
                </div>
              </div>
            </div>
          </section>
        )}

        {/* Print footer */}
        <div className="hidden print:block py-8 text-center text-xs text-slate-400 border-t border-slate-200 mt-8">
          <p className="font-semibold text-slate-600">{company.company_name} × Coritiba FC</p>
          <p className="mt-1">Proposta de Patrocínio · v{proposal.version} · {formatDate(proposal.created_at)}</p>
          <p className="mt-1">Plataforma de Patrocínio Coritiba FC · Confidencial</p>
        </div>
      </main>
    </article>
  );
}
