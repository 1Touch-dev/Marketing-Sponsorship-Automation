import { notFound } from "next/navigation";
import { supabaseAdmin } from "@/lib/supabase/server";
import { PageHeader } from "@/components/shared/page-header";
import { Button } from "@/components/ui/button";
import Link from "next/link";
import { ArrowLeft, Eye } from "lucide-react";
import { ProposalBlockEditor } from "./proposal-block-editor";

export const dynamic = "force-dynamic";

export default async function ProposalBlocksPage({ params }: { params: { id: string } }) {
  const sb = supabaseAdmin();
  const { data: proposal } = await sb.from("proposals")
    .select("*, companies(company_name, industry, logo_url), campaigns(title)")
    .eq("id", params.id)
    .maybeSingle();

  if (!proposal) return notFound();

  const content = (proposal.content ?? {}) as Record<string, unknown>;

  // Build initial sections from proposal content
  const builtInSections = [
    { id: "executive_summary", title: "Executive Summary", icon: "📋", content: content.executive_summary as string ?? content.summary as string ?? "" },
    { id: "company_intelligence", title: "Company Intelligence", icon: "🧠", content: content.company_intelligence as string ?? content.analysis as string ?? "" },
    { id: "sponsorship_strategy", title: "Sponsorship Strategy", icon: "🎯", content: content.sponsorship_strategy as string ?? content.strategy as string ?? "" },
    { id: "activation_plan", title: "Activation Plan", icon: "⚡", content: content.activation_plan as string ?? content.activations as string ?? "" },
    { id: "deliverables", title: "Deliverables & Benefits", icon: "📦", content: content.deliverables as string ?? "" },
    { id: "pricing_table", title: "Pricing & Investment", icon: "💰", content: content.pricing_table as string ?? content.pricing as string ?? "" },
    { id: "about_coritiba", title: "About Coritiba FC", icon: "🏆", content: content.about_coritiba as string ?? "" },
    { id: "next_steps", title: "Next Steps & CTA", icon: "🚀", content: content.next_steps as string ?? content.cta as string ?? "" },
  ].filter(s => s.content);

  const company = proposal.companies as Record<string, string> | null;

  return (
    <>
      <PageHeader
        title="Block Editor"
        description={`Modular editing — ${company?.company_name ?? "Proposal"}`}
        actions={
          <div className="flex gap-2">
            <Button variant="outline" size="sm" asChild className="gap-1.5">
              <Link href={`/proposals/${params.id}`}><ArrowLeft className="h-3.5 w-3.5" /> Back</Link>
            </Button>
            <Button variant="outline" size="sm" asChild className="gap-1.5">
              <Link href={`/proposals/${params.id}/view`} target="_blank"><Eye className="h-3.5 w-3.5" /> Preview</Link>
            </Button>
          </div>
        }
      />
      <ProposalBlockEditor
        proposalId={params.id}
        initialSections={builtInSections}
        companyName={company?.company_name ?? ""}
        industry={company?.industry ?? ""}
        campaignTitle={(proposal.campaigns as Record<string,string> | null)?.title ?? ""}
        proposalTitle={proposal.title ?? ""}
      />
    </>
  );
}
