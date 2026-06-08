"use client";

import React from "react";
import type { ProposalContent } from "@/types/database";
import type { PricingTier, StrategyVariant, CompanyIntelligence } from "@/lib/ai/schemas";
import type { ProposalImageAsset } from "@/lib/proposals/proposal-images";
import { CheckCircle2, FileText, TrendingUp, Zap, DollarSign, ArrowRight, Building2, Tag, List } from "lucide-react";

type LandingMinimalProps = {
  proposal: {
    id: string;
    title: string;
    status: string;
    version: number;
    created_at: string;
    content: ProposalContent;
    strategy_variants?: StrategyVariant[] | null;
    pricing_tiers?: PricingTier[] | null;
    intelligence?: CompanyIntelligence | null;
    share_token?: string | null;
  };
  company: {
    company_name: string;
    industry?: string | null;
    website?: string | null;
    country?: string | null;
    logo_url?: string | null;
  };
  campaign?: { title: string; summary?: string | null } | null;
  approvedImages?: ProposalImageAsset[];
  adminMode?: boolean;
};

type ContentMap = {
  title?: string;
  executive_summary?: string;
  campaign_rationale?: string;
  sponsorship_value?: string;
  activation_plan?: string;
  deliverables?: string[];
  investment_note?: string;
  cta?: string;
};

/** Template B — Minimal / Executive: clean white, document-style */
export function LandingTemplateMinimal({ proposal, company, campaign }: LandingMinimalProps) {
  const c = (proposal.content as unknown as ContentMap);
  const deliverables = c.deliverables ?? [];
  const pricingTiers = (proposal.pricing_tiers ?? []) as PricingTier[];

  return (
    <article className="min-h-screen bg-white font-sans">
      {/* Header */}
      <header className="border-b border-slate-200 px-8 py-6 flex items-center justify-between">
        <div className="flex items-center gap-4">
          {company.logo_url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={company.logo_url} alt={company.company_name} className="h-10 object-contain" />
          ) : (
            <div className="h-10 w-10 rounded-full bg-green-700 flex items-center justify-center text-white font-bold text-lg">
              {company.company_name[0]}
            </div>
          )}
          <div>
            <h1 className="text-lg font-bold text-slate-800">{company.company_name}</h1>
            {company.industry && <p className="text-xs text-slate-500">{company.industry}</p>}
          </div>
        </div>
        <div className="text-right">
          <p className="text-xs font-semibold text-green-700 uppercase tracking-widest">Coritiba FC</p>
          <p className="text-xs text-slate-400">Proposta de Patrocínio</p>
        </div>
      </header>

      {/* Hero text */}
      <div className="max-w-3xl mx-auto px-8 py-12">
        <div className="mb-2">
          <span className="text-xs font-semibold text-green-700 uppercase tracking-widest">{campaign?.title ?? "Proposta de Patrocínio"}</span>
        </div>
        <h2 className="text-3xl sm:text-4xl font-extrabold text-slate-900 mb-6 leading-tight">
          {c.title ?? proposal.title}
        </h2>

        {c.executive_summary && (
          <p className="text-lg text-slate-600 leading-relaxed border-l-4 border-green-600 pl-5">
            {c.executive_summary}
          </p>
        )}
      </div>

      {/* Sections */}
      <div className="max-w-3xl mx-auto px-8 pb-12 space-y-10">
        {c.campaign_rationale && (
          <section>
            <h3 className="flex items-center gap-2 text-sm font-semibold text-green-700 uppercase tracking-widest mb-3">
              <TrendingUp className="h-4 w-4" /> Racional da Campanha
            </h3>
            <p className="text-slate-700 leading-relaxed">{c.campaign_rationale}</p>
          </section>
        )}

        {c.sponsorship_value && (
          <section>
            <h3 className="flex items-center gap-2 text-sm font-semibold text-green-700 uppercase tracking-widest mb-3">
              <Building2 className="h-4 w-4" /> Valor ao Patrocinador
            </h3>
            <p className="text-slate-700 leading-relaxed">{c.sponsorship_value}</p>
          </section>
        )}

        {c.activation_plan && (
          <section>
            <h3 className="flex items-center gap-2 text-sm font-semibold text-green-700 uppercase tracking-widest mb-3">
              <Zap className="h-4 w-4" /> Plano de Ativação
            </h3>
            <p className="text-slate-700 leading-relaxed whitespace-pre-wrap">{c.activation_plan}</p>
          </section>
        )}

        {deliverables.length > 0 && (
          <section>
            <h3 className="flex items-center gap-2 text-sm font-semibold text-green-700 uppercase tracking-widest mb-3">
              <FileText className="h-4 w-4" /> Entregáveis
            </h3>
            <ul className="space-y-2">
              {deliverables.map((d, i) => (
                <li key={i} className="flex items-start gap-2.5 text-slate-700">
                  <CheckCircle2 className="h-4 w-4 text-green-600 mt-0.5 flex-shrink-0" />
                  {d}
                </li>
              ))}
            </ul>
          </section>
        )}

        {/* Pricing tiers */}
        {pricingTiers.length > 0 && (
          <section>
            <h3 className="flex items-center gap-2 text-sm font-semibold text-green-700 uppercase tracking-widest mb-4">
              <DollarSign className="h-4 w-4" /> Pacotes de Investimento
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              {pricingTiers.map((tier, i) => (
                <div key={i} className={`rounded-xl border p-4 ${tier.highlight ? "border-green-500 bg-green-50 ring-2 ring-green-400" : "border-slate-200"}`}>
                  <p className="text-xs font-semibold text-green-700 uppercase tracking-wide mb-1">{(tier as unknown as { label: string }).label}</p>
                  <p className="text-lg font-bold text-slate-800 mb-2">{(tier as unknown as { price_range: string }).price_range}</p>
                  {(tier as unknown as { deliverables?: string[] }).deliverables?.slice(0, 3).map((d: string, j: number) => (
                    <p key={j} className="text-xs text-slate-600 mb-1 flex items-start gap-1.5">
                      <CheckCircle2 className="h-3 w-3 text-green-500 mt-0.5 flex-shrink-0" />{d}
                    </p>
                  ))}
                </div>
              ))}
            </div>
          </section>
        )}

        {c.investment_note && (
          <section className="rounded-xl bg-slate-50 border border-slate-200 p-5">
            <p className="text-sm font-semibold text-slate-700 mb-2">Nota de Investimento</p>
            <p className="text-slate-600">{c.investment_note}</p>
          </section>
        )}

        {c.cta && (
          <section className="rounded-xl bg-green-700 p-6 text-center">
            <p className="text-white font-semibold mb-4 text-lg">{c.cta}</p>
            <a
              href="mailto:patrocinios@coritiba.com.br"
              className="inline-flex items-center gap-2 rounded-full bg-white text-green-800 px-6 py-2.5 font-bold text-sm hover:bg-green-50 transition-colors"
            >
              Entrar em contato <ArrowRight className="h-4 w-4" />
            </a>
          </section>
        )}
      </div>
    </article>
  );
}

/** Template C — Packages Focus: big tier cards front and center */
export function LandingTemplatePackages({ proposal, company, campaign }: LandingMinimalProps) {
  const c = (proposal.content as unknown as ContentMap);
  const pricingTiers = (proposal.pricing_tiers ?? []) as PricingTier[];

  const tierColors: Record<string, { bg: string; border: string; badge: string }> = {
    low: { bg: "bg-slate-50", border: "border-slate-200", badge: "bg-slate-200 text-slate-700" },
    mid: { bg: "bg-green-50", border: "border-green-400", badge: "bg-green-600 text-white" },
    high: { bg: "bg-gradient-to-b from-green-800 to-green-900", border: "border-green-700", badge: "bg-yellow-400 text-green-900" },
  };

  return (
    <article className="min-h-screen bg-slate-50 font-sans">
      {/* Hero */}
      <header className="bg-green-800 text-white px-8 py-16 text-center">
        <p className="text-green-300 text-xs font-semibold uppercase tracking-widest mb-3">
          Coritiba FC × {company.company_name}
        </p>
        <h1 className="text-3xl sm:text-4xl lg:text-5xl font-extrabold mb-4 leading-tight">
          {c.title ?? proposal.title}
        </h1>
        {campaign?.title && (
          <p className="text-green-200 text-base">{campaign.title}</p>
        )}
        {c.executive_summary && (
          <p className="mt-6 max-w-2xl mx-auto text-green-100/90 text-sm leading-relaxed">{c.executive_summary}</p>
        )}
      </header>

      {/* Packages */}
      <section className="max-w-5xl mx-auto px-6 py-12">
        <div className="text-center mb-8">
          <h2 className="text-2xl font-bold text-slate-800">Escolha o Pacote Ideal</h2>
          <p className="text-slate-500 mt-1">Três níveis de parceria com benefícios exclusivos no Couto Pereira</p>
        </div>

        {pricingTiers.length > 0 ? (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {pricingTiers.map((tier, i) => {
              const t = tier as unknown as { tier: string; label: string; price_range: string; activations?: string[]; deliverables?: string[]; visibility?: string; digital_exposure?: string; stadium_exposure?: string; highlight?: boolean };
              const colors = tierColors[t.tier] ?? tierColors.low;
              const isHigh = t.tier === "high";
              return (
                <div key={i} className={`rounded-2xl border-2 ${colors.border} ${colors.bg} overflow-hidden ${t.highlight ? "ring-4 ring-green-400/30 scale-[1.02]" : ""} transition-transform`}>
                  <div className="px-6 pt-6 pb-4">
                    <div className="flex items-center justify-between mb-3">
                      <span className={`text-xs font-bold px-2.5 py-1 rounded-full ${colors.badge}`}>{t.label}</span>
                      {t.highlight && <span className="text-xs font-semibold text-green-600 bg-green-100 px-2 py-0.5 rounded-full">Recomendado</span>}
                    </div>
                    <p className={`text-2xl font-extrabold mb-1 ${isHigh ? "text-white" : "text-slate-800"}`}>{t.price_range}</p>
                    {t.visibility && <p className={`text-xs mb-4 ${isHigh ? "text-green-200" : "text-slate-500"}`}>{t.visibility}</p>}

                    <ul className="space-y-2 mt-4">
                      {(t.deliverables ?? t.activations ?? []).slice(0, 5).map((d, j) => (
                        <li key={j} className={`flex items-start gap-2 text-xs ${isHigh ? "text-green-100" : "text-slate-600"}`}>
                          <CheckCircle2 className={`h-3.5 w-3.5 mt-0.5 flex-shrink-0 ${isHigh ? "text-green-400" : "text-green-600"}`} />
                          {d}
                        </li>
                      ))}
                    </ul>
                  </div>
                  <div className="px-6 pb-6">
                    <a
                      href="mailto:patrocinios@coritiba.com.br"
                      className={`block w-full text-center rounded-xl py-2.5 text-sm font-bold transition-colors ${
                        isHigh ? "bg-yellow-400 text-green-900 hover:bg-yellow-300" :
                        t.highlight ? "bg-green-600 text-white hover:bg-green-700" :
                        "bg-slate-200 text-slate-700 hover:bg-slate-300"
                      }`}
                    >
                      Quero esse pacote
                    </a>
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="text-center py-12 text-slate-400">
            <p>Gere os pacotes de preço na proposta para exibi-los aqui.</p>
          </div>
        )}
      </section>

      {/* Brief value props */}
      {(c.sponsorship_value || c.activation_plan) && (
        <section className="bg-white border-t border-slate-200 py-12">
          <div className="max-w-4xl mx-auto px-6 grid grid-cols-1 md:grid-cols-2 gap-8">
            {c.sponsorship_value && (
              <div>
                <h3 className="text-sm font-bold text-green-700 uppercase tracking-wider mb-3">O que você ganha</h3>
                <p className="text-slate-600 text-sm leading-relaxed">{c.sponsorship_value}</p>
              </div>
            )}
            {c.activation_plan && (
              <div>
                <h3 className="text-sm font-bold text-green-700 uppercase tracking-wider mb-3">Como ativamos</h3>
                <p className="text-slate-600 text-sm leading-relaxed line-clamp-5">{c.activation_plan}</p>
              </div>
            )}
          </div>
        </section>
      )}

      {c.cta && (
        <section className="py-16 text-center px-6">
          <p className="text-xl font-bold text-slate-800 mb-5">{c.cta}</p>
          <a
            href="mailto:patrocinios@coritiba.com.br"
            className="inline-flex items-center gap-2 rounded-full bg-green-700 text-white px-8 py-3 font-bold text-sm hover:bg-green-800 transition-colors shadow-lg"
          >
            Entrar em contato <ArrowRight className="h-4 w-4" />
          </a>
        </section>
      )}
    </article>
  );
}

/** Template D — One Offer: single focused offer, ideal for a specific named opportunity */
export function LandingTemplateOneOffer({ proposal, company, campaign }: LandingMinimalProps) {
  const c = (proposal.content as unknown as ContentMap);
  const deliverables = c.deliverables ?? [];

  return (
    <article className="min-h-screen bg-white font-sans">
      {/* Hero — split layout */}
      <header
        className="relative overflow-hidden"
        style={{ background: "linear-gradient(135deg, #003A2D 0%, #005742 60%, #007358 100%)" }}
      >
        <div className="absolute inset-0 opacity-[0.06] pointer-events-none"
          style={{ backgroundImage: "repeating-linear-gradient(90deg,white 0px,white 20px,transparent 20px,transparent 60px)" }} />
        <div className="relative max-w-4xl mx-auto px-8 py-16 sm:py-20 flex flex-col sm:flex-row items-center gap-10">
          <div className="flex-1 text-white">
            {company.logo_url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={company.logo_url} alt={company.company_name} className="h-12 object-contain mb-6" />
            ) : (
              <div className="h-12 w-12 rounded-full bg-white/20 flex items-center justify-center text-white font-bold text-xl mb-6">
                {company.company_name[0]}
              </div>
            )}
            <div className="inline-flex items-center gap-1.5 bg-white/10 border border-white/20 rounded-full px-3 py-1 text-xs font-semibold text-white/80 mb-4">
              <Tag className="h-3 w-3" /> Oferta Exclusiva
            </div>
            <h1 className="text-3xl sm:text-4xl font-extrabold mb-4 leading-tight">{c.title ?? proposal.title}</h1>
            {c.executive_summary && (
              <p className="text-green-100/90 text-base leading-relaxed max-w-xl">{c.executive_summary}</p>
            )}
          </div>
          <div className="shrink-0 w-full sm:w-64 bg-white rounded-2xl shadow-2xl p-6 text-center">
            <p className="text-xs font-semibold text-green-700 uppercase tracking-widest mb-2">Coritiba FC</p>
            <p className="text-xl font-extrabold text-slate-800 mb-1">{campaign?.title ?? "Patrocínio"}</p>
            {company.industry && <p className="text-xs text-slate-500 mb-4">{company.industry}</p>}
            <a
              href="mailto:patrocinios@coritiba.com.br"
              className="block w-full rounded-xl bg-green-700 text-white py-3 text-sm font-bold hover:bg-green-800 transition-colors"
            >
              Quero essa oferta
            </a>
          </div>
        </div>
      </header>

      {/* Single offer detail */}
      <div className="max-w-4xl mx-auto px-8 py-12 space-y-10">
        {c.campaign_rationale && (
          <section className="flex gap-6 items-start">
            <div className="shrink-0 h-10 w-10 rounded-xl bg-green-50 border border-green-200 flex items-center justify-center">
              <TrendingUp className="h-5 w-5 text-green-700" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-green-700 uppercase tracking-wider mb-2">Por que agora?</h3>
              <p className="text-slate-700 leading-relaxed">{c.campaign_rationale}</p>
            </div>
          </section>
        )}

        {c.sponsorship_value && (
          <section className="flex gap-6 items-start">
            <div className="shrink-0 h-10 w-10 rounded-xl bg-green-50 border border-green-200 flex items-center justify-center">
              <Building2 className="h-5 w-5 text-green-700" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-green-700 uppercase tracking-wider mb-2">O que você recebe</h3>
              <p className="text-slate-700 leading-relaxed">{c.sponsorship_value}</p>
            </div>
          </section>
        )}

        {deliverables.length > 0 && (
          <section className="rounded-2xl border-2 border-green-100 bg-green-50 p-6">
            <h3 className="text-sm font-bold text-green-800 uppercase tracking-wider mb-4 flex items-center gap-2">
              <CheckCircle2 className="h-4 w-4" /> Entregáveis desta oferta
            </h3>
            <ul className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {deliverables.map((d, i) => (
                <li key={i} className="flex items-start gap-2 text-sm text-green-800">
                  <CheckCircle2 className="h-4 w-4 text-green-600 mt-0.5 shrink-0" />
                  {d}
                </li>
              ))}
            </ul>
          </section>
        )}

        {c.activation_plan && (
          <section>
            <h3 className="text-sm font-bold text-green-700 uppercase tracking-wider mb-3 flex items-center gap-2">
              <Zap className="h-4 w-4" /> Plano de Ativação
            </h3>
            <p className="text-slate-700 leading-relaxed whitespace-pre-wrap">{c.activation_plan}</p>
          </section>
        )}

        {c.cta && (
          <section className="rounded-2xl" style={{ background: "linear-gradient(135deg, #003A2D, #005742)" }}>
            <div className="p-8 text-center">
              <p className="text-white font-bold text-xl mb-5">{c.cta}</p>
              <a
                href="mailto:patrocinios@coritiba.com.br"
                className="inline-flex items-center gap-2 rounded-full bg-white text-green-800 px-8 py-3 font-bold text-sm hover:bg-green-50 transition-colors shadow-lg"
              >
                Entrar em contato <ArrowRight className="h-4 w-4" />
              </a>
            </div>
          </section>
        )}
      </div>
    </article>
  );
}

/** Template E — Inventory Menu: full menu of assets sponsor can choose from */
export function LandingTemplateInventoryMenu({ proposal, company, campaign }: LandingMinimalProps) {
  const c = (proposal.content as unknown as ContentMap);
  const pricingTiers = (proposal.pricing_tiers ?? []) as PricingTier[];
  const deliverables = c.deliverables ?? [];

  const MENU_CATEGORIES = [
    { key: "jersey", label: "Jersey & Kit", icon: "👕", items: deliverables.filter(d => /jersey|manga|camisa|sleeve|peito|chest/i.test(d)) },
    { key: "stadium", label: "Estádio Couto Pereira", icon: "🏟", items: deliverables.filter(d => /LED|placar|couto|estádio|stadium|board|naming|vip|hospitality/i.test(d)) },
    { key: "digital", label: "Digital & Social", icon: "📱", items: deliverables.filter(d => /digital|instagram|youtube|social|app|tiktok|web/i.test(d)) },
    { key: "community", label: "Comunidade & ESG", icon: "🤝", items: deliverables.filter(d => /youth|academy|ESG|community|social|impact|escola/i.test(d)) },
    { key: "other", label: "Outros Benefícios", icon: "⭐", items: deliverables.filter(d => !/jersey|manga|camisa|sleeve|peito|chest|LED|placar|couto|estádio|stadium|board|naming|vip|hospitality|digital|instagram|youtube|social|app|tiktok|web|youth|academy|ESG|community|social|impact|escola/i.test(d)) },
  ].filter(cat => cat.items.length > 0 || (cat.key === "other" && deliverables.length === 0));

  return (
    <article className="min-h-screen bg-slate-50 font-sans">
      {/* Hero */}
      <header className="text-white px-8 py-14 text-center" style={{ background: "linear-gradient(135deg, #003A2D 0%, #005742 100%)" }}>
        <div className="flex items-center justify-center gap-3 mb-4">
          {company.logo_url && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={company.logo_url} alt={company.company_name} className="h-10 object-contain" />
          )}
          <span className="text-white/40 text-2xl">×</span>
          <span className="text-sm font-bold text-white/90 uppercase tracking-widest">Coritiba FC</span>
        </div>
        <h1 className="text-3xl sm:text-4xl font-extrabold mb-3 leading-tight">{c.title ?? proposal.title}</h1>
        {campaign?.title && <p className="text-green-200 text-sm mb-3">{campaign.title}</p>}
        {c.executive_summary && (
          <p className="max-w-2xl mx-auto text-green-100/80 text-sm leading-relaxed">{c.executive_summary}</p>
        )}
        <div className="mt-6 inline-flex items-center gap-2 bg-white/10 border border-white/20 rounded-full px-4 py-2 text-xs font-semibold text-white/90">
          <List className="h-3.5 w-3.5" /> Menu de Ativos de Patrocínio — Escolha os benefícios que combinam com sua marca
        </div>
      </header>

      {/* Asset menu */}
      <section className="max-w-5xl mx-auto px-6 py-12">
        {MENU_CATEGORIES.length > 0 ? (
          <div className="space-y-8">
            {MENU_CATEGORIES.map((cat) => (
              <div key={cat.key}>
                <div className="flex items-center gap-2 mb-4">
                  <span className="text-2xl">{cat.icon}</span>
                  <h2 className="text-lg font-bold text-slate-800">{cat.label}</h2>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {cat.items.map((item, i) => (
                    <div key={i} className="flex items-start gap-3 bg-white rounded-xl border border-slate-200 px-4 py-3 shadow-sm hover:border-green-400 transition-colors cursor-default">
                      <CheckCircle2 className="h-4 w-4 text-green-600 mt-0.5 shrink-0" />
                      <span className="text-sm text-slate-700">{item}</span>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="text-center py-12 text-slate-400">
            <p>Adicione entregáveis na proposta para montar o menu de ativos.</p>
          </div>
        )}
      </section>

      {/* Pricing */}
      {pricingTiers.length > 0 && (
        <section className="bg-white border-t border-slate-200 py-12">
          <div className="max-w-5xl mx-auto px-6">
            <h2 className="text-xl font-bold text-slate-800 mb-6 text-center flex items-center justify-center gap-2">
              <DollarSign className="h-5 w-5 text-green-700" /> Pacotes de Investimento
            </h2>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              {pricingTiers.map((tier, i) => {
                const t = tier as unknown as { label: string; price_range: string; deliverables?: string[]; highlight?: boolean };
                return (
                  <div key={i} className={`rounded-2xl border-2 p-5 ${t.highlight ? "border-green-500 bg-green-50 ring-2 ring-green-300" : "border-slate-200 bg-white"}`}>
                    <p className="text-xs font-bold text-green-700 uppercase tracking-wider mb-1">{t.label}</p>
                    <p className="text-xl font-extrabold text-slate-800 mb-3">{t.price_range}</p>
                    <a
                      href="mailto:patrocinios@coritiba.com.br"
                      className={`block text-center rounded-xl py-2 text-sm font-bold transition-colors ${t.highlight ? "bg-green-600 text-white hover:bg-green-700" : "bg-slate-100 text-slate-700 hover:bg-slate-200"}`}
                    >
                      Selecionar
                    </a>
                  </div>
                );
              })}
            </div>
          </div>
        </section>
      )}

      {c.cta && (
        <section className="py-14 text-center px-6">
          <p className="text-xl font-bold text-slate-800 mb-5">{c.cta}</p>
          <a
            href="mailto:patrocinios@coritiba.com.br"
            className="inline-flex items-center gap-2 rounded-full bg-green-700 text-white px-8 py-3 font-bold text-sm hover:bg-green-800 transition-colors shadow-lg"
          >
            Entrar em contato <ArrowRight className="h-4 w-4" />
          </a>
        </section>
      )}
    </article>
  );
}
