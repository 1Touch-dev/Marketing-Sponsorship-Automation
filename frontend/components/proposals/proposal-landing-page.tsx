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
  Megaphone,
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
  /** Show admin controls (edit/approve/share buttons) */
  adminMode?: boolean;
  /** Called when user wants to export/print */
  onPrint?: () => void;
  /** Called when user creates a share link */
  onShare?: () => void;
}

// ─────────────────────────────────────────────────────────────────────────────
// Stat card
// ─────────────────────────────────────────────────────────────────────────────
function StatCard({
  icon: Icon,
  label,
  value,
  sub,
}: {
  icon: React.ElementType;
  label: string;
  value: string;
  sub?: string;
}) {
  return (
    <div className="flex items-center gap-3 rounded-xl bg-white/10 backdrop-blur-sm p-4 border border-white/20">
      <div className="rounded-lg bg-white/20 p-2.5">
        <Icon className="h-5 w-5 text-white" />
      </div>
      <div>
        <div className="text-xs text-white/60 font-medium">{label}</div>
        <div className="text-xl font-bold text-white leading-none">{value}</div>
        {sub && <div className="text-xs text-white/70 mt-0.5">{sub}</div>}
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
  children,
  className,
}: {
  id?: string;
  title: string;
  subtitle?: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section id={id} className={cn("py-10 border-t border-slate-100", className)}>
      <div className="mb-6">
        <h2 className="text-2xl font-bold text-slate-900">{title}</h2>
        {subtitle && <p className="mt-1 text-slate-500 text-sm">{subtitle}</p>}
      </div>
      {children}
    </section>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Main component
// ─────────────────────────────────────────────────────────────────────────────
export function ProposalLandingPage({
  proposal,
  company,
  campaign,
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

  return (
    <article className="min-h-screen bg-slate-50 print:bg-white">

      {/* ── HERO ─────────────────────────────────────────────────────────── */}
      <header className="relative bg-gradient-to-br from-blue-900 via-blue-800 to-indigo-900 print:bg-blue-900">
        {/* Background pattern */}
        <div className="absolute inset-0 opacity-10 pointer-events-none"
          style={{
            backgroundImage:
              "radial-gradient(circle at 20% 50%, white 1px, transparent 1px), radial-gradient(circle at 80% 20%, white 1px, transparent 1px)",
            backgroundSize: "60px 60px",
          }}
        />

        <div className="relative max-w-5xl mx-auto px-6 py-16 sm:py-20">
          {/* Company + status */}
          <div className="flex flex-wrap items-center gap-2 mb-6">
            <span className="inline-flex items-center gap-1.5 rounded-full bg-white/15 px-3 py-1 text-xs font-semibold text-white/90 border border-white/20">
              <Building2 className="h-3 w-3" />
              {company.company_name}
            </span>
            {company.industry && (
              <span className="rounded-full bg-blue-600/40 px-3 py-1 text-xs text-blue-100 font-medium border border-blue-500/30">
                {company.industry}
              </span>
            )}
            <span className={cn(
              "ml-auto rounded-full px-3 py-1 text-xs font-bold uppercase tracking-wide",
              proposal.status === "approved"
                ? "bg-green-500 text-white"
                : proposal.status === "rejected"
                ? "bg-red-500 text-white"
                : "bg-white/20 text-white"
            )}>
              {proposal.status}
            </span>
          </div>

          {/* Title */}
          <h1 className="text-3xl sm:text-4xl lg:text-5xl font-extrabold text-white leading-tight mb-4">
            {content?.title || proposal.title}
          </h1>

          {campaign && (
            <p className="text-blue-200 text-base sm:text-lg font-medium mb-8">
              Campanha: {campaign.title}
              {campaign.summary && <span className="text-blue-300 font-normal"> — {campaign.summary}</span>}
            </p>
          )}

          {/* Stats */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <StatCard icon={Trophy} label="Temporada" value="2026" sub="Atletico PR / Coritiba" />
            <StatCard icon={Users} label="Público Torcedor" value="500k+" sub="Paraná region" />
            <StatCard icon={TrendingUp} label="Impacto Esperado" value="Alto" sub="Baseado em análise IA" />
            <StatCard icon={MapPin} label="Cidade" value="Curitiba" sub="Estado do Paraná, Brasil" />
          </div>

          <div className="mt-6 flex items-center gap-2 text-white/50 text-xs">
            <span>Proposta v{proposal.version}</span>
            <span>·</span>
            <span>Gerada em {formatDate(proposal.created_at)}</span>
          </div>
        </div>
      </header>

      {/* ── MAIN CONTENT ────────────────────────────────────────────────── */}
      <main className="max-w-5xl mx-auto px-6">

        {/* Executive summary */}
        {content?.executive_summary && (
          <Section id="summary" title="Sumário Executivo" subtitle="Visão geral da proposta de patrocínio">
            <div className="rounded-2xl bg-white border border-slate-200 shadow-sm p-8">
              <p className="text-slate-700 text-lg leading-relaxed">{content.executive_summary}</p>
            </div>
          </Section>
        )}

        {/* Intelligence */}
        {proposal.intelligence && (
          <Section id="intelligence" title="Inteligência Comercial" subtitle="Análise estratégica gerada por IA">
            <IntelligencePanel intelligence={proposal.intelligence} />
          </Section>
        )}

        {/* Strategy variants */}
        {proposal.strategy_variants && proposal.strategy_variants.length > 0 && (
          <Section
            id="strategies"
            title="Estratégias de Patrocínio"
            subtitle="Diferentes abordagens estratégicas para esta parceria"
          >
            <StrategyTabs variants={proposal.strategy_variants} />
          </Section>
        )}

        {/* Campaign details */}
        <Section id="campaign" title="Detalhes da Campanha">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            {content?.campaign_rationale && (
              <div className="rounded-xl bg-white border border-slate-200 p-6">
                <div className="flex items-center gap-2 text-sm font-semibold text-slate-500 mb-3">
                  <Megaphone className="h-4 w-4" />
                  Racional da Campanha
                </div>
                <p className="text-slate-700 text-sm leading-relaxed">{content.campaign_rationale}</p>
              </div>
            )}
            {content?.sponsorship_value && (
              <div className="rounded-xl bg-white border border-slate-200 p-6">
                <div className="flex items-center gap-2 text-sm font-semibold text-slate-500 mb-3">
                  <Target className="h-4 w-4" />
                  Valor para o Patrocinador
                </div>
                <p className="text-slate-700 text-sm leading-relaxed">{content.sponsorship_value}</p>
              </div>
            )}
          </div>
        </Section>

        {/* Activation plan */}
        {content?.activation_plan && (
          <Section id="activation" title="Plano de Ativação" subtitle="Estratégia de execução e cronograma">
            <div className="rounded-xl bg-white border border-slate-200 p-6">
              <p className="text-slate-700 text-sm leading-relaxed whitespace-pre-line">{content.activation_plan}</p>
            </div>
          </Section>
        )}

        {/* Deliverables */}
        {content?.deliverables && content.deliverables.length > 0 && (
          <Section id="deliverables" title="Entregas e Benefícios" subtitle="O que está incluído nesta parceria">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {content.deliverables.map((d, i) => (
                <div key={i} className="flex items-start gap-3 rounded-xl bg-white border border-slate-200 p-4">
                  <CheckCircle2 className="h-5 w-5 text-green-500 shrink-0 mt-0.5" />
                  <p className="text-slate-700 text-sm">{d}</p>
                </div>
              ))}
            </div>
          </Section>
        )}

        {/* Pricing tiers */}
        {proposal.pricing_tiers && proposal.pricing_tiers.length > 0 && (
          <Section
            id="pricing"
            title="Opções de Investimento"
            subtitle="Pacotes de patrocínio adaptados ao seu orçamento e objetivos"
          >
            <PricingTiers tiers={proposal.pricing_tiers} />
          </Section>
        )}

        {/* Visual mockups */}
        {proposal.visual_prompts && proposal.visual_prompts.length > 0 && (
          <Section
            id="visuals"
            title="Conceitos Visuais"
            subtitle="Mockups e prompts de geração de imagem personalizados para sua marca"
          >
            <VisualMockupGrid
              visuals={proposal.visual_prompts}
              companyName={company.company_name}
            />
          </Section>
        )}

        {/* Investment note */}
        {content?.investment_note && (
          <Section id="investment" title="Sobre o Investimento">
            <div className="rounded-xl bg-blue-50 border border-blue-200 p-6">
              <p className="text-blue-900 text-sm leading-relaxed">{content.investment_note}</p>
            </div>
          </Section>
        )}

        {/* CTA */}
        {content?.cta && (
          <section className="py-12 border-t border-slate-100 print:hidden">
            <div className="rounded-2xl bg-gradient-to-br from-blue-900 to-indigo-900 p-10 text-center text-white">
              <p className="text-xl font-bold mb-4">{content.cta}</p>
              <div className="flex flex-wrap justify-center gap-3 mt-6">
                {onPrint && (
                  <button
                    onClick={onPrint}
                    className="inline-flex items-center gap-2 rounded-lg bg-white/15 hover:bg-white/25 border border-white/25 px-5 py-2.5 text-sm font-semibold text-white transition-colors"
                  >
                    Baixar / Imprimir Proposta
                  </button>
                )}
                {onShare && (
                  <button
                    onClick={onShare}
                    className="inline-flex items-center gap-2 rounded-lg bg-white text-blue-900 hover:bg-blue-50 px-5 py-2.5 text-sm font-semibold transition-colors"
                  >
                    Compartilhar Proposta
                    <ArrowRight className="h-4 w-4" />
                  </button>
                )}
              </div>
            </div>
          </section>
        )}

        {/* Print footer */}
        <div className="hidden print:block py-8 text-center text-xs text-slate-400 border-t border-slate-200">
          <p>Proposta gerada pela Plataforma de Automação de Patrocínio · {formatDate(proposal.created_at)}</p>
          <p className="mt-1">{company.company_name} · v{proposal.version}</p>
        </div>
      </main>
    </article>
  );
}
