import { supabaseAdmin } from "@/lib/supabase/server";
import { PageHeader } from "@/components/shared/page-header";
import { notFound } from "next/navigation";
import { Button } from "@/components/ui/button";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { TemplateDetailEditor } from "./template-detail-editor";
import type { PlaceholderConfig } from "@/lib/presentations/placeholder-parser";

export const dynamic = "force-dynamic";

export default async function TemplateDetailPage({ params }: { params: { id: string } }) {
  const sb = supabaseAdmin();
  const { data: template } = await sb
    .from("proposal_templates")
    .select("*")
    .eq("id", params.id)
    .maybeSingle();

  if (!template) notFound();

  return (
    <>
      <PageHeader
        title={template.name}
        description={template.description ?? "HTML presentation template — configure placeholders and render."}
        actions={
          <Button variant="outline" asChild>
            <Link href="/settings/proposal-templates"><ArrowLeft className="h-4 w-4 mr-1" /> Back</Link>
          </Button>
        }
      />
      <TemplateDetailEditor
        templateId={template.id}
        templateName={template.name}
        htmlUrl={template.html_url ?? null}
        initialPlaceholders={(template.placeholder_config as PlaceholderConfig[]) ?? []}
      />
    </>
  );
}
