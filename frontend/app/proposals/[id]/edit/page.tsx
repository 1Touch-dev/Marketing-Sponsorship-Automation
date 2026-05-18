import { supabaseAdmin } from "@/lib/supabase/server";
import { notFound } from "next/navigation";
import { PageHeader } from "@/components/shared/page-header";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { ProposalEditor } from "./proposal-editor";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import type { ProposalContent } from "@/types/database";
import { formatDate } from "@/lib/utils";
import { ArrowLeft, Edit3 } from "lucide-react";

export const dynamic = "force-dynamic";

export default async function ProposalEditPage({ params }: { params: { id: string } }) {
  const sb = supabaseAdmin();

  const [{ data: proposal }, { data: versions }] = await Promise.all([
    sb
      .from("proposals")
      .select("*, companies(company_name, industry), campaigns(title)")
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
    companies: { company_name: string; industry: string | null } | null;
    campaigns: { title: string } | null;
  };

  return (
    <>
      <PageHeader
        title={`Edit: ${proposal.title}`}
        description={`${p.companies?.company_name ?? ""} · v${proposal.version} · ${formatDate(proposal.updated_at)}`}
        actions={
          <Button asChild variant="outline" size="sm" className="gap-2">
            <Link href={`/proposals/${proposal.id}`}>
              <ArrowLeft className="h-3.5 w-3.5" /> Back to proposal
            </Link>
          </Button>
        }
      />

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Edit3 className="h-4 w-4 text-primary" />
            Edit proposal content
          </CardTitle>
          <CardDescription>
            Edit any section directly, or use{" "}
            <span className="font-medium text-foreground">Generate A / B / C options</span>{" "}
            to get AI-written alternatives to choose from. Version history is preserved on every save.
            {p.companies?.company_name && (
              <> Sponsor: <strong>{p.companies.company_name}</strong></>
            )}
            {p.companies?.industry && <> · {p.companies.industry}</>}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ProposalEditor
            id={proposal.id}
            initialTitle={proposal.title}
            initialContent={proposal.content as ProposalContent}
            proposalStatus={proposal.status}
            versions={versions ?? []}
            companyName={p.companies?.company_name}
            industry={p.companies?.industry ?? undefined}
            campaignTitle={p.campaigns?.title}
          />
        </CardContent>
      </Card>
    </>
  );
}
