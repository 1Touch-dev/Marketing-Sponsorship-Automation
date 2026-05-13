import { supabaseAdmin } from "@/lib/supabase/server";
import { notFound } from "next/navigation";
import { PageHeader } from "@/components/shared/page-header";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { StatusBadge } from "@/components/shared/status-badge";
import { formatDate } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import Link from "next/link";
import { ApprovalPanel } from "./approval-panel";
import { GenerateEmailPanel } from "./generate-email-panel";
import { DuplicateProposalButton } from "./duplicate-proposal-button";
import type { ProposalContent } from "@/types/database";

export const dynamic = "force-dynamic";

function Section({ title, body }: { title: string; body?: string | null }) {
  if (!body) return null;
  return (
    <div>
      <div className="font-medium text-sm">{title}</div>
      <p className="text-sm text-muted-foreground whitespace-pre-wrap mt-1">{body}</p>
    </div>
  );
}

export default async function ProposalDetailPage({ params }: { params: { id: string } }) {
  const sb = supabaseAdmin();
  const { data: proposal } = await sb
    .from("proposals")
    .select("*, companies(*)")
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

  const content = proposal.content as ProposalContent;
  const company = (proposal as { companies: { company_name: string } | null }).companies;

  const canSendOutreach = proposal.status === "approved";

  return (
    <>
      <PageHeader
        title={proposal.title}
        description={`${company?.company_name ?? "—"} · v${proposal.version} · last updated ${formatDate(proposal.updated_at)}`}
        actions={
          <div className="flex items-center gap-2">
            <DuplicateProposalButton proposalId={proposal.id} />
            <StatusBadge status={proposal.status} />
            <Button asChild variant="outline">
              <Link href={`/proposals/${proposal.id}/edit`}>Edit</Link>
            </Button>
          </div>
        }
      />

      {(proposal as { status_reason?: string | null }).status_reason && (
        <div className="mb-4 rounded-md border border-amber-200 bg-amber-50 px-4 py-2 text-sm text-amber-800">
          Status reason: {(proposal as { status_reason?: string | null }).status_reason}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-6">
          <Card>
            <CardHeader><CardTitle>Proposal content</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              <Section title="Executive summary" body={content?.executive_summary} />
              <Section title="Campaign rationale" body={content?.campaign_rationale} />
              <Section title="Sponsorship value" body={content?.sponsorship_value} />
              <Section title="Activation plan" body={content?.activation_plan} />
              {content?.deliverables?.length ? (
                <div>
                  <div className="font-medium text-sm">Deliverables</div>
                  <ul className="text-sm text-muted-foreground list-disc ml-5 mt-1">
                    {content.deliverables.map((d, i) => <li key={i}>{d}</li>)}
                  </ul>
                </div>
              ) : null}
              <Section title="Investment" body={content?.investment_note} />
              <Section title="Call to action" body={content?.cta} />
              {(proposal as { prompt_version?: string | null }).prompt_version && (
                <div className="text-xs text-muted-foreground border-t pt-2">
                  Prompt version: <span className="font-mono">{(proposal as { prompt_version?: string | null }).prompt_version}</span>
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        <div className="space-y-6">
          <ApprovalPanel proposalId={proposal.id} status={proposal.status} />

          {canSendOutreach ? (
            <GenerateEmailPanel proposalId={proposal.id} />
          ) : (
            <Card>
              <CardHeader><CardTitle>Outreach</CardTitle><CardDescription>Approve the proposal to draft an outreach email.</CardDescription></CardHeader>
            </Card>
          )}

          <Card>
            <CardHeader><CardTitle>Version history</CardTitle></CardHeader>
            <CardContent className="space-y-2 text-sm">
              {versions?.length ? versions.map((v) => (
                <div key={v.version} className="flex justify-between">
                  <div>v{v.version} <span className="text-muted-foreground">— {v.edit_reason ?? "—"}</span></div>
                  <div className="text-xs text-muted-foreground">{formatDate(v.created_at)}</div>
                </div>
              )) : <p className="text-muted-foreground">No versions yet.</p>}
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle>Review history</CardTitle></CardHeader>
            <CardContent className="space-y-2 text-sm">
              {approvals?.length ? approvals.map((a, i) => (
                <div key={i} className="rounded-md border p-2">
                  <div className="flex justify-between"><span className="font-medium">{a.decision}</span><span className="text-xs text-muted-foreground">{formatDate(a.created_at)}</span></div>
                  {a.comments ? <div className="text-xs text-muted-foreground mt-1">{a.comments}</div> : null}
                </div>
              )) : <p className="text-muted-foreground">No reviews yet.</p>}
            </CardContent>
          </Card>
        </div>
      </div>
    </>
  );
}
