import { supabaseAdmin } from "@/lib/supabase/server";
import { notFound } from "next/navigation";
import { PageHeader } from "@/components/shared/page-header";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { StatusBadge } from "@/components/shared/status-badge";
import { formatDate } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Upload, Edit3, ArrowLeft } from "lucide-react";
import Link from "next/link";
import { ApprovalPanel } from "./approval-panel";
import { ApprovalFlowPanel } from "./approval-flow-panel";
import { GenerateEmailPanel } from "./generate-email-panel";
import { DuplicateProposalButton } from "./duplicate-proposal-button";
import { ProposalLandingPage } from "@/components/proposals/proposal-landing-page";
import { ProposalShareButton } from "./proposal-share-button";
import { EnhanceProposalButton } from "./enhance-proposal-button";
import { ExecutionBriefPanel } from "@/components/proposals/execution-brief-panel";
import { ProposalGraphicsPanel } from "@/components/proposals/proposal-graphics-panel";
import { fetchProposalImagesForLanding } from "@/lib/proposals/fetch-proposal-images";
import { AssetUploader } from "@/components/proposals/asset-uploader";
import { ApprovalRoleGate, SalesRoleGate } from "./role-gates";
import { ProposalPackages } from "@/components/proposals/proposal-packages";
import type { ProposalContent } from "@/types/database";
import type { StrategyVariant, PricingTier, VisualPrompt, CompanyIntelligence, ExecutionBrief } from "@/lib/ai/schemas";

export const dynamic = "force-dynamic";

export default async function ProposalDetailPage({ params }: { params: { id: string } }) {
  const sb = supabaseAdmin();
  const { data: proposal } = await sb
    .from("proposals")
    .select("*, companies(*), campaigns(title, summary)")
    .eq("id", params.id)
    .maybeSingle();
  if (!proposal) notFound();

  const { data: versions } = await sb
    .from("proposal_versions")
    .select("version, edit_reason, created_at")
    .eq("proposal_id", proposal.id)
    .order("version", { ascending: false });

  const { data: approvals } = await sb
    .from("approvals")
    .select("decision, comments, created_at")
    .eq("proposal_id", proposal.id)
    .order("created_at", { ascending: false });

  const inlineImages = await fetchProposalImagesForLanding(proposal.id);
  const hasImages = inlineImages.length > 0;

  type EnrichedProposal = typeof proposal & {
    companies: { company_name: string; industry?: string | null; website?: string | null; country?: string | null; notes?: string | null; logo_url?: string | null } | null;
    campaigns: { title: string; summary?: string | null } | null;
    status_reason?: string | null;
    prompt_version?: string | null;
    strategy_variants?: StrategyVariant[] | null;
    pricing_tiers?: PricingTier[] | null;
    visual_prompts?: VisualPrompt[] | null;
    intelligence?: CompanyIntelligence | null;
    share_token?: string | null;
  };

  const p = proposal as EnrichedProposal;

  // Determine if sponsor logo is available (from company or uploaded assets)
  const uploadedAssets = ((proposal.content as unknown as { uploaded_assets?: Array<{ url: string }> })?.uploaded_assets) ?? [];
  const hasLogo = !!(
    p.companies?.logo_url ||
    uploadedAssets.length > 0
  );
  const company = p.companies;
  const campaign = p.campaigns;
  const canSendOutreach = proposal.status === "approved";

  const hasIntelligenceLayer = !!(
    p.strategy_variants?.length ||
    p.pricing_tiers?.length ||
    p.visual_prompts?.length ||
    p.intelligence
  );

  return (
    <>
      <PageHeader
        title={proposal.title}
        description={`${company?.company_name ?? "—"} · v${proposal.version} · last updated ${formatDate(proposal.updated_at)}`}
        actions={
          <div className="flex items-center gap-2 flex-wrap">
            <Button asChild variant="ghost" size="sm" className="gap-1.5">
              <Link href="/proposals">
                <ArrowLeft className="h-3.5 w-3.5" /> All
              </Link>
            </Button>
            <DuplicateProposalButton proposalId={proposal.id} />
            <Button asChild variant="outline" size="sm">
              <Link href={`/proposals/${proposal.id}/view`} target="_blank">
                Landing Page ↗
              </Link>
            </Button>
            <EnhanceProposalButton proposalId={proposal.id} hasIntelligence={hasIntelligenceLayer} />
            <ProposalShareButton proposalId={proposal.id} shareToken={p.share_token ?? null} />
            <Button asChild size="sm" className="gap-1.5">
              <Link href={`/proposals/${proposal.id}/edit`}>
                <Edit3 className="h-3.5 w-3.5" /> Edit
              </Link>
            </Button>
            <StatusBadge status={proposal.status} />
          </div>
        }
      />

      {/* Logo upload warning — shown when no logo is present */}
      {!hasLogo && (
        <div className="mb-4 rounded-md border border-yellow-200 bg-yellow-50 dark:bg-yellow-950/20 dark:border-yellow-800 px-4 py-3 flex items-start justify-between gap-4 flex-wrap">
          <div>
            <p className="text-sm font-semibold text-yellow-800 dark:text-yellow-300">
              ⚠️ No sponsor logo uploaded
            </p>
            <p className="text-xs text-yellow-700 dark:text-yellow-400 mt-0.5">
              The landing page will show initials only, and image generation is locked. Upload the sponsor&apos;s logo in the Brand Assets section to unlock all features.
            </p>
          </div>
          <Button asChild size="sm" variant="outline" className="shrink-0 border-yellow-300 text-yellow-800 hover:bg-yellow-100">
            <Link href={`/proposals/${proposal.id}#brand-assets`}>
              Upload Logo ↓
            </Link>
          </Button>
        </div>
      )}

      {/* Status banners for actionable states */}
      {proposal.status === "revision_requested" && (
        <div className="mb-4 rounded-md border border-amber-200 bg-amber-50 dark:bg-amber-950/20 dark:border-amber-800 px-4 py-3 flex items-center justify-between gap-4">
          <p className="text-sm font-medium text-amber-800 dark:text-amber-300">
            ✏️ Revision requested — please edit the proposal and re-submit for review.
          </p>
          <Button asChild size="sm" className="gap-1.5 shrink-0">
            <Link href={`/proposals/${proposal.id}/edit`}>
              <Edit3 className="h-3.5 w-3.5" /> Edit now
            </Link>
          </Button>
        </div>
      )}

      {proposal.status === "rejected" && (
        <div className="mb-4 rounded-md border border-red-200 bg-red-50 dark:bg-red-950/20 dark:border-red-800 px-4 py-3 flex items-center justify-between gap-4">
          <p className="text-sm font-medium text-red-700 dark:text-red-300">
            ❌ This proposal was rejected. You can still edit it and re-submit.
          </p>
          <Button asChild size="sm" variant="outline" className="gap-1.5 shrink-0">
            <Link href={`/proposals/${proposal.id}/edit`}>
              <Edit3 className="h-3.5 w-3.5" /> Edit &amp; Re-submit
            </Link>
          </Button>
        </div>
      )}

      {p.status_reason && proposal.status !== "revision_requested" && proposal.status !== "rejected" && (
        <div className="mb-4 rounded-md border border-amber-200 bg-amber-50 px-4 py-2 text-sm text-amber-800">
          Status reason: {p.status_reason}
        </div>
      )}

      {/* Completeness check */}
      {(() => {
        const c = (p.content ?? {}) as Record<string, unknown>;
        const missing = ["executive_summary", "campaign_rationale", "activation_plan", "deliverables", "investment_note"]
          .filter(k => !c[k] || (Array.isArray(c[k]) && (c[k] as unknown[]).length === 0) || (typeof c[k] === "string" && (c[k] as string).length < 20));
        return missing.length > 0 ? (
          <div className="mb-4 rounded-md border border-orange-200 bg-orange-50 px-4 py-3 flex items-center justify-between gap-4 flex-wrap">
            <p className="text-sm text-orange-700">
              ⚠️ Proposta incompleta — seções faltando: <strong>{missing.join(", ")}</strong>.
            </p>
            <div className="flex gap-2">
              <EnhanceProposalButton proposalId={proposal.id} hasIntelligence={!!p.intelligence} />
              <Button asChild size="sm" variant="outline">
                <Link href={`/proposals/${proposal.id}/edit`}>Editar manualmente</Link>
              </Button>
            </div>
          </div>
        ) : null;
      })()}

      {/* Premium Landing Page Presentation */}
      {hasIntelligenceLayer ? (
        <div className="mb-8">
          <div className="mb-4 flex items-center justify-between">
            <div>
              <h2 className="text-lg font-semibold">Apresentação Premium</h2>
              <p className="text-sm text-muted-foreground">Landing page completa com estratégias, preços e visuais</p>
            </div>
            <Button asChild variant="outline" size="sm">
              <Link href={`/proposals/${proposal.id}/view`} target="_blank">
                Abrir em tela cheia ↗
              </Link>
            </Button>
          </div>
          <div className="rounded-xl border border-slate-200 overflow-hidden">
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
              campaign={campaign}
              adminMode={true}
            />
          </div>
        </div>
      ) : (
        /* Classic view for proposals without intelligence layer */
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-8">
          <div className="lg:col-span-2 space-y-6">
            <Card>
              <CardHeader><CardTitle>Proposal Content</CardTitle></CardHeader>
              <CardContent className="space-y-4">
                {renderSection("Executive summary", (p.content as unknown as Record<string, string>)?.executive_summary)}
                {renderSection("Campaign rationale", (p.content as unknown as Record<string, string>)?.campaign_rationale)}
                {renderSection("Sponsorship value", (p.content as unknown as Record<string, string>)?.sponsorship_value)}
                {renderSection("Activation plan", (p.content as unknown as Record<string, string>)?.activation_plan)}
                {((p.content as unknown as { deliverables?: string[] })?.deliverables ?? []).length > 0 && (
                  <div>
                    <div className="font-medium text-sm">Deliverables</div>
                    <ul className="text-sm text-muted-foreground list-disc ml-5 mt-1">
                      {((p.content as unknown as { deliverables: string[] }).deliverables).map((d: string, i: number) => (
                        <li key={i}>{d}</li>
                      ))}
                    </ul>
                  </div>
                )}
                {renderSection("Investment", (p.content as unknown as Record<string, string>)?.investment_note)}
                {renderSection("Call to action", (p.content as unknown as Record<string, string>)?.cta)}
                {p.prompt_version && (
                  <div className="text-xs text-muted-foreground border-t pt-2">
                    Prompt version: <span className="font-mono">{p.prompt_version}</span>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </div>
      )}

      {/* Admin sidebar */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="space-y-6">
          {/* Guided approval flow — shows where you are and next step */}
          <ApprovalFlowPanel
            proposalId={proposal.id}
            proposalStatus={proposal.status}
            shareToken={p.share_token ?? null}
            hasImages={hasImages}
            hasLogo={hasLogo}
          />

          {/* Inline image preview — shown at step 4 so you can review before going live */}
          {inlineImages.length > 0 && (
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2">
                  <span className="text-lg">🖼️</span> Generated Images
                  <span className="ml-auto text-xs font-normal text-muted-foreground">{inlineImages.length} image{inlineImages.length !== 1 ? "s" : ""}</span>
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {inlineImages.map((img, idx) => (
                  <div key={idx} className="rounded-lg overflow-hidden border border-slate-200">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={img.url}
                      alt={img.prompt ?? `Generated visual ${idx + 1}`}
                      className="w-full object-cover"
                      style={{ maxHeight: 220 }}
                    />
                    {img.job_type && (
                      <div className="px-3 py-1.5 bg-slate-50 border-t text-xs text-slate-500 capitalize">
                        {img.job_type.replace(/_/g, " ")}
                      </div>
                    )}
                  </div>
                ))}
                <a
                  href="/media-generation"
                  className="block text-center text-xs text-indigo-600 hover:text-indigo-800 underline"
                >
                  Manage in Media Generation →
                </a>
              </CardContent>
            </Card>
          )}

          <ApprovalRoleGate>
            <ApprovalPanel proposalId={proposal.id} status={proposal.status} />
          </ApprovalRoleGate>

          {/* Execution brief — internal use only, not shown on landing page */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <span className="text-lg">📋</span> Execution Brief
                <span className="ml-auto text-xs font-normal text-amber-600 bg-amber-50 px-2 py-0.5 rounded-full">Interno</span>
              </CardTitle>
              <CardDescription className="text-xs">Estimativas de tempo, recursos e custo por estratégia. Não aparece na proposta pública.</CardDescription>
            </CardHeader>
            <CardContent>
              <ExecutionBriefPanel
                proposalId={proposal.id}
                initialBrief={(p.content as unknown as { execution_brief?: ExecutionBrief })?.execution_brief ?? null}
              />
            </CardContent>
          </Card>

          {canSendOutreach ? (
            <ApprovalRoleGate>
              <GenerateEmailPanel proposalId={proposal.id} />
            </ApprovalRoleGate>
          ) : (
            <Card>
              <CardHeader>
                <CardTitle>Outreach</CardTitle>
                <CardDescription>Approve the proposal to draft an outreach email.</CardDescription>
              </CardHeader>
            </Card>
          )}

          {/* Campaign image generator — creates creative visuals per strategy */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <span className="text-lg">🖼</span> Visuais da proposta
              </CardTitle>
              <CardDescription className="text-xs">
                Mockup de camisa, criativos de campanha, seleção de imagem e vínculo a estratégias — aparece na landing do patrocinador.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <ProposalGraphicsPanel
                proposalId={proposal.id}
                companyId={p.companies?.id}
                companyName={p.companies?.company_name ?? ""}
                sponsorLogoUrl={p.companies?.logo_url}
                campaignTitle={p.campaigns?.title}
                strategyVariants={(p.strategy_variants ?? null) as StrategyVariant[] | null}
              />
            </CardContent>
          </Card>

          {/* Brand asset uploader */}
          <Card id="brand-assets">
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <Upload className="h-4 w-4 text-primary" /> Brand Assets
              </CardTitle>
              <CardDescription>Upload logos and brand assets for use in image generation and the proposal.</CardDescription>
            </CardHeader>
            <CardContent>
              <AssetUploader
                proposalId={proposal.id}
                existingAssets={((p.content as unknown as { uploaded_assets?: Array<{ url: string; name: string; path: string }> })?.uploaded_assets) ?? []}
              />
            </CardContent>
          </Card>
        </div>

        <div className="space-y-6">
          <Card>
            <CardHeader><CardTitle>Version History</CardTitle></CardHeader>
            <CardContent className="space-y-2 text-sm">
              {versions?.length
                ? versions.map((v) => (
                    <div key={v.version} className="flex justify-between">
                      <div>
                        v{v.version}{" "}
                        <span className="text-muted-foreground">— {v.edit_reason ?? "—"}</span>
                      </div>
                      <div className="text-xs text-muted-foreground">{formatDate(v.created_at)}</div>
                    </div>
                  ))
                : <p className="text-muted-foreground">No versions yet.</p>}
            </CardContent>
          </Card>
        </div>

        <div className="space-y-6">
          <Card>
            <CardHeader><CardTitle>Review History</CardTitle></CardHeader>
            <CardContent className="space-y-2 text-sm">
              {approvals?.length
                ? approvals.map((a, i) => (
                    <div key={i} className="rounded-md border p-2">
                      <div className="flex justify-between">
                        <span className="font-medium">{a.decision}</span>
                        <span className="text-xs text-muted-foreground">{formatDate(a.created_at)}</span>
                      </div>
                      {a.comments ? (
                        <div className="text-xs text-muted-foreground mt-1">{a.comments}</div>
                      ) : null}
                    </div>
                  ))
                : <p className="text-muted-foreground">No reviews yet.</p>}
            </CardContent>
          </Card>

          {p.prompt_version && (
            <Card>
              <CardHeader><CardTitle>Generation Details</CardTitle></CardHeader>
              <CardContent className="text-xs text-muted-foreground space-y-1">
                <div>Prompt version: <span className="font-mono">{p.prompt_version}</span></div>
                <div className="flex gap-2 flex-wrap mt-2">
                  {p.strategy_variants?.length ? (
                    <span className="rounded-full bg-blue-100 text-blue-700 px-2 py-0.5 text-xs">
                      {p.strategy_variants.length} strategies
                    </span>
                  ) : null}
                  {p.pricing_tiers?.length ? (
                    <span className="rounded-full bg-green-100 text-green-700 px-2 py-0.5 text-xs">
                      {p.pricing_tiers.length} pricing tiers
                    </span>
                  ) : null}
                  {p.visual_prompts?.length ? (
                    <span className="rounded-full bg-purple-100 text-purple-700 px-2 py-0.5 text-xs">
                      {p.visual_prompts.length} visual prompts
                    </span>
                  ) : null}
                  {p.intelligence ? (
                    <span className="rounded-full bg-amber-100 text-amber-700 px-2 py-0.5 text-xs">
                      Intelligence
                    </span>
                  ) : null}
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      </div>

      {/* Sponsorship Packages */}
      <Card className="mt-6">
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            💼 Pacotes de Patrocínio
          </CardTitle>
          <CardDescription>
            Defina níveis de patrocínio (Prata, Ouro, Diamante) com preços e benefícios distintos para apresentar ao patrocinador.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ProposalPackages proposalId={proposal.id} />
        </CardContent>
      </Card>
    </>
  );
}

function renderSection(title: string, body?: string | null) {
  if (!body) return null;
  return (
    <div>
      <div className="font-medium text-sm">{title}</div>
      <p className="text-sm text-muted-foreground whitespace-pre-wrap mt-1">{body}</p>
    </div>
  );
}
