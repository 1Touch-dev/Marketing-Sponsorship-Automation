import { supabaseAdmin } from "@/lib/supabase/server";
import { PageHeader } from "@/components/shared/page-header";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { StatusBadge } from "@/components/shared/status-badge";
import { notFound } from "next/navigation";
import { GenerateProposalButton } from "./generate-proposal-button";
import { DuplicateCampaignButton } from "./duplicate-campaign-button";

export const dynamic = "force-dynamic";

export default async function CampaignDetailPage({ params }: { params: { id: string } }) {
  const sb = supabaseAdmin();
  const { data: campaign } = await sb
    .from("campaigns")
    .select("*, companies(company_name, industry)")
    .eq("id", params.id)
    .maybeSingle();
  if (!campaign) notFound();

  const { data: proposals } = await sb
    .from("proposals")
    .select("id, title, status, version, updated_at")
    .eq("campaign_id", campaign.id)
    .order("updated_at", { ascending: false });

  const company = (campaign as { companies: { company_name: string; industry: string | null } | null }).companies;

  return (
    <>
      <PageHeader
        title={campaign.title}
        description={`${company?.company_name ?? ""}${company?.industry ? " · " + company.industry : ""}`}
        actions={
          <div className="flex items-center gap-2">
            <DuplicateCampaignButton campaignId={campaign.id} />
            <StatusBadge status={campaign.status} />
          </div>
        }
      />

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <Card className="lg:col-span-2">
          <CardHeader><CardTitle>Idea details</CardTitle></CardHeader>
          <CardContent className="space-y-4 text-sm">
            {campaign.summary ? (<div><div className="font-medium">Summary</div><p className="text-muted-foreground whitespace-pre-wrap">{campaign.summary}</p></div>) : null}
            {campaign.activation ? (<div><div className="font-medium">Activation</div><p className="text-muted-foreground whitespace-pre-wrap">{campaign.activation}</p></div>) : null}
            {campaign.description ? (<div><div className="font-medium">Partnership angle</div><p className="text-muted-foreground whitespace-pre-wrap">{campaign.description}</p></div>) : null}
            {campaign.cta ? (<div><div className="font-medium">CTA</div><p className="text-muted-foreground whitespace-pre-wrap">{campaign.cta}</p></div>) : null}
            {campaign.prompt_version && (
              <div className="text-xs text-muted-foreground border-t pt-2">
                Prompt version: <span className="font-mono">{campaign.prompt_version}</span>
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle>Next step</CardTitle><CardDescription>Turn this idea into a proposal.</CardDescription></CardHeader>
          <CardContent className="space-y-3">
            <GenerateProposalButton campaignId={campaign.id} />
            <div className="text-xs text-muted-foreground">Generation calls Claude on Bedrock and stores an editable proposal draft.</div>
            <div className="pt-2 border-t">
              <div className="text-xs font-medium mb-2">Existing proposals</div>
              {proposals && proposals.length > 0 ? (
                <ul className="space-y-1.5 text-sm">
                  {proposals.map((p) => (
                    <li key={p.id} className="flex justify-between">
                      <a href={`/proposals/${p.id}`} className="hover:underline truncate mr-2">v{p.version} · {p.title}</a>
                      <StatusBadge status={p.status} />
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-xs text-muted-foreground">No proposals yet.</p>
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    </>
  );
}
