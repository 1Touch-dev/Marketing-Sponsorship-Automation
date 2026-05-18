import { supabaseAdmin } from "@/lib/supabase/server";
import { PageHeader } from "@/components/shared/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { TrendingUp, Users, DollarSign, Calendar, Plus, AlertCircle, ArrowRight, Activity, CheckCircle, Target } from "lucide-react";
import Link from "next/link";
import { PipelineLeadForm } from "./pipeline-lead-form";

export const dynamic = "force-dynamic";

const STAGES = [
  { key: "prospect",        label: "Prospect",           color: "bg-gray-100 text-gray-700",    border: "border-gray-200" },
  { key: "qualified",       label: "Qualified",          color: "bg-blue-100 text-blue-700",    border: "border-blue-200" },
  { key: "contacted",       label: "Contacted",          color: "bg-indigo-100 text-indigo-700", border: "border-indigo-200" },
  { key: "proposal_sent",   label: "Proposal Sent",      color: "bg-purple-100 text-purple-700", border: "border-purple-200" },
  { key: "negotiation",     label: "Negotiation",        color: "bg-amber-100 text-amber-700",  border: "border-amber-200" },
  { key: "closed_won",      label: "Closed Won",         color: "bg-green-100 text-green-700",  border: "border-green-200" },
  { key: "closed_lost",     label: "Closed Lost",        color: "bg-red-100 text-red-700",      border: "border-red-200" },
];

export default async function PipelinePage() {
  const sb = supabaseAdmin();

  let leads: Record<string, unknown>[] = [];
  let companies: Record<string, unknown>[] = [];
  let migrationNeeded = false;

  try {
    const { data, error } = await (sb as ReturnType<typeof supabaseAdmin>)
      .from("pipeline_leads" as "companies")
      .select("*")
      .eq("status", "active")
      .order("created_at", { ascending: false });

    if (error?.message?.includes("not find") || error?.message?.includes("does not exist")) {
      migrationNeeded = true;
    } else {
      leads = (data ?? []) as Record<string, unknown>[];
    }
  } catch {
    migrationNeeded = true;
  }

  if (!migrationNeeded) {
    const { data } = await sb.from("companies").select("id, company_name").eq("status", "active").order("company_name").limit(100);
    companies = (data ?? []) as Record<string, unknown>[];
  }

  const stageGroups = STAGES.reduce<Record<string, Record<string, unknown>[]>>((acc, s) => {
    acc[s.key] = leads.filter((l) => l.stage === s.key);
    return acc;
  }, {});

  const totalValue = leads.reduce((sum, l) => sum + (Number(l.value) || 0), 0);
  const wonValue = stageGroups["closed_won"].reduce((sum, l) => sum + (Number(l.value) || 0), 0);
  const activeLeads = leads.filter((l) => !["closed_won", "closed_lost"].includes(l.stage as string));

  return (
    <div className="space-y-6">
      <PageHeader
        title="Sales Pipeline"
        description="CRM-ready lead tracking for Coritiba FC sponsorship deals (Pipedrive-ready)"
        actions={
          <div className="flex items-center gap-2">
            <Badge variant="outline" className="text-xs">Pipedrive Integration: Ready to Configure</Badge>
            <Button size="sm">
              <Plus className="h-4 w-4 mr-1" />
              Add Lead
            </Button>
          </div>
        }
      />

      {migrationNeeded && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 flex items-start gap-3">
          <AlertCircle className="h-5 w-5 text-amber-600 shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-medium text-amber-800">Database Migration Required</p>
            <p className="text-sm text-amber-700 mt-1">
              Go to{" "}
              <a href="/coritiba-intelligence" className="underline font-medium">Coritiba Intelligence</a>{" "}
              and apply the database migrations to enable this module.
            </p>
          </div>
        </div>
      )}

      {/* Pipedrive notice */}
      <Card className="border-blue-200 bg-blue-50/30">
        <CardContent className="pt-4">
          <div className="flex items-start gap-3">
            <Activity className="h-5 w-5 text-blue-600 shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-semibold text-blue-800">Pipedrive Integration Architecture Ready</p>
              <p className="text-sm text-blue-700 mt-1">
                All leads are structured with <code className="bg-blue-100 px-1 rounded text-xs">pipedrive_deal_id</code>, <code className="bg-blue-100 px-1 rounded text-xs">pipedrive_org_id</code>, and <code className="bg-blue-100 px-1 rounded text-xs">pipedrive_synced_at</code> fields.
                When you&apos;re ready to connect Pipedrive, the integration layer is pre-built.
              </p>
              <a href="https://mcp.pipedream.com/app/pipedrive" target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-xs text-blue-600 hover:underline mt-1">
                Pipedrive MCP Integration Docs
                <ArrowRight className="h-3 w-3" />
              </a>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <StatCard label="Active Leads" value={activeLeads.length.toString()} icon={<Target className="h-4 w-4" />} color="blue" />
        <StatCard label="Won Deals" value={stageGroups["closed_won"].length.toString()} icon={<CheckCircle className="h-4 w-4" />} color="green" />
        <StatCard label="Pipeline Value" value={totalValue > 0 ? `R$ ${(totalValue / 1000).toFixed(0)}K` : "—"} icon={<DollarSign className="h-4 w-4" />} color="purple" />
        <StatCard label="Revenue Won" value={wonValue > 0 ? `R$ ${(wonValue / 1000).toFixed(0)}K` : "—"} icon={<TrendingUp className="h-4 w-4" />} color="amber" />
      </div>

      {/* Pipeline stages */}
      <div className="space-y-4">
        {STAGES.filter((s) => s.key !== "closed_lost" || stageGroups["closed_lost"].length > 0).map((stage) => {
          const stageLeads = stageGroups[stage.key] || [];
          if (stageLeads.length === 0 && stage.key === "closed_won") return null;
          return (
            <Card key={stage.key}>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm flex items-center gap-2">
                  <span className={`px-2 py-0.5 rounded text-xs font-medium ${stage.color}`}>{stage.label}</span>
                  <span className="text-muted-foreground">({stageLeads.length})</span>
                  {stageLeads.length > 0 && (
                    <span className="ml-auto text-xs text-muted-foreground">
                      R$ {stageLeads.reduce((s, l) => s + (Number(l.value) || 0), 0).toLocaleString("pt-BR")}
                    </span>
                  )}
                </CardTitle>
              </CardHeader>
              <CardContent className="pt-0">
                {stageLeads.length > 0 ? (
                  <div className="divide-y">
                    {stageLeads.map((lead) => (
                      <LeadRow key={lead.id as string} lead={lead} />
                    ))}
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground py-2">No leads in this stage</p>
                )}
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* Add form */}
      {!migrationNeeded && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <Plus className="h-4 w-4" />
              Add Pipeline Lead
            </CardTitle>
          </CardHeader>
          <CardContent>
            <PipelineLeadForm companies={companies} />
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function LeadRow({ lead }: { lead: Record<string, unknown> }) {
  return (
    <div className="py-3 flex items-center gap-3">
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <p className="text-sm font-medium truncate">{lead.title as string}</p>
          {!!lead.source && <Badge variant="outline" className="text-xs capitalize shrink-0">{lead.source as string}</Badge>}
        </div>
        {!!lead.owner && <p className="text-xs text-muted-foreground mt-0.5">Owner: {lead.owner as string}</p>}
        {!!lead.next_followup && (
          <p className="text-xs text-muted-foreground mt-0.5 flex items-center gap-1">
            <Calendar className="h-3 w-3" />
            Follow-up: {new Date(lead.next_followup as string).toLocaleDateString("pt-BR")}
          </p>
        )}
      </div>
      <div className="shrink-0 text-right space-y-0.5">
        {!!lead.value && <p className="text-sm font-medium">R$ {Number(lead.value).toLocaleString("pt-BR")}</p>}
        {lead.probability !== undefined && lead.probability !== null && (
          <p className="text-xs text-muted-foreground">{lead.probability as number}% probability</p>
        )}
        {!!lead.proposal_id && (
          <Link href={`/proposals/${lead.proposal_id}`} className="text-xs text-blue-600 hover:underline block">
            View Proposal
          </Link>
        )}
      </div>
    </div>
  );
}

function StatCard({ label, value, icon, color }: { label: string; value: string; icon: React.ReactNode; color: string }) {
  const colors: Record<string, string> = {
    blue: "bg-blue-50 text-blue-700", green: "bg-green-50 text-green-700",
    purple: "bg-purple-50 text-purple-700", amber: "bg-amber-50 text-amber-700",
  };
  return (
    <div className={`rounded-lg border p-3 ${colors[color] || ""}`}>
      <div className="flex items-center gap-1.5 text-xs opacity-70 mb-1">{icon}{label}</div>
      <p className="text-2xl font-bold">{value}</p>
    </div>
  );
}
