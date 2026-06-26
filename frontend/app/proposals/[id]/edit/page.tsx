import { supabaseAdmin } from "@/lib/supabase/server";
import { notFound } from "next/navigation";
import { PageHeader } from "@/components/shared/page-header";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { ProposalEditor } from "./proposal-editor";
import { ProposalGraphicsPanel } from "@/components/proposals/proposal-graphics-panel";
import type { StrategyVariant } from "@/lib/ai/schemas";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import type { ProposalContent } from "@/types/database";
import { formatDate } from "@/lib/utils";
import { ArrowLeft, Edit3, Eye, Clock, Building2, Layers, FileText, Image as ImageIcon, CalendarClock } from "lucide-react";
import { ExpiryDateField } from "./expiry-date-field";

export const dynamic = "force-dynamic";

export default async function ProposalEditPage({ params }: { params: { id: string } }) {
  const sb = supabaseAdmin();

  const [{ data: proposal }, { data: versions }] = await Promise.all([
    sb
      .from("proposals")
      .select("*, companies(id, company_name, industry, logo_url), campaigns(title), strategy_variants, expires_at")
      .eq("id", params.id)
      .maybeSingle(),
    sb
      .from("proposal_versions")
      .select("version, edit_reason, created_at")
      .eq("proposal_id", params.id)
      .order("version", { ascending: false })
      .limit(10),
  ]);

  if (!proposal) notFound();

  const p = proposal as typeof proposal & {
    companies: { id: string; company_name: string; industry: string | null; logo_url?: string | null } | null;
    campaigns: { title: string } | null;
    strategy_variants?: StrategyVariant[] | null;
    expires_at?: string | null;
  };

  const content = proposal.content as Record<string, unknown> | null;
  const deliverables = Array.isArray(content?.deliverables) ? (content!.deliverables as string[]) : [];
  const hasDeliverables = deliverables.length > 0;

  return (
    <>
      <PageHeader
        title={`Edit: ${proposal.title}`}
        description={`${p.companies?.company_name ?? ""} · v${proposal.version} · ${formatDate(proposal.updated_at)}`}
        actions={
          <div className="flex items-center gap-2">
            <Button asChild variant="outline" size="sm" className="gap-2">
              <Link href={`/proposals/${proposal.id}`}>
                <Eye className="h-3.5 w-3.5" /> View proposal
              </Link>
            </Button>
            <Button asChild variant="ghost" size="sm" className="gap-2">
              <Link href={`/proposals`}>
                <ArrowLeft className="h-3.5 w-3.5" /> All proposals
              </Link>
            </Button>
          </div>
        }
      />

      {/* Compact metadata bar */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
        <div className="rounded-xl border bg-white dark:bg-slate-900 p-3 flex items-center gap-2.5">
          <Building2 className="h-4 w-4 text-slate-400 flex-shrink-0" />
          <div className="min-w-0">
            <p className="text-[10px] text-muted-foreground uppercase tracking-wide">Company</p>
            <p className="text-sm font-medium truncate">{p.companies?.company_name ?? "—"}</p>
          </div>
        </div>
        <div className="rounded-xl border bg-white dark:bg-slate-900 p-3 flex items-center gap-2.5">
          <Layers className="h-4 w-4 text-slate-400 flex-shrink-0" />
          <div className="min-w-0">
            <p className="text-[10px] text-muted-foreground uppercase tracking-wide">Campaign</p>
            <p className="text-sm font-medium truncate">{p.campaigns?.title ?? "—"}</p>
          </div>
        </div>
        <div className="rounded-xl border bg-white dark:bg-slate-900 p-3 flex items-center gap-2.5">
          <Clock className="h-4 w-4 text-slate-400 flex-shrink-0" />
          <div className="min-w-0">
            <p className="text-[10px] text-muted-foreground uppercase tracking-wide">Version</p>
            <p className="text-sm font-medium">v{proposal.version} · {versions?.length ?? 0} history entries</p>
          </div>
        </div>
        <div className="rounded-xl border bg-white dark:bg-slate-900 p-3 flex items-center gap-2.5">
          <FileText className="h-4 w-4 text-slate-400 flex-shrink-0" />
          <div className="min-w-0">
            <p className="text-[10px] text-muted-foreground uppercase tracking-wide">Deliverables</p>
            <p className={`text-sm font-medium ${hasDeliverables ? "text-green-600" : "text-amber-600"}`}>
              {hasDeliverables ? `${deliverables.length} items` : "⚠ Missing"}
            </p>
          </div>
        </div>
      </div>

      {/* Missing deliverables warning */}
      {!hasDeliverables && (
        <div className="mb-4 rounded-xl border border-amber-200 bg-amber-50 dark:bg-amber-900/20 dark:border-amber-700/50 px-4 py-3 text-sm text-amber-800 dark:text-amber-300 flex items-start gap-2">
          <span className="text-base leading-none mt-0.5">⚠️</span>
          <div>
            <strong>Deliverables section is empty.</strong> Use the AI backfill tool at{" "}
            <code className="text-xs bg-amber-100 dark:bg-amber-900/40 px-1 py-0.5 rounded">/api/proposals/backfill-deliverables?dry_run=true</code>{" "}
            to generate them, or add deliverables manually below.
          </div>
        </div>
      )}

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <CalendarClock className="h-4 w-4 text-amber-500" />
            Data de Validade da Proposta
          </CardTitle>
          <CardDescription>
            Defina uma data limite para esta proposta. Um badge de urgência será exibido na landing page pública.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ExpiryDateField proposalId={proposal.id} initialValue={p.expires_at} />
        </CardContent>
      </Card>

      <Card className="mt-5">
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <Edit3 className="h-4 w-4 text-primary" />
            Proposal content
          </CardTitle>
          <CardDescription>
            Edit any section, or use <span className="font-medium text-foreground">Generate A / B / C options</span> for AI-written alternatives.
            Version history is preserved on every save.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ProposalEditor
            id={proposal.id}
            initialTitle={proposal.title}
            initialContent={proposal.content as ProposalContent}
            initialMeetingLink={(proposal as unknown as { meeting_link?: string | null }).meeting_link}
            proposalStatus={proposal.status}
            versions={versions ?? []}
            companyName={p.companies?.company_name}
            industry={p.companies?.industry ?? undefined}
            campaignTitle={p.campaigns?.title}
          />
        </CardContent>
      </Card>

      <Card className="mt-5">
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <ImageIcon className="h-4 w-4 text-primary" />
            Proposal visuals
          </CardTitle>
          <CardDescription>
            Jersey mockup, creatives and image selection — generate assets directly from here.
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
    </>
  );
}
