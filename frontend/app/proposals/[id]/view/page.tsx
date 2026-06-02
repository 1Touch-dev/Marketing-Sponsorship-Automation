import { supabaseAdmin } from "@/lib/supabase/server";
import { notFound } from "next/navigation";
import { ProposalCMSEditor } from "@/components/proposals/proposal-cms-editor";
import { PrintButton } from "./print-button";
import { ShareLinkDisplay } from "./share-link-display";
import type { ProposalContent } from "@/types/database";
import type { StrategyVariant, PricingTier, CompanyIntelligence } from "@/lib/ai/schemas";
import { fetchProposalImagesForLanding } from "@/lib/proposals/fetch-proposal-images";
import Link from "next/link";
import { ArrowLeft, PhoneCall, Calendar, ThumbsUp } from "lucide-react";

export const dynamic = "force-dynamic";

export default async function ProposalViewPage({ params }: { params: { id: string } }) {
  const sb = supabaseAdmin();

  const { data: proposal } = await sb
    .from("proposals")
    .select("*, companies(id, company_name, industry, website, country, logo_url), campaigns(title, summary)")
    .eq("id", params.id)
    .maybeSingle();

  if (!proposal) notFound();

  const approvedImages = await fetchProposalImagesForLanding(proposal.id);

  type EnrichedProposal = typeof proposal & {
    companies: {
      company_name: string;
      industry?: string | null;
      website?: string | null;
      country?: string | null;
      logo_url?: string | null;
      id?: string;
    } | null;
    campaigns: { title: string; summary?: string | null } | null;
    strategy_variants?: StrategyVariant[] | null;
    pricing_tiers?: PricingTier[] | null;
    visual_prompts?: unknown[] | null;
    intelligence?: CompanyIntelligence | null;
    share_token?: string | null;
  };

  const p = proposal as EnrichedProposal;
  const company = p.companies;

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Admin controls bar — print:hidden so it never shows on PDF */}
      <div className="sticky top-0 z-[60] flex items-center justify-between bg-white/95 backdrop-blur border-b border-slate-200 px-4 py-2 print:hidden">
        <Link
          href={`/proposals/${proposal.id}`}
          className="flex items-center gap-1.5 text-sm text-slate-600 hover:text-slate-900 transition-colors"
        >
          <ArrowLeft className="h-4 w-4" />
          Voltar para proposta
        </Link>
        <div className="flex items-center gap-2">
          <ShareLinkDisplay proposalId={proposal.id} shareToken={p.share_token ?? null} />
          <PrintButton proposalId={proposal.id} exportType="pdf_print" />
        </div>
      </div>

      {/* CMS editor wraps the landing page — edit mode toggle is inside */}
      <ProposalCMSEditor
        proposal={{
          id: p.id,
          title: p.title,
          status: p.status,
          version: p.version,
          created_at: p.created_at,
          content: p.content as ProposalContent,
          strategy_variants: p.strategy_variants,
          pricing_tiers: p.pricing_tiers,
          visual_prompts: p.visual_prompts,
          intelligence: p.intelligence,
          share_token: p.share_token,
        }}
        company={{
          company_name: company?.company_name ?? "",
          industry: company?.industry,
          website: company?.website,
          country: company?.country,
          logo_url: company?.logo_url,
        }}
        campaign={p.campaigns}
        approvedImages={approvedImages}
        companyId={company?.id as string | undefined}
      />

      {/* Sponsor CTA strip — fixed at bottom so sponsor always sees a call to action */}
      <div className="print:hidden fixed bottom-0 left-0 right-0 z-50 bg-green-900/95 backdrop-blur border-t border-green-700 px-4 py-3 flex flex-wrap items-center justify-center gap-3 shadow-2xl">
        <span className="text-white/80 text-sm font-medium mr-2">
          Interessado nesta proposta?
        </span>
        <a
          href="https://wa.me/5541999999999?text=Olá!%20Tenho%20interesse%20na%20proposta%20de%20patrocínio%20do%20Coritiba%20FC."
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-2 rounded-xl bg-green-500 hover:bg-green-400 text-white px-4 py-2 text-sm font-semibold transition-all shadow"
        >
          <ThumbsUp className="h-4 w-4" />
          Tenho Interesse
        </a>
        <a
          href="mailto:patrocinios@coritiba.com.br?subject=Interesse%20em%20Patrocínio%20Coritiba%20FC"
          className="inline-flex items-center gap-2 rounded-xl bg-white/10 hover:bg-white/20 border border-white/20 text-white px-4 py-2 text-sm font-semibold transition-all"
        >
          <PhoneCall className="h-4 w-4" />
          Falar com nossa equipe
        </a>
        <a
          href="https://calendly.com/coritiba-patrocinios"
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-2 rounded-xl bg-white/10 hover:bg-white/20 border border-white/20 text-white px-4 py-2 text-sm font-semibold transition-all"
        >
          <Calendar className="h-4 w-4" />
          Agendar Reunião
        </a>
      </div>
      {/* Spacer so content is not hidden behind CTA strip */}
      <div className="h-16 print:hidden" />
    </div>
  );
}
