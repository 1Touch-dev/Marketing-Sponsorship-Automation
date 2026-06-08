"use client";

import React, { useState, useCallback } from "react";
import { Edit3, Eye, CheckCircle2, Info, LayoutTemplate } from "lucide-react";
import type { ProposalContent } from "@/types/database";
import type { PricingTier, StrategyVariant, VisualPrompt, CompanyIntelligence } from "@/lib/ai/schemas";
import { ProposalLandingPage } from "./proposal-landing-page";
import { LandingTemplateMinimal, LandingTemplatePackages } from "./proposal-landing-templates";
import { InlineEdit } from "./inline-edit";
import { ProposalGraphicsPanel } from "./proposal-graphics-panel";
import { cn } from "@/lib/utils";
import type { ProposalImageAsset } from "@/lib/proposals/proposal-images";

type LandingTemplateId = "premium" | "minimal" | "packages";

const TEMPLATES: Array<{ id: LandingTemplateId; label: string; description: string }> = [
  { id: "premium", label: "Premium", description: "Rich green hero with stats, strategies & visuals" },
  { id: "minimal", label: "Minimal", description: "Clean white executive layout" },
  { id: "packages", label: "Packages", description: "Package-focused with big tier cards" },
];

interface ProposalCMSEditorProps {
  proposal: {
    id: string;
    title: string;
    status: string;
    version: number;
    created_at: string;
    content: ProposalContent;
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
    logo_url?: string | null;
  };
  campaign?: { title: string; summary?: string | null } | null;
  approvedImages?: ProposalImageAsset[];
  companyId?: string;
}

type ContentFields = {
  title?: string;
  executive_summary?: string;
  campaign_rationale?: string;
  sponsorship_value?: string;
  activation_plan?: string;
  investment_note?: string;
  cta?: string;
};

const CMS_FIELDS: Array<{
  key: keyof ContentFields;
  label: string;
  multiline: boolean;
  hint: string;
}> = [
  { key: "title",               label: "Título da Proposta",    multiline: false, hint: "Título principal exibido no hero" },
  { key: "executive_summary",   label: "Sumário Executivo",     multiline: true,  hint: "Parágrafo de abertura (~120 palavras)" },
  { key: "campaign_rationale",  label: "Racional da Campanha",  multiline: true,  hint: "Por que este patrocínio faz sentido (~150 palavras)" },
  { key: "sponsorship_value",   label: "Valor ao Patrocinador", multiline: true,  hint: "Benefícios concretos (~120 palavras)" },
  { key: "activation_plan",     label: "Plano de Ativação",     multiline: true,  hint: "Fases de ativação no Couto Pereira (~200 palavras)" },
  { key: "investment_note",     label: "Nota de Investimento",  multiline: true,  hint: "Contextualização de investimento (aspiracional)" },
  { key: "cta",                 label: "Call to Action",        multiline: false, hint: "CTA final para o patrocinador" },
];

export function ProposalCMSEditor({
  proposal, company, campaign, approvedImages = [], companyId,
}: ProposalCMSEditorProps) {
  const [editMode, setEditMode] = useState(false);
  const [activeTemplate, setActiveTemplate] = useState<LandingTemplateId>("premium");
  const [localContent, setLocalContent] = useState<ContentFields>(
    (proposal.content as unknown as ContentFields) ?? {}
  );
  const [savedFields, setSavedFields] = useState<Set<string>>(new Set());

  const handleSaved = useCallback((key: string, newVal: string) => {
    setLocalContent(prev => ({ ...prev, [key]: newVal }));
    setSavedFields(prev => {
      const next = new Set(prev);
      next.add(key);
      setTimeout(() => setSavedFields(p => { const n = new Set(p); n.delete(key); return n; }), 3000);
      return next;
    });
  }, []);

  const mergedProposal = {
    ...proposal,
    content: { ...proposal.content, ...localContent } as ProposalContent,
  };

  return (
    <div className="relative">
      {/* CMS toolbar */}
      <div className={cn(
        "sticky top-0 z-50 flex items-center justify-between px-4 py-2 border-b text-sm font-medium transition-colors print:hidden",
        editMode
          ? "bg-green-700 text-white border-green-800"
          : "bg-white text-slate-700 border-slate-200"
      )}>
        <div className="flex items-center gap-2">
          {editMode ? (
            <>
              <Edit3 className="h-4 w-4" />
              <span>Modo de Edição Ativo</span>
              <span className="text-green-200 text-xs ml-2">— passe o mouse sobre qualquer texto e clique no lápis para editar</span>
            </>
          ) : (
            <>
              <Eye className="h-4 w-4 text-slate-500" />
              <span className="text-slate-600">Modo de Visualização</span>
            </>
          )}
        </div>
        <div className="flex items-center gap-2">
          {savedFields.size > 0 && (
            <span className="flex items-center gap-1 text-xs text-green-600 bg-green-50 px-2 py-1 rounded-full">
              <CheckCircle2 className="h-3 w-3" />
              {savedFields.size} campo{savedFields.size > 1 ? "s" : ""} salvo{savedFields.size > 1 ? "s" : ""}
            </span>
          )}
          {/* Template switcher */}
          <div className="flex items-center gap-1 rounded-lg border border-slate-200 bg-slate-50 p-0.5">
            <LayoutTemplate className="h-3.5 w-3.5 text-slate-400 ml-1.5" />
            {TEMPLATES.map((t) => (
              <button
                key={t.id}
                onClick={() => setActiveTemplate(t.id)}
                title={t.description}
                className={cn(
                  "rounded-md px-2.5 py-1 text-xs font-medium transition-colors",
                  activeTemplate === t.id
                    ? "bg-white text-slate-800 shadow-sm"
                    : "text-slate-500 hover:text-slate-700"
                )}
              >
                {t.label}
              </button>
            ))}
          </div>
          <button
            onClick={() => setEditMode(v => !v)}
            className={cn(
              "flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition-all",
              editMode
                ? "bg-white text-green-800 hover:bg-green-50"
                : "bg-green-600 text-white hover:bg-green-700"
            )}
          >
            {editMode ? <><Eye className="h-3.5 w-3.5" /> Sair da Edição</> : <><Edit3 className="h-3.5 w-3.5" /> Editar Proposta</>}
          </button>
        </div>
      </div>

      {/* Edit panel — shown in edit mode as a side-scrolling field list */}
      {editMode && (
        <div className="bg-green-50 border-b border-green-200 px-6 py-4 print:hidden">
          <div className="max-w-5xl mx-auto">
            <div className="flex items-center gap-2 mb-3 text-sm text-green-800 font-semibold">
              <Info className="h-4 w-4" />
              Campos editáveis — clique em &quot;Salvar&quot; após cada edição. As mudanças são imediatas e ficam salvas no banco.
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {CMS_FIELDS.map(field => {
                const currentVal = String((localContent as Record<string, unknown>)[field.key] ?? "");
                return (
                  <div key={field.key}
                    className={cn(
                      "rounded-lg border bg-white p-3 transition-colors",
                      savedFields.has(field.key) ? "border-green-400 bg-green-50" : "border-slate-200"
                    )}>
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-xs font-semibold text-slate-600 uppercase tracking-wide">{field.label}</span>
                      {savedFields.has(field.key) && (
                        <span className="text-xs text-green-600 flex items-center gap-0.5">
                          <CheckCircle2 className="h-3 w-3" /> Salvo
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-slate-400 mb-2">{field.hint}</p>
                    <InlineEdit
                      proposalId={proposal.id}
                      fieldKey={field.key}
                      value={currentVal}
                      multiline={field.multiline}
                      onSaved={(v) => handleSaved(field.key, v)}
                    />
                  </div>
                );
              })}
            </div>
          </div>
          <div className="mt-6 pt-6 border-t border-green-200">
            <h3 className="text-sm font-semibold text-green-900 mb-3">Visuais — gerar, selecionar e vincular campanhas</h3>
            <ProposalGraphicsPanel
              proposalId={proposal.id}
              companyId={companyId}
              companyName={company.company_name}
              sponsorLogoUrl={company.logo_url}
              campaignTitle={campaign?.title}
              strategyVariants={(proposal.strategy_variants ?? null) as StrategyVariant[] | null}
              compact
            />
          </div>
        </div>
      )}

      {/* The actual landing page — template-switched */}
      {activeTemplate === "premium" && (
        <ProposalLandingPage
          proposal={mergedProposal}
          company={company}
          campaign={campaign}
          approvedImages={approvedImages}
          adminMode={true}
        />
      )}
      {activeTemplate === "minimal" && (
        <LandingTemplateMinimal
          proposal={mergedProposal}
          company={company}
          campaign={campaign}
          approvedImages={approvedImages}
          adminMode={true}
        />
      )}
      {activeTemplate === "packages" && (
        <LandingTemplatePackages
          proposal={mergedProposal}
          company={company}
          campaign={campaign}
          approvedImages={approvedImages}
          adminMode={true}
        />
      )}
    </div>
  );
}
