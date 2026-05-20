"use client";

import React from "react";
import { cn } from "@/lib/utils";
import { formatDate } from "@/lib/utils";
import type { PricingTier, StrategyVariant, VisualPrompt, CompanyIntelligence } from "@/lib/ai/schemas";
import type { ProposalContent } from "@/types/database";
import { PricingTiers } from "./pricing-tiers";
import { StrategyTabs } from "./strategy-tabs";
import { VisualMockupGrid } from "./visual-mockup-grid";
import { IntelligencePanel } from "./intelligence-panel";
import {
  TrendingUp,
  Users,
  MapPin,
  Target,
  CheckCircle2,
  Building2,
  ArrowRight,
  Trophy,
  Tv2,
  Zap,
  Globe,
  Megaphone,
  BarChart3,
  Star,
  Shield,
} from "lucide-react";

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
  campaign?: {
    title: string;
    summary?: string | null;
  } | null;
  approvedImages?: Array<{ url: string; job_type: string; prompt?: string }>;
  adminMode?: boolean;
  onPrint?: () => void;
  onShare?: () => void;
}

// ─────────────────────────────────────────────────────────────────────────────
// Hero stat card
// ─────────────────────────────────────────────────────────────────────────────
function HeroStat({
  icon: Icon,
  label,
  value,
  sub,
  color = "blue",
}: {
  icon: React.ElementType;
  label: string;
  value: string;
  sub?: string;
  color?: "blue" | "green" | "amber" | "purple";
}) {
  const colors = {
    blue:   "from-blue-500/20 to-indigo-500/20 border-blue-400/30",
    green:  "from-emerald-500/20 to-teal-500/20 border-emerald-400/30",
    amber:  "from-amber-500/20 to-orange-500/20 border-amber-400/30",
    purple: "from-violet-500/20 to-purple-500/20 border-violet-400/30",
  };
  const iconColors = {
    blue:   "text-blue-300",
    green:  "text-emerald-300",
    amber:  "text-amber-300",
    purple: "text-violet-300",
  };
  return (
    <div className={cn(
      "flex items-start gap-3 rounded-xl bg-gradient-to-br border backdrop-blur-sm p-4 sm:p-5",
      colors[color]
    )}>
      <div className="rounded-lg bg-white/10 p-2 shrink-0">
        <Icon className={cn("h-5 w-5", iconColors[color])} />
      </div>
      <div className="min-w-0">
        <div className="text-xs text-white/60 font-medium uppercase tracking-wide truncate">{label}</div>
        <div className="text-xl sm:text-2xl font-extrabold text-white leading-none mt-0.5">{value}</div>
        {sub && <div className="text-xs text-white/60 mt-0.5 truncate">{sub}</div>}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Section wrapper
// ─────────────────────────────────────────────────────────────────────────────
function Section({
  id,
  title,
  subtitle,
  badge,
  children,
  className,
  dark,
}: {
  id?: string;
  title: string;
  subtitle?: string;
  badge?: string;
  children: React.ReactNode;
  className?: string;
  dark?: boolean;
}) {
  return (
    <section
      id={id}
      className={cn(
        "py-12 border-t",
        dark ? "border-slate-800 bg-slate-900 -mx-6 px-6 sm:-mx-8 sm:px-8" : "border-slate-100",
        className
      )}
    >
      <div className="mb-8">
        {badge && (
          <div className="inline-flex items-center rounded-full bg-blue-100 text-blue-700 px-3 py-1 text-xs font-semibold uppercase tracking-wider mb-3">
            {badge}
          </div>
        )}
        <h2 className={cn("text-2xl sm:text-3xl font-bold", dark ? "text-white" : "text-slate-900")}>
          {title}
        </h2>
        {subtitle && (
          <p className={cn("mt-2 text-base", dark ? "text-slate-400" : "text-slate-500")}>
            {subtitle}
          </p>
        )}
      </div>
      {children}
    </section>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Key metric card (used in partnership summary)
// ─────────────────────────────────────────────────────────────────────────────
function MetricCard({
  icon: Icon,
  value,
  label,
  color,
}: {
  icon: React.ElementType;
  value: string;
  label: string;
  color: string;
}) {
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
  proposal,
  company,
  campaign,
  approvedImages = [],
  adminMode = false,
  onPrint,
  onShare,
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
    proposal.status === "approved"
      ? "bg-emerald-500 text-white"
      : proposal.status === "rejected"
      ? "bg-red-500 text-white"
      : "bg-white/20 text-white border border-white/30";

  return (
    <article className="min-h-screen w-full bg-slate-50 print:bg-white">

      {/* ─── HERO ────────────────────────────────────────────────────────── */}
      <header className="relative w-full overflow-hidden bg-gradient-to-br from-[#0a1628] via-[#0f2347] to-[#1a3a6b] print:bg-blue-900">
        {/* Animated background dots */}
        <div
          className="absolute inset-0 opacity-[0.07] pointer-events-none"
          style={{
            backgroundImage: "radial-gradient(circle, white 1px, transparent 1px)",
            backgroundSize: "32px 32px",
          }}
        />
        {/* Glow accents */}
        <div className="absolute -top-24 -right-24 w-96 h-96 bg-blue-500/20 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute -bottom-24 -left-24 w-96 h-96 bg-indigo-600/20 rounded-full blur-3xl pointer-events-none" />

        <div className="relative max-w-5xl mx-auto px-6 sm:px-8 py-16 sm:py-20 lg:py-24">
          {/* Company + status chips */}
          <div className="flex flex-wrap items-center gap-2 mb-6 sm:mb-8">
            <span className="inline-flex items-center gap-1.5 rounded-full bg-white/10 border border-white/20 px-3 py-1.5 text-xs font-semibold text-white/90 backdrop-blur-sm">
              <Building2 className="h-3 w-3" />
              {company.company_name}
            </span>
            {company.industry && (
              <span className="rounded-full bg-blue-500/30 border border-blue-400/30 px-3 py-1.5 text-xs text-blue-200 font-medium">
                {company.industry}
              </span>
            )}
            <span className={cn("ml-auto rounded-full px-3 py-1.5 text-xs font-bold uppercase tracking-wider backdrop-blur-sm", statusColor)}>
              {proposal.status}
            </span>
          </div>

          {/* Main title */}
          <h1 className="text-3xl sm:text-4xl lg:text-5xl xl:text-6xl font-extrabold text-white leading-tight mb-4 sm:mb-5 tracking-tight">
            {content?.title || proposal.title}
          </h1>

          {campaign && (
            <div className="mb-8 sm:mb-10">
              <p className="text-blue-200 text-base sm:text-lg font-medium">
                Campanha:{" "}
                <span className="text-white font-semibold">{campaign.title}</span>
              </p>
              {campaign.summary && (
                <p className="text-blue-300/80 text-sm mt-1 max-w-2xl">{campaign.summary}</p>
              )}
            </div>
          )}

          {/* Hero stats grid */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 sm:gap-4">
            <HeroStat icon={Trophy}       label="Clube Parceiro"     value="Coritiba FC" sub="Couto Pereira · Curitiba, PR"         color="amber" />
            <HeroStat icon={Users}        label="Torcedores Coxa"    value="1.5M+" sub="Seguidores digitais combinados"            color="green" />
            <HeroStat icon={Tv2}          label="Jogos por Temporada" value="38+"  sub="Broadcast nacional + streaming"          color="blue"  />
            <HeroStat icon={TrendingUp}   label="Crescimento Digital" value="+47%" sub="Engajamento nas redes em 2025"           color="purple"/>
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

      {/* ─── MAIN CONTENT ──────────────────────────────────────────────── */}
      <main className="w-full max-w-5xl mx-auto px-6 sm:px-8">

        {/* Partnership Summary Strip */}
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
                <div className="flex items-center gap-2 rounded-xl bg-blue-50 border border-blue-100 px-4 py-2.5">
                  <Zap className="h-4 w-4 text-blue-600" />
                  <div>
                    <div className="text-xs text-blue-600 font-medium">Score de Fit</div>
                    <div className="text-lg font-extrabold text-blue-800">
                      {proposal.intelligence.sponsorship_fit_score?.toFixed(1)}/10
                    </div>
                  </div>
                </div>
              )}
            </div>
            {/* Quick metrics */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              <MetricCard icon={Globe}      value="5M+"    label="Impressões/Temporada"   color="bg-blue-100 text-blue-600" />
              <MetricCard icon={Megaphone}  value="18–35"  label="Faixa Etária Principal"  color="bg-green-100 text-green-600" />
              <MetricCard icon={BarChart3}  value="68%"    label="Audiência Masculina"      color="bg-amber-100 text-amber-600" />
              <MetricCard icon={Shield}     value="92%"    label="Recall de Marca Jogo"     color="bg-violet-100 text-violet-600" />
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

        {/* Strategy variants */}
        {proposal.strategy_variants && proposal.strategy_variants.length > 0 && (
          <Section id="strategies" title="Estratégias de Patrocínio" badge="Direções Estratégicas"
            subtitle="Escolha a abordagem que melhor se alinha com seus objetivos de negócio">
            <StrategyTabs variants={proposal.strategy_variants} />
          </Section>
        )}

        {/* Campaign detail cards */}
        <Section id="campaign" title="Proposta Detalhada" badge="Plano de Ativação">
          <div className="space-y-5">
            {content?.campaign_rationale && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                <div className="rounded-xl bg-white border border-slate-200 shadow-sm p-6 sm:p-7">
                  <div className="flex items-center gap-2.5 mb-4">
                    <div className="rounded-lg bg-blue-100 p-2">
                      <Megaphone className="h-4 w-4 text-blue-700" />
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
              <div className="rounded-xl bg-gradient-to-br from-slate-900 to-slate-800 p-6 sm:p-7 text-white">
                <div className="flex items-center gap-2.5 mb-5">
                  <div className="rounded-lg bg-white/10 p-2">
                    <Zap className="h-4 w-4 text-amber-300" />
                  </div>
                  <div className="font-semibold text-white">Plano de Ativação</div>
                </div>
                <p className="text-slate-300 text-sm leading-relaxed whitespace-pre-line">{content.activation_plan}</p>
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
                <div key={i} className="flex items-start gap-3 rounded-xl bg-white border border-slate-200 p-4 sm:p-5 hover:border-blue-200 hover:shadow-sm transition-all">
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

        {/* AI Generated Images — shown when images have been generated and approved */}
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
                      <span className="text-xs text-slate-500 capitalize">
                        {img.job_type.replace(/_/g, " ")}
                      </span>
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
            <div className="rounded-xl bg-gradient-to-r from-blue-50 to-indigo-50 border border-blue-200 p-6 sm:p-8">
              <div className="flex items-start gap-4">
                <div className="rounded-lg bg-blue-100 p-2.5 shrink-0">
                  <TrendingUp className="h-5 w-5 text-blue-700" />
                </div>
                <p className="text-blue-900 text-sm sm:text-base leading-relaxed">{content.investment_note}</p>
              </div>
            </div>
          </Section>
        )}

        {/* CTA */}
        {content?.cta && (
          <section className="py-14 border-t border-slate-100 print:hidden">
            <div className="rounded-2xl overflow-hidden bg-gradient-to-br from-[#0a1628] to-[#1a3a6b] p-10 sm:p-14 text-center text-white relative">
              <div className="absolute inset-0 opacity-[0.06]" style={{ backgroundImage: "radial-gradient(circle, white 1px, transparent 1px)", backgroundSize: "24px 24px" }} />
              <div className="relative">
                <div className="inline-flex items-center gap-2 rounded-full bg-white/10 border border-white/20 px-4 py-1.5 text-xs font-semibold text-white/70 mb-5 uppercase tracking-wider">
                  <Zap className="h-3 w-3" />
                  Próximo Passo
                </div>
                <p className="text-xl sm:text-2xl font-bold text-white mb-8 max-w-2xl mx-auto leading-relaxed">{content.cta}</p>
                <div className="flex flex-wrap justify-center gap-3">
                  {onPrint && (
                    <button
                      onClick={onPrint}
                      className="inline-flex items-center gap-2 rounded-xl bg-white/10 hover:bg-white/20 border border-white/20 px-6 py-3 text-sm font-semibold text-white transition-all"
                    >
                      Baixar Proposta (PDF)
                    </button>
                  )}
                  {onShare && (
                    <button
                      onClick={onShare}
                      className="inline-flex items-center gap-2 rounded-xl bg-white text-blue-900 hover:bg-blue-50 px-6 py-3 text-sm font-semibold transition-all shadow-lg"
                    >
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
          <p className="font-semibold text-slate-600">{company.company_name} × Futebol Paranaense</p>
          <p className="mt-1">Proposta de Patrocínio · v{proposal.version} · {formatDate(proposal.created_at)}</p>
          <p className="mt-1">Plataforma de Automação de Patrocínio · Confidencial</p>
        </div>
      </main>
    </article>
  );
}
