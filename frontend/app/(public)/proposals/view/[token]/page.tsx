import { supabaseAdmin } from "@/lib/supabase/server";
import { getTenantById } from "@/lib/tenants/current";
import { CORITIBA_TENANT_ID } from "@/lib/tenants/types";
import { notFound } from "next/navigation";
import { ProposalLandingPage } from "@/components/proposals/proposal-landing-page";
import type { ProposalContent } from "@/types/database";
import type { StrategyVariant, PricingTier, CompanyIntelligence } from "@/lib/ai/schemas";
import { fetchProposalImagesForLanding } from "@/lib/proposals/fetch-proposal-images";
import { PrintButton } from "@/app/proposals/[id]/view/print-button";
import { PhoneCall, Calendar, ThumbsUp } from "lucide-react";
import Image from "next/image";
import { LeadInterestForm } from "./lead-interest-form";
import { ProposalRoiSection } from "./roi-section";
import { getProposalRoiData } from "@/lib/proposals/roi";
import { FulfillmentSection } from "./fulfillment-section";
import { getProposalFulfillmentData } from "@/lib/proposals/fulfillment";
import { PdfDownloadButton } from "./pdf-download-button";
import { ViewTracker } from "./view-tracker";
import { ScrollProgressBar } from "./scroll-progress-bar";

export const dynamic = "force-dynamic";

/**
 * Public shareable proposal landing page.
 * Accessible via: /proposals/view/[token]
 * No authentication required — share_token acts as the access key.
 */
export default async function PublicProposalViewPage({
  params,
  searchParams,
}: {
  params: { token: string };
  searchParams?: { v?: string };
}) {
  const sb = supabaseAdmin();

  const { data: proposal } = await sb
    .from("proposals")
    .select("*, companies(*), campaigns(title, summary)")
    .eq("share_token", params.token)
    .maybeSingle();

  if (!proposal) notFound();

  if (proposal.status === "rejected") notFound();

  const tenantId = (proposal as { tenant_id: string }).tenant_id;
  const tenant = await getTenantById(tenantId);
  const isCoritiba = tenantId === CORITIBA_TENANT_ID;
  const clubName = tenant?.club_facts.short_name ?? tenant?.club_facts.club_name ?? "o clube";
  // Coritiba's known-good asset path — not trusting the DB's crest_url for
  // this tenant since migration 0047 seeded a mismatched extension (.svg,
  // no such file); other tenants use whatever they've actually configured.
  const crestUrl = isCoritiba ? "/brand/coritiba-crest.png" : (tenant?.branding.crest_url ?? null);

  // A/B variant — ?v=B triggers Variant B
  const variant = searchParams?.v === "B" ? "B" : "A";
  const ctaText = variant === "B" ? "Quero Saber Mais" : "Tenho Interesse";

  const approvedImages = await fetchProposalImagesForLanding(proposal.id);
  const roi = await getProposalRoiData(sb, {
    id: proposal.id,
    match_id: (proposal as unknown as { match_id?: string | null }).match_id,
    approved_at: proposal.approved_at,
    created_at: proposal.created_at,
  });
  const fulfillment = await getProposalFulfillmentData(sb, {
    id: proposal.id,
    match_id: (proposal as unknown as { match_id?: string | null }).match_id,
    approved_at: proposal.approved_at,
    created_at: proposal.created_at,
  });

  const { data: packages } = await sb
    .from("proposal_packages")
    .select("id, name, description, price_brl, benefits, inventory_items, sort_order")
    .eq("proposal_id", proposal.id)
    .eq("active", true)
    .order("sort_order", { ascending: true });

  type EnrichedProposal = typeof proposal & {
    companies: {
      company_name: string;
      industry?: string | null;
      website?: string | null;
      country?: string | null;
      logo_url?: string | null;
    } | null;
    campaigns: { title: string; summary?: string | null } | null;
    strategy_variants?: StrategyVariant[] | null;
    pricing_tiers?: PricingTier[] | null;
    intelligence?: CompanyIntelligence | null;
    share_token?: string | null;
  };

  const p = proposal as EnrichedProposal & { meeting_link?: string | null };
  const company = p.companies;

  return (
    <div className="min-h-screen w-full bg-white pb-24">
      <title>{p.title} — {company?.company_name ?? clubName}</title>
      <ViewTracker proposalId={p.id} token={params.token} variant={variant} />
      {/* ─── Minimal branded header — print:hidden ─── */}
      <div className="sticky top-0 z-[60] w-full bg-white/95 backdrop-blur-md border-b border-slate-100 px-6 py-3 print:hidden">
        <div className="max-w-5xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            {crestUrl && (
              <Image
                src={crestUrl}
                alt={clubName}
                width={30}
                height={32}
                className="object-contain"
              />
            )}
            <div>
              <div className="text-sm font-bold text-slate-800 tracking-tight">
                Proposta de Patrocínio
              </div>
              {company?.company_name && (
                <div className="text-xs text-slate-400 font-medium">
                  Preparado para {company.company_name}
                </div>
              )}
            </div>
          </div>
          <div className="flex items-center gap-2">
            {variant === "B" && (
              <span className="print:hidden inline-flex items-center rounded-full bg-indigo-100 text-indigo-700 text-[10px] font-semibold px-2 py-0.5 border border-indigo-200">
                Variant B
              </span>
            )}
            <PrintButton label="Salvar como PDF" />
          </div>
        </div>
      </div>
      <ScrollProgressBar />

      {/* ─── Main landing page content ─── */}
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
          logo_url: company?.logo_url,
        }}
        campaign={p.campaigns}
        approvedImages={approvedImages}
        adminMode={false}
        expiresAt={(p as unknown as { expires_at?: string | null }).expires_at ?? null}
        tenant={{
          isCoritiba,
          clubName,
          clubFullName: tenant?.club_facts.club_name ?? clubName,
          crestUrl,
          stadiumName: tenant?.club_facts.stadium_name,
          city: tenant?.club_facts.city,
          state: tenant?.club_facts.state,
        }}
        packages={(packages ?? []).map((p) => ({
          id: p.id,
          name: p.name,
          description: p.description,
          price_brl: p.price_brl,
          benefits: Array.isArray(p.benefits) ? p.benefits : [],
          inventory_items: (p.inventory_items as Record<string, unknown>[]) ?? [],
        }))}
      />

      {/* ─── Real-time ROI dashboard — only renders when real reach data exists ─── */}
      <ProposalRoiSection roi={roi} clubName={clubName} />
      <FulfillmentSection fulfillment={fulfillment} />

      {/* ─── Lead Capture Form — before sticky CTA ─── */}
      <LeadInterestForm proposalId={p.id} companyName={company?.company_name ?? ""} clubName={clubName} />

      {/* ─── Sponsor CTA strip — fixed at bottom ─── */}
      <div className="print:hidden fixed bottom-0 left-0 right-0 z-50 bg-gradient-to-r from-[#003300] via-[#006B3F] to-[#004d00] backdrop-blur-md border-t border-green-700/50 px-4 py-3.5 flex flex-wrap items-center justify-center gap-3 shadow-[0_-4px_30px_rgba(0,107,63,0.3)]">
        <span className="text-white/80 text-sm font-medium mr-2 hidden sm:inline">
          Interessado nesta proposta?
        </span>
        {isCoritiba ? (
          <>
            <a
              href="https://wa.me/5541999999999?text=Olá!%20Tenho%20interesse%20na%20proposta%20de%20patrocínio%20do%20Coritiba%20FC."
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 rounded-full bg-white text-[#006B3F] hover:bg-green-50 px-5 py-2.5 text-sm font-bold transition-all shadow-lg hover:shadow-xl hover:scale-[1.02]"
            >
              <ThumbsUp className="h-4 w-4" />
              {ctaText}
            </a>
            <a
              href="mailto:patrocinios@coritiba.com.br?subject=Interesse%20em%20Patrocínio%20Coritiba%20FC"
              className="inline-flex items-center gap-2 rounded-full bg-white/10 hover:bg-white/20 border border-white/25 text-white px-5 py-2.5 text-sm font-semibold transition-all hover:scale-[1.02]"
            >
              <PhoneCall className="h-4 w-4" />
              Falar com nossa equipe
            </a>
            <a
              href={p.meeting_link ?? `mailto:patrocinios@coritiba.com.br?subject=Reunião%20-%20${encodeURIComponent(p.title)}`}
              target={p.meeting_link ? "_blank" : undefined}
              rel={p.meeting_link ? "noopener noreferrer" : undefined}
              className="inline-flex items-center gap-2 rounded-full bg-white/10 hover:bg-white/20 border border-white/25 text-white px-5 py-2.5 text-sm font-semibold transition-all hover:scale-[1.02]"
            >
              <Calendar className="h-4 w-4" />
              Agendar Reunião
            </a>
          </>
        ) : (
          // No tenant-configured contact channel (phone/email) exists yet for
          // a non-Coritiba tenant — the lead capture form below is the real
          // channel; only surface a meeting link if one is actually set on
          // this proposal, rather than fabricating a contact address.
          p.meeting_link && (
            <a
              href={p.meeting_link}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 rounded-full bg-white text-[#006B3F] hover:bg-green-50 px-5 py-2.5 text-sm font-bold transition-all shadow-lg hover:shadow-xl hover:scale-[1.02]"
            >
              <Calendar className="h-4 w-4" />
              Agendar Reunião
            </a>
          )
        )}
        <PdfDownloadButton />
      </div>
    </div>
  );
}
