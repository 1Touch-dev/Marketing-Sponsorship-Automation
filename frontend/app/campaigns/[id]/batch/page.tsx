import { supabaseAdmin } from "@/lib/supabase/server";
import { PageHeader } from "@/components/shared/page-header";
import { notFound } from "next/navigation";
import { Button } from "@/components/ui/button";
import Link from "next/link";
import { ArrowLeft, ShieldAlert } from "lucide-react";
import { OutreachBatchRunner } from "./outreach-batch-runner";

export const dynamic = "force-dynamic";

export default async function CampaignBatchPage({ params }: { params: { id: string } }) {
  const sb = supabaseAdmin();
  const { data: campaign } = await sb
    .from("campaigns")
    .select("id, title, is_preapproved, companies(company_name, industry)")
    .eq("id", params.id)
    .maybeSingle();

  if (!campaign) notFound();

  const company = (campaign as unknown as {
    companies: { company_name: string; industry: string | null } | null;
  }).companies;

  return (
    <>
      <PageHeader
        title={`Outreach Agent Batch — ${campaign.title}`}
        description="Auto-run the Outreach Agent across many companies for this pre-approved campaign."
        actions={
          <Button variant="outline" asChild>
            <Link href={`/campaigns/${campaign.id}`}><ArrowLeft className="h-4 w-4 mr-1" /> Back to Campaign</Link>
          </Button>
        }
      />

      {!campaign.is_preapproved ? (
        <div className="flex flex-col items-center justify-center rounded-xl border-2 border-dashed border-amber-300 bg-amber-50 dark:bg-amber-950/20 py-16 text-center gap-3">
          <ShieldAlert className="h-10 w-10 text-amber-500" />
          <p className="font-medium text-amber-800 dark:text-amber-300">This campaign is not pre-approved</p>
          <p className="text-sm text-amber-700 dark:text-amber-400 max-w-md">
            Mark this campaign as pre-approved from the campaign page before launching an auto-run batch —
            this confirms a human has signed off on the underlying strategy/template for this industry.
          </p>
          <Button asChild size="sm" className="mt-1">
            <Link href={`/campaigns/${campaign.id}`}>Go to campaign</Link>
          </Button>
        </div>
      ) : (
        <OutreachBatchRunner
          campaignId={campaign.id}
          campaignTitle={campaign.title}
          defaultIndustry={company?.industry ?? ""}
        />
      )}
    </>
  );
}
