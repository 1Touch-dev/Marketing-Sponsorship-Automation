import { supabaseAdmin } from "@/lib/supabase/server";
import { PageHeader } from "@/components/shared/page-header";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { ImageGenerationManager } from "./image-generation-manager";
import { ReplicateJerseyGenerator } from "@/components/proposals/replicate-jersey-generator";
import { Plus, Layers, ExternalLink, Shirt } from "lucide-react";

export const dynamic = "force-dynamic";

export default async function MediaGenerationPage() {
  const sb = supabaseAdmin();

  const [{ data: jobs }, { data: proposals }, { data: companies }] = await Promise.all([
    sb.from("image_generation_jobs" as "companies").select("*").order("created_at", { ascending: false }).limit(100),
    sb.from("proposals").select("id, title, status, companies(company_name)").in("status", ["approved", "draft", "under_review"]).order("updated_at", { ascending: false }).limit(50),
    sb.from("companies").select("id, company_name, logo_url").neq("status", "closed").order("company_name"),
  ]);

  const safeJobs = (jobs ?? []) as Array<Record<string, unknown>>;
  const counts = {
    pending: safeJobs.filter(j => j.status === "pending_approval").length,
    approved: safeJobs.filter(j => j.status === "approved").length,
    generating: safeJobs.filter(j => j.status === "generating").length,
    completed: safeJobs.filter(j => j.status === "completed").length,
    total: safeJobs.length,
  };

  return (
    <>
      <PageHeader
        title="AI Image Generation"
        description="DALL-E campaign creatives + Replicate FLUX LoRA jersey mockups"
        actions={
          <div className="flex gap-2">
            <Button asChild variant="outline" size="sm" className="gap-2">
              <Link href="/mockup-editor"><Layers className="h-3.5 w-3.5" /> Mockup Editor</Link>
            </Button>
          </div>
        }
      />

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 mb-6">
        {[
          { label: "Pending Approval", value: counts.pending, color: "amber" },
          { label: "Approved", value: counts.approved, color: "blue" },
          { label: "Generating", value: counts.generating, color: "purple" },
          { label: "Completed", value: counts.completed, color: "green" },
          { label: "Total Jobs", value: counts.total, color: "slate" },
        ].map(s => (
          <Card key={s.label} className="text-center">
            <CardContent className="pt-4 pb-3">
              <div className="text-2xl font-bold">{s.value}</div>
              <div className="text-xs text-muted-foreground mt-0.5">{s.label}</div>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center justify-between">
            <span>Image Generation Jobs</span>
            <div className="flex gap-2">
              <Button asChild size="sm" variant="outline" className="gap-1.5">
                <Link href="/mockup-editor"><ExternalLink className="h-3.5 w-3.5" /> Mockup Editor</Link>
              </Button>
            </div>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <ImageGenerationManager
            jobs={safeJobs}
            proposals={(proposals ?? []) as Array<Record<string, unknown>>}
            companies={(companies ?? []) as Array<Record<string, unknown>>}
          />
        </CardContent>
      </Card>

      {/* Replicate FLUX LoRA jersey mockup generator — standalone usage */}
      <Card className="mt-6">
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <Shirt className="h-4 w-4 text-green-600" />
            Mockup de Camisa — FLUX LoRA
            <span className="ml-auto text-xs font-normal text-green-700 bg-green-50 border border-green-200 px-2 py-0.5 rounded-full">Replicate</span>
          </CardTitle>
          <CardDescription className="text-xs">
            Gera mockups fotorrealistas da Camisa Coritiba 2026 Away (verde) com branding de patrocinador.
            Modelo treinado com fotos reais da coleção. Trigger: <code className="font-mono bg-slate-100 px-1 rounded">coritiba_jersey</code>
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ReplicateJerseyGenerator
            proposalId=""
            companyName="Patrocinador"
            campaignTitle="Geração Standalone"
          />
        </CardContent>
      </Card>
    </>
  );
}
