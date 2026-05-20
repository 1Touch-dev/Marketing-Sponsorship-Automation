import { supabaseAdmin } from "@/lib/supabase/server";
import { notFound } from "next/navigation";
import { ProposalLandingPage } from "@/components/proposals/proposal-landing-page";
import { PrintButton } from "./print-button";
import { ShareLinkDisplay } from "./share-link-display";
import type { ProposalContent } from "@/types/database";
import type { StrategyVariant, PricingTier, VisualPrompt, CompanyIntelligence } from "@/lib/ai/schemas";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";

export const dynamic = "force-dynamic";

export default async function ProposalViewPage({ params }: { params: { id: string } }) {
  const sb = supabaseAdmin();

  const { data: proposal } = await sb
    .from("proposals")
    .select("*, companies(*), campaigns(title, summary)")
    .eq("id", params.id)
    .maybeSingle();

  if (!proposal) notFound();

  // Fetch approved/completed images for this proposal
  const { data: imageJobs } = await (sb as any)
    .from("image_generation_jobs")
    .select("id, job_type, prompt, output_urls, selected_url, status")
    .eq("proposal_id", proposal.id)
    .in("status", ["completed", "approved"])
    .order("created_at", { ascending: false });

  const approvedImages: Array<{ url: string; job_type: string; prompt?: string }> = [];
  for (const job of (imageJobs ?? [])) {
    const selected = job.selected_url;
    if (selected) {
      approvedImages.push({ url: selected, job_type: job.job_type, prompt: job.prompt });
    } else {
      const urls: Array<{ url?: string }> = job.output_urls ?? [];
      for (const u of urls) {
        if (u?.url && !u.url.startsWith("data:")) {
          approvedImages.push({ url: u.url, job_type: job.job_type, prompt: job.prompt });
          break;
        }
      }
    }
  }

  type EnrichedProposal = typeof proposal & {
    companies: {
      company_name: string;
      industry?: string | null;
      website?: string | null;
      country?: string | null;
    } | null;
    campaigns: { title: string; summary?: string | null } | null;
    strategy_variants?: StrategyVariant[] | null;
    pricing_tiers?: PricingTier[] | null;
    visual_prompts?: VisualPrompt[] | null;
    intelligence?: CompanyIntelligence | null;
    share_token?: string | null;
  };

  const p = proposal as EnrichedProposal;
  const company = p.companies;

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Admin back-link bar */}
      <div className="sticky top-0 z-50 flex items-center justify-between bg-white border-b border-slate-200 px-4 py-2 print:hidden">
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

      <ProposalLandingPage
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
        }}
        campaign={p.campaigns}
        approvedImages={approvedImages}
        adminMode={true}
      />
    </div>
  );
}
