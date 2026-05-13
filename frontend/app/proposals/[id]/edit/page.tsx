import { supabaseAdmin } from "@/lib/supabase/server";
import { notFound } from "next/navigation";
import { PageHeader } from "@/components/shared/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ProposalEditor } from "./proposal-editor";
import type { ProposalContent } from "@/types/database";

export const dynamic = "force-dynamic";

export default async function ProposalEditPage({ params }: { params: { id: string } }) {
  const sb = supabaseAdmin();
  const { data: proposal } = await sb
    .from("proposals")
    .select("*")
    .eq("id", params.id)
    .maybeSingle();
  if (!proposal) notFound();

  return (
    <>
      <PageHeader title={`Edit: ${proposal.title}`} description={`Current version v${proposal.version}`} />
      <Card>
        <CardHeader><CardTitle>Edit proposal</CardTitle></CardHeader>
        <CardContent>
          <ProposalEditor
            id={proposal.id}
            initialTitle={proposal.title}
            initialContent={proposal.content as ProposalContent}
          />
        </CardContent>
      </Card>
    </>
  );
}
