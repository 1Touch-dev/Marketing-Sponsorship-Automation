import { supabaseAdmin } from "@/lib/supabase/server";
import { PageHeader } from "@/components/shared/page-header";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { CrmSyncManager } from "./crm-sync-manager";
import { GitMerge, CheckCircle, Clock, AlertCircle } from "lucide-react";

export const dynamic = "force-dynamic";

export default async function CrmSyncPage() {
  const sb = supabaseAdmin();

  const { data: queue } = await sb
    .from("crm_sync_queue" as "companies")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(200);

  const safeQueue = (queue ?? []) as Array<Record<string, unknown>>;
  const stats = safeQueue.reduce((acc: Record<string, number>, row) => {
    const s = row.status as string;
    acc[s] = (acc[s] ?? 0) + 1;
    return acc;
  }, {});

  const hasPipedrive = false; // Would be: !!process.env.PIPEDRIVE_API_KEY (not accessible server-side like this)

  return (
    <>
      <PageHeader
        title="CRM Sync"
        description="Pipedrive integration — sync abstraction layer"
      />

      {/* Status banner */}
      <div className={`rounded-xl border p-4 mb-6 flex items-start gap-3 ${hasPipedrive ? "bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-800" : "bg-amber-50 dark:bg-amber-900/20 border-amber-200 dark:border-amber-800"}`}>
        {hasPipedrive
          ? <CheckCircle className="h-5 w-5 text-green-600 mt-0.5 flex-shrink-0" />
          : <AlertCircle className="h-5 w-5 text-amber-600 mt-0.5 flex-shrink-0" />
        }
        <div>
          <div className={`font-semibold text-sm ${hasPipedrive ? "text-green-700 dark:text-green-300" : "text-amber-700 dark:text-amber-300"}`}>
            {hasPipedrive ? "Pipedrive Connected" : "Pipedrive Not Configured"}
          </div>
          <div className={`text-xs mt-0.5 ${hasPipedrive ? "text-green-600 dark:text-green-400" : "text-amber-600 dark:text-amber-400"}`}>
            {hasPipedrive
              ? "Live sync active — all operations are synced to Pipedrive in real time."
              : "Add PIPEDRIVE_API_KEY to your .env to enable live sync. All operations are queued and ready for when credentials are provided."
            }
          </div>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
        {[
          { label: "Pending", value: stats.pending ?? 0, icon: Clock, color: "amber" },
          { label: "Synced", value: stats.synced ?? 0, icon: CheckCircle, color: "green" },
          { label: "Failed", value: stats.failed ?? 0, icon: AlertCircle, color: "red" },
          { label: "Total", value: safeQueue.length, icon: GitMerge, color: "slate" },
        ].map(s => (
          <Card key={s.label}>
            <CardContent className="pt-4 pb-3 flex items-center gap-3">
              <s.icon className={`h-5 w-5 flex-shrink-0 ${s.color === "amber" ? "text-amber-500" : s.color === "green" ? "text-green-500" : s.color === "red" ? "text-red-500" : "text-muted-foreground"}`} />
              <div>
                <div className="text-xl font-bold">{s.value}</div>
                <div className="text-xs text-muted-foreground">{s.label}</div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Architecture Card */}
      <Card className="mb-6">
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><GitMerge className="h-4 w-4" /> Pipedrive Integration Architecture</CardTitle>
          <CardDescription>Mappings ready — plug in credentials to activate</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
            {[
              { from: "Company", to: "Pipedrive Organization", status: "ready" },
              { from: "Pipeline Lead", to: "Pipedrive Deal", status: "ready" },
              { from: "Proposal", to: "Pipedrive Deal + Note", status: "ready" },
              { from: "Campaign", to: "Pipedrive Activity", status: "ready" },
              { from: "Contact", to: "Pipedrive Person", status: "ready" },
              { from: "Proposal Status", to: "Pipedrive Stage", status: "ready" },
            ].map(m => (
              <div key={m.from} className="flex items-center gap-2 text-xs">
                <CheckCircle className="h-3.5 w-3.5 text-green-500 flex-shrink-0" />
                <span className="font-medium">{m.from}</span>
                <span className="text-muted-foreground">→</span>
                <span>{m.to}</span>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Sync Queue</CardTitle>
          <CardDescription>All pending and historical sync operations</CardDescription>
        </CardHeader>
        <CardContent>
          <CrmSyncManager queue={safeQueue} />
        </CardContent>
      </Card>
    </>
  );
}
