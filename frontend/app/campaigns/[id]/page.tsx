import { supabaseAdmin } from "@/lib/supabase/server";
import { PageHeader } from "@/components/shared/page-header";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { StatusBadge } from "@/components/shared/status-badge";
import { notFound } from "next/navigation";
import { GenerateProposalButton } from "./generate-proposal-button";
import { DuplicateCampaignButton } from "./duplicate-campaign-button";
import { CampaignInventoryTable } from "@/components/campaigns/campaign-inventory-table";
import Link from "next/link";
import { formatDate } from "@/lib/utils";
import {
  Lightbulb, Target, Zap, MessageSquare, Trophy,
  FileText, ArrowLeft, Tag, Users, Building2,
} from "lucide-react";

export const dynamic = "force-dynamic";

const STRATEGY_KEYWORDS: Record<string, { label: string; color: string }> = {
  awareness: { label: "Awareness", color: "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300" },
  engagement: { label: "Fan Engagement", color: "bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300" },
  community: { label: "Community", color: "bg-orange-100 text-orange-700 dark:bg-orange-900/40 dark:text-orange-300" },
  premium: { label: "Premium Partnership", color: "bg-purple-100 text-purple-700 dark:bg-purple-900/40 dark:text-purple-300" },
  digital: { label: "Digital / Social", color: "bg-sky-100 text-sky-700 dark:bg-sky-900/40 dark:text-sky-300" },
  stadium: { label: "Stadium Activation", color: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300" },
  loyalty: { label: "Loyalty Strategy", color: "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300" },
  sustainability: { label: "Sustainability", color: "bg-teal-100 text-teal-700 dark:bg-teal-900/40 dark:text-teal-300" },
  product: { label: "Product-Led", color: "bg-pink-100 text-pink-700 dark:bg-pink-900/40 dark:text-pink-300" },
};

function detectTags(title: string, summary: string | null): string[] {
  const text = (title + " " + (summary ?? "")).toLowerCase();
  return Object.keys(STRATEGY_KEYWORDS).filter((k) => text.includes(k)).slice(0, 3);
}

export default async function CampaignDetailPage({ params }: { params: { id: string } }) {
  const sb = supabaseAdmin();
  const { data: campaign } = await sb
    .from("campaigns")
    .select("*, companies(company_name, industry, country)")
    .eq("id", params.id)
    .maybeSingle();
  if (!campaign) notFound();

  const { data: proposals } = await sb
    .from("proposals")
    .select("id, title, status, version, updated_at")
    .eq("campaign_id", campaign.id)
    .order("updated_at", { ascending: false });

  const company = (campaign as {
    companies: { company_name: string; industry: string | null; country: string | null } | null;
  }).companies;

  const tags = detectTags(campaign.title, campaign.summary);

  return (
    <>
      <PageHeader
        title={campaign.title}
        description={`${company?.company_name ?? ""}${company?.industry ? " · " + company.industry : ""} · Coritiba FC Sponsorship Strategy`}
        actions={
          <div className="flex items-center gap-2">
            <Link
              href="/campaigns"
              className="inline-flex items-center gap-1 rounded-md border px-3 py-1.5 text-sm hover:bg-accent transition-colors"
            >
              <ArrowLeft className="h-3.5 w-3.5" /> Back
            </Link>
            <DuplicateCampaignButton campaignId={campaign.id} />
            <StatusBadge status={campaign.status} />
          </div>
        }
      />

      {/* Strategy tags */}
      {tags.length > 0 && (
        <div className="flex flex-wrap gap-2 mb-5">
          {tags.map((tag) => (
            <span
              key={tag}
              className={`inline-flex items-center gap-1 text-xs font-medium px-2.5 py-1 rounded-full ${STRATEGY_KEYWORDS[tag].color}`}
            >
              <Tag className="h-3 w-3" />
              {STRATEGY_KEYWORDS[tag].label}
            </span>
          ))}
          <span className="inline-flex items-center gap-1 text-xs font-medium px-2.5 py-1 rounded-full bg-green-50 text-green-700 dark:bg-green-900/30 dark:text-green-300">
            <Trophy className="h-3 w-3" /> Coritiba FC
          </span>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Main content */}
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Lightbulb className="h-4 w-4 text-primary" />
              Campaign strategy overview
            </CardTitle>
            <CardDescription>
              AI-generated Coritiba FC sponsorship campaign for {company?.company_name ?? "this company"}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-5 text-sm">
            {/* Company context strip */}
            <div className="flex flex-wrap gap-3 p-3 rounded-lg bg-muted/50 border text-xs">
              <span className="flex items-center gap-1.5 text-muted-foreground">
                <Building2 className="h-3.5 w-3.5" />
                <strong className="text-foreground">{company?.company_name ?? "—"}</strong>
              </span>
              {company?.industry && (
                <span className="flex items-center gap-1.5 text-muted-foreground">
                  <Tag className="h-3 w-3" /> {company.industry}
                </span>
              )}
              {company?.country && (
                <span className="text-muted-foreground">{company.country}</span>
              )}
              <span className="flex items-center gap-1.5 text-muted-foreground ml-auto">
                <Trophy className="h-3.5 w-3.5 text-green-600" />
                <span className="text-green-600 font-semibold">Coritiba FC × Couto Pereira</span>
              </span>
            </div>

            {campaign.summary && (
              <div>
                <div className="flex items-center gap-2 font-semibold mb-2">
                  <Target className="h-4 w-4 text-blue-500" /> Campaign concept
                </div>
                <p className="text-muted-foreground whitespace-pre-wrap leading-relaxed bg-muted/30 rounded-lg p-3">
                  {campaign.summary}
                </p>
              </div>
            )}

            {campaign.activation && (
              <div>
                <div className="flex items-center gap-2 font-semibold mb-2">
                  <Zap className="h-4 w-4 text-amber-500" /> Activation plan at Couto Pereira
                </div>
                <p className="text-muted-foreground whitespace-pre-wrap leading-relaxed bg-muted/30 rounded-lg p-3">
                  {campaign.activation}
                </p>
              </div>
            )}

            {campaign.description && (
              <div>
                <div className="flex items-center gap-2 font-semibold mb-2">
                  <Users className="h-4 w-4 text-purple-500" /> Partnership angle
                </div>
                <p className="text-muted-foreground whitespace-pre-wrap leading-relaxed bg-muted/30 rounded-lg p-3">
                  {campaign.description}
                </p>
              </div>
            )}

            {campaign.cta && (
              <div>
                <div className="flex items-center gap-2 font-semibold mb-2">
                  <MessageSquare className="h-4 w-4 text-green-500" /> Call to action
                </div>
                <p className="text-muted-foreground italic bg-green-50 dark:bg-green-900/20 rounded-lg p-3 border border-green-200 dark:border-green-800">
                  &ldquo;{campaign.cta}&rdquo;
                </p>
              </div>
            )}

            {campaign.prompt_version && (
              <div className="text-xs text-muted-foreground border-t pt-3 flex items-center gap-2">
                <span>Prompt version:</span>
                <span className="font-mono bg-muted px-1.5 py-0.5 rounded">{campaign.prompt_version}</span>
                <span className="text-muted-foreground/60">·</span>
                <span>Created {formatDate(campaign.created_at)}</span>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Action panel */}
        <div className="space-y-4">
          {/* Generate proposal CTA */}
          <Card className="border-primary/30 bg-gradient-to-b from-primary/5 to-transparent">
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <FileText className="h-4 w-4 text-primary" />
                Generate proposal from this strategy
              </CardTitle>
              <CardDescription>
                Transform this Coritiba FC campaign into a full sponsorship proposal with pricing tiers, visuals, and intelligence.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <GenerateProposalButton campaignId={campaign.id} />
              <div className="text-xs text-muted-foreground">
                AI generates a complete proposal using Coritiba FC context, Couto Pereira inventory, and company-specific intelligence.
              </div>
            </CardContent>
          </Card>

          {/* Existing proposals */}
          {proposals && proposals.length > 0 && (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm">Proposals from this strategy</CardTitle>
              </CardHeader>
              <CardContent>
                <ul className="space-y-2">
                  {proposals.map((p) => (
                    <li key={p.id}>
                      <Link
                        href={`/proposals/${p.id}`}
                        className="flex items-center justify-between rounded-md border p-2.5 text-sm hover:bg-accent hover:border-primary/30 transition-all"
                      >
                        <div className="min-w-0">
                          <div className="font-medium text-xs truncate">v{p.version} · {p.title}</div>
                          <div className="text-xs text-muted-foreground">{formatDate(p.updated_at)}</div>
                        </div>
                        <StatusBadge status={p.status} />
                      </Link>
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          )}
        </div>
      </div>

      {/* Inventory table — full width below the two-column layout */}
      <Card className="mt-6">
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            💰 Pacote de Inventário
          </CardTitle>
          <CardDescription>
            Monte o pacote de patrocínio com itens de estádio, digital e ativação. Ajuste preços e quantidades antes de gerar a proposta.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <CampaignInventoryTable campaignId={campaign.id} />
        </CardContent>
      </Card>
    </>
  );
}
