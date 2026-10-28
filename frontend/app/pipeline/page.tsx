import { supabaseAdmin } from "@/lib/supabase/server";
import { resolveTenantId } from "@/lib/tenants/current";
import { PageHeader } from "@/components/shared/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { TrendingUp, DollarSign, Plus, Activity, CheckCircle, Target, ArrowRight } from "lucide-react";
import { HygieneCheckPanel } from "./hygiene-check-panel";
import { PipelineBoard } from "./pipeline-board";
import { ConnectionBanner, ConnectionHeadline } from "@/components/integrations/connection-banner";
import { pipedriveConnection } from "@/lib/pipedrive/status";
import { PIPELINE_BOARD_STAGES } from "@/lib/pipeline/stages";

export const dynamic = "force-dynamic";

const STAGES = PIPELINE_BOARD_STAGES.map((s) => ({ ...s }));

export default async function PipelinePage() {
  const sb = supabaseAdmin();
  const tenantId = await resolveTenantId();
  const connection = await pipedriveConnection(sb, tenantId, { check: true });

  // Use companies table with pipeline_stage — no separate table needed
  // Found live-testing 2026-09-17 (building the Pipeline Hygiene Agent,
  // Phase 8): this query previously selected "estimated_value", a column
  // that doesn't exist anywhere on `companies` — Supabase returned an
  // error, `companiesRaw` came back undefined, and the whole page silently
  // rendered as if there were zero companies in every stage (540 real
  // companies hidden), with no error surfaced anywhere. No `estimated_value`
  // equivalent exists in the schema for any table upstream of a signed
  // contract (`contracts.total_value_brl` is the first real money figure
  // in the data model) — so this is corrected to not fabricate one,
  // rather than papering over the gap.
  // Found live-testing the 2026-09-23 Kanban rebuild: 6 companies had
  // status="competitor" and/or pipeline_stage="competitor" (one row had
  // only the latter — status had drifted to "prospect" while pipeline_stage
  // stayed "competitor", so a single .neq("status", ...) check missed it).
  // "competitor" isn't one of the 10 stage keys below, so all 6 were
  // silently invisible in every column while still counting toward "Active
  // Leads" (a stat/render mismatch, same class as the dashboard bugs found
  // earlier this project). All are rival clubs tracked for competitive
  // intel, not real sponsorship leads — excluded on either field now,
  // rather than given their own column, since a competitor isn't a deal
  // moving through this funnel.
  const { data: companiesRaw, error: companiesError } = await sb
    .from("companies")
    .select("id, company_name, industry, status, pipeline_stage, updated_at")
    .eq("tenant_id", tenantId)
    .not("pipeline_stage", "is", null)
    .neq("status", "competitor")
    .neq("pipeline_stage", "competitor")
    .order("updated_at", { ascending: false });

  if (companiesError) {
    console.error("[pipeline] failed to load companies", companiesError.message);
  }

  type PipelineCompany = {
    id: string;
    company_name: string;
    industry?: string | null;
    status?: string | null;
    pipeline_stage?: string | null;
    updated_at?: string | null;
  };

  const companies = (companiesRaw ?? []) as PipelineCompany[];

  const stageGroups = STAGES.reduce<Record<string, PipelineCompany[]>>((acc, s) => {
    acc[s.key] = companies.filter((c) => c.pipeline_stage === s.key);
    return acc;
  }, {});

  const activeLeads = companies.filter((c) => !["closed_won", "closed_lost"].includes(c.pipeline_stage ?? ""));
  const migrationNeeded = false;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Sales Pipeline"
        description="Lead tracking for Coritiba FC sponsorship deals"
        actions={
          <div className="flex flex-wrap gap-2">
            <Badge variant="outline" className={`text-xs ${connection.tone === "ok" ? "border-green-300 text-green-700" : connection.tone === "bad" ? "border-red-300 text-red-700" : connection.tone === "warn" ? "border-amber-300 text-amber-700" : ""}`}>
              <ConnectionHeadline facts={connection} />
            </Badge>
            <Button size="sm">
              <Plus className="h-4 w-4 mr-1" />
              Add Lead
            </Button>
          </div>
        }
      />

      {migrationNeeded && null}

      <HygieneCheckPanel />

      {/* The same connection record /crm-sync and /system show */}
      <ConnectionBanner connection={connection} />

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
      <StatCard label="Active Leads" value={activeLeads.length.toString()} icon={<Target className="h-4 w-4" />} color="blue" />
        <StatCard label="Won Deals" value={stageGroups["closed_won"].length.toString()} icon={<CheckCircle className="h-4 w-4" />} color="green" />
        <StatCard label="Pipeline Value" value="Not tracked" icon={<DollarSign className="h-4 w-4" />} color="purple" />
        <StatCard label="Revenue Won" value="Not tracked" icon={<TrendingUp className="h-4 w-4" />} color="amber" />
      </div>

      {/* Pipeline stages */}
      <div className="space-y-4">
        <Card className="border-green-300 bg-green-50/40">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <span className="px-2 py-0.5 rounded text-xs font-medium bg-green-100 text-green-700">Sales stages</span>
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-0">
            <div className="flex flex-wrap gap-2">
              {PIPELINE_BOARD_STAGES.map((s, i) => (
                <span key={s.key} className={`px-3 py-1.5 rounded-full text-xs font-medium ${s.color}`}>{i + 1}. {s.label}</span>
              ))}
            </div>
            <p className="text-xs text-muted-foreground mt-2">
              Drag a card to move it between stages. Company columns here are independent of Pipedrive deal mapping on{" "}
              <a href="/crm-sync" className="underline">/crm-sync</a>.
            </p>
          </CardContent>
        </Card>

        <PipelineBoard initialCompanies={companies} stages={STAGES} />
      </div>

    </div>
  );
}

type PipelineCompany = {
  id: string; company_name: string; industry?: string | null; status?: string | null;
  pipeline_stage?: string | null; updated_at?: string | null;
};

function StatCard({ label, value, icon, color }: { label: string; value: string; icon: React.ReactNode; color: string }) {
  const colors: Record<string, string> = {
    blue: "bg-blue-50 text-blue-700", green: "bg-green-50 text-green-700",
    purple: "bg-purple-50 text-purple-700", amber: "bg-amber-50 text-amber-700",
  };
  // Found in the 2026-09-23 UX audit: "Not tracked" rendered in the same
  // bold colored typography as the real Active Leads figure — visually
  // indistinguishable from a genuine number at a glance.
  const untracked = value === "Not tracked";
  return (
    <div className={`rounded-lg border p-3 ${untracked ? "bg-muted/20" : colors[color] || ""}`}>
      <div className={`flex items-center gap-1.5 text-xs mb-1 ${untracked ? "text-muted-foreground" : "opacity-70"}`}>{icon}{label}</div>
      <p className={untracked ? "text-base font-medium text-muted-foreground" : "text-2xl font-bold"}>{value}</p>
    </div>
  );
}
