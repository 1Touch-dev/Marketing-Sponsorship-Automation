import { supabaseAdmin } from "@/lib/supabase/server";
import { notFound } from "next/navigation";
import { PageHeader } from "@/components/shared/page-header";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { StatusBadge } from "@/components/shared/status-badge";
import { formatDate } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import Link from "next/link";
import { ApprovalPanel } from "./approval-panel";
import { ApprovalFlowPanel } from "./approval-flow-panel";
import { GenerateEmailPanel } from "./generate-email-panel";
import { DuplicateProposalButton } from "./duplicate-proposal-button";
import { ProposalLandingPage } from "@/components/proposals/proposal-landing-page";
import { ProposalShareButton } from "./proposal-share-button";
import { EnhanceProposalButton } from "./enhance-proposal-button";
import { ExecutionBriefPanel } from "@/components/proposals/execution-brief-panel";
import { CampaignImageGenerator } from "@/components/proposals/campaign-image-generator";
import { ApprovalRoleGate, SalesRoleGate } from "./role-gates";
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

  // Fetch approved/completed images for the flow panel and inline preview
  const { data: imageJobs } = await (sb as any)
    .from("image_generation_jobs")
    .select("id, status, job_type, prompt, output_urls, selected_url")
    .eq("proposal_id", proposal.id)
    .in("status", ["completed", "approved"])
    .order("created_at", { ascending: false });
  const hasImages = Array.isArray(imageJobs) && imageJobs.length > 0;

  // Build a flat list of preview image URLs for inline display
  const inlineImages: Array<{ url: string; job_type?: string; prompt?: string }> = [];
  for (const job of (imageJobs ?? [])) {
    const selected = job.selected_url;
    if (selected) {
      inlineImages.push({ url: selected, job_type: job.job_type, prompt: job.prompt });
    } else {
      const urls: Array<{ url?: string }> = job.output_urls ?? [];
      for (const u of urls) {
        if (u?.url && !u.url.startsWith("data:")) {
          inlineImages.push({ url: u.url, job_type: job.job_type, prompt: job.prompt });
          break;
        }
      }
    }
  }

  type EnrichedProposal = typeof proposal & {
    companies: { company_name: string; industry?: string | null; website?: string | null; country?: string | null; notes?: string | null } | null;
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
            <DuplicateProposalButton proposalId={proposal.id} />
            {p.share_token ? (
              <Button asChild variant="outline" size="sm">
                <Link href={`/proposals/${proposal.id}/view`} target="_blank">
                  Landing Page ↗
                </Link>
              </Button>
            ) : null}
            <EnhanceProposalButton proposalId={proposal.id} hasIntelligence={hasIntelligenceLayer} />
            <ProposalShareButton proposalId={proposal.id} shareToken={p.share_token ?? null} />
            <StatusBadge status={proposal.status} />
            <Button asChild variant="outline">
              <Link href={`/proposals/${proposal.id}/edit`}>Edit</Link>
            </Button>
          </div>
        }
      />

      {p.status_reason && (
        <div className="mb-4 rounded-md border border-amber-200 bg-amber-50 px-4 py-2 text-sm text-amber-800">
          Status reason: {p.status_reason}
        </div>
      )}

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
                <span className="text-lg">🎨</span> Imagens de Campanha
                <span className="ml-auto text-xs font-normal text-indigo-600 bg-indigo-50 px-2 py-0.5 rounded-full">AI</span>
              </CardTitle>
              <CardDescription className="text-xs">Gera criativos visuais para cada estratégia de campanha. Aparecem na proposta e landing page.</CardDescription>
            </CardHeader>
            <CardContent>
              <CampaignImageGenerator
                proposalId={proposal.id}
                companyName={p.companies?.company_name ?? ""}
                strategyVariants={p.strategy_variants}
                campaignTitle={p.campaigns?.title}
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
