import { supabaseAdmin } from "@/lib/supabase/server";
import { PageHeader } from "@/components/shared/page-header";
import { Button } from "@/components/ui/button";
import Link from "next/link";
import { Plus } from "lucide-react";
import { AssetLibraryClient, type Asset } from "./asset-library-client";

export const dynamic = "force-dynamic";

export default async function AssetsPage() {
  const sb = supabaseAdmin();

  const [{ data: jobs }, { data: proposals }, { data: companies }] = await Promise.all([
    sb.from("image_generation_jobs" as "companies")
      .select("id, job_type, status, prompt, image_url, proposal_id, company_id, created_at, metadata")
      .order("created_at", { ascending: false })
      .limit(200),
    sb.from("proposals").select("id, title").limit(100),
    sb.from("companies").select("id, company_name").neq("status", "closed").limit(100),
  ]);

  const statusCounts: Record<string, number> = {};
  for (const j of (jobs ?? []) as Array<Record<string,string>>) {
    statusCounts[j.status] = (statusCounts[j.status] ?? 0) + 1;
  }

  return (
    <>
      <PageHeader
        title="Asset Library"
        description="Media governance — approval workflow, versioning, relationships"
        actions={
          <Button size="sm" asChild className="gap-1.5">
            <Link href="/media-generation"><Plus className="h-3.5 w-3.5" /> New Asset</Link>
          </Button>
        }
      />

      {/* Stats bar */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 mb-6">
        {[
          { label: "Total Assets", value: (jobs ?? []).length, color: "bg-slate-500" },
          { label: "Approved", value: statusCounts.completed ?? 0, color: "bg-green-500" },
          { label: "Pending Approval", value: statusCounts.pending_approval ?? 0, color: "bg-amber-500" },
          { label: "Generating", value: statusCounts.generating ?? 0, color: "bg-blue-500" },
          { label: "Archived", value: statusCounts.archived ?? 0, color: "bg-muted-foreground" },
        ].map(stat => (
          <div key={stat.label} className="rounded-xl border bg-card p-4">
            <div className={`text-2xl font-bold`}>{stat.value}</div>
            <div className="text-xs text-muted-foreground mt-1 flex items-center gap-1.5">
              <span className={`h-1.5 w-1.5 rounded-full ${stat.color}`} />
              {stat.label}
            </div>
          </div>
        ))}
      </div>

      <AssetLibraryClient
        assets={(jobs ?? []) as unknown as Asset[]}
        proposals={(proposals ?? []) as Array<{ id: string; title: string }>}
        companies={(companies ?? []) as Array<{ id: string; company_name: string }>}
      />
    </>
  );
}
