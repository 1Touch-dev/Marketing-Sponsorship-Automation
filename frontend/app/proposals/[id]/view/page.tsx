import { supabaseAdmin } from "@/lib/supabase/server";
import { notFound } from "next/navigation";
import { ProposalCMSEditor } from "@/components/proposals/proposal-cms-editor";
import { PrintButton } from "./print-button";
import { ShareLinkDisplay } from "./share-link-display";
import type { ProposalContent } from "@/types/database";
import type { StrategyVariant, PricingTier, CompanyIntelligence } from "@/lib/ai/schemas";
import { fetchProposalImagesForLanding } from "@/lib/proposals/fetch-proposal-images";
import Link from "next/link";
import { ArrowLeft, PhoneCall, Calendar, ThumbsUp, Shield } from "lucide-react";

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
    <div className="min-h-screen bg-white pb-24">
      {/* ─── Admin controls bar — print:hidden, sticky ─── */}
      <div className="sticky top-0 z-[60] print:hidden">
        <div className="flex items-center justify-between bg-slate-900/95 backdrop-blur-md border-b border-slate-700/50 px-5 py-2.5">
          <div className="flex items-center gap-3">
            <Link
              href={`/proposals/${proposal.id}`}
              className="flex items-center gap-1.5 text-sm text-slate-300 hover:text-white transition-colors"
            >
              <ArrowLeft className="h-4 w-4" />
              <span className="hidden sm:inline">Voltar para proposta</span>
            </Link>
            <div className="hidden sm:block h-4 w-px bg-slate-700" />
            <div className="flex items-center gap-1.5 text-xs text-slate-400">
              <Shield className="h-3 w-3" />
              <span>Modo Interno</span>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <ShareLinkDisplay proposalId={proposal.id} shareToken={p.share_token ?? null} />
            <PrintButton proposalId={proposal.id} exportType="pdf_print" />
          </div>
        </div>
      </div>

      {/* ─── Main content: CMS editor wraps the professional landing page ─── */}
      <div className="w-full">
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
      </div>

      {/* ─── Sponsor CTA strip — fixed at bottom ─── */}
      <div className="print:hidden fixed bottom-0 left-0 right-0 z-50 bg-gradient-to-r from-[#003A2D] via-[#005742] to-[#00412F] backdrop-blur-md border-t border-green-700/50 px-4 py-3.5 flex flex-wrap items-center justify-center gap-3 shadow-[0_-4px_30px_rgba(0,107,63,0.3)]">
        <span className="text-white/80 text-sm font-medium mr-2 hidden sm:inline">
          Interessado nesta proposta?
        </span>
        <a
          href="https://wa.me/5541999999999?text=Olá!%20Tenho%20interesse%20na%20proposta%20de%20patrocínio%20do%20Coritiba%20FC."
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-2 rounded-full bg-white text-[#005742] hover:bg-green-50 px-5 py-2.5 text-sm font-bold transition-all shadow-lg hover:shadow-xl hover:scale-[1.02]"
        >
          <ThumbsUp className="h-4 w-4" />
          Tenho Interesse
        </a>
        <a
          href="mailto:patrocinios@coritiba.com.br?subject=Interesse%20em%20Patrocínio%20Coritiba%20FC"
          className="inline-flex items-center gap-2 rounded-full bg-white/10 hover:bg-white/20 border border-white/25 text-white px-5 py-2.5 text-sm font-semibold transition-all hover:scale-[1.02]"
        >
          <PhoneCall className="h-4 w-4" />
          Falar com nossa equipe
        </a>
        <a
          href="https://calendly.com/coritiba-patrocinios"
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-2 rounded-full bg-white/10 hover:bg-white/20 border border-white/25 text-white px-5 py-2.5 text-sm font-semibold transition-all hover:scale-[1.02]"
        >
          <Calendar className="h-4 w-4" />
          Agendar Reunião
        </a>
      </div>
    </div>
  );
}
