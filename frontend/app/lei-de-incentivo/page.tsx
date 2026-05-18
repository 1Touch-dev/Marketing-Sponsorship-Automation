import { supabaseAdmin } from "@/lib/supabase/server";
import { PageHeader } from "@/components/shared/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Heart, Users, Calendar, DollarSign, CheckCircle, Plus, AlertCircle, Leaf, BookOpen, Activity } from "lucide-react";
import { SocialProjectForm } from "./social-project-form";

export const dynamic = "force-dynamic";

const TYPE_CONFIG: Record<string, { label: string; icon: React.ReactNode; color: string }> = {
  esporte:       { label: "Esporte",         icon: <Activity className="h-4 w-4" />,   color: "green" },
  educacao:      { label: "Educação",        icon: <BookOpen className="h-4 w-4" />,  color: "blue" },
  cultura:       { label: "Cultura",          icon: <Heart className="h-4 w-4" />,     color: "pink" },
  saude:         { label: "Saúde",            icon: <Heart className="h-4 w-4" />,     color: "red" },
  meio_ambiente: { label: "Meio Ambiente",    icon: <Leaf className="h-4 w-4" />,      color: "emerald" },
  comunidade:    { label: "Comunidade",       icon: <Users className="h-4 w-4" />,     color: "purple" },
};

export default async function LeiDeIncentivoPage() {
  const sb = supabaseAdmin();

  let projects: Record<string, unknown>[] = [];
  let migrationNeeded = false;

  try {
    const { data, error } = await (sb as ReturnType<typeof supabaseAdmin>)
      .from("social_projects" as "companies")
      .select("*")
      .order("created_at", { ascending: false });

    if (error?.message?.includes("not find") || error?.message?.includes("does not exist")) {
      migrationNeeded = true;
    } else {
      projects = (data ?? []) as Record<string, unknown>[];
    }
  } catch {
    migrationNeeded = true;
  }

  const openProjects = projects.filter((p) => p.status === "open");
  const totalBudget = projects.reduce((sum, p) => sum + (Number(p.budget_total) || 0), 0);
  const totalRaised = projects.reduce((sum, p) => sum + (Number(p.budget_raised) || 0), 0);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Lei de Incentivo"
        description="Social projects, charitable programs, and fiscal incentive sponsorship proposals"
        actions={
          <Button size="sm">
            <Plus className="h-4 w-4 mr-1" />
            New Project
          </Button>
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

      {/* Explainer */}
      <Card className="border-green-200 bg-green-50/40">
        <CardContent className="pt-4">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-sm">
            <div className="space-y-1">
              <p className="font-semibold text-green-800">Lei de Incentivo ao Esporte (LIE)</p>
              <p className="text-green-700 text-xs">Companies can donate up to 1% of IR to approved sports projects and deduct 100% from federal income tax.</p>
            </div>
            <div className="space-y-1">
              <p className="font-semibold text-green-800">Lei Rouanet (Cultura)</p>
              <p className="text-green-700 text-xs">Cultural and educational projects approved by Ministério da Cultura. Tax deductions of up to 4–6% of IR.</p>
            </div>
            <div className="space-y-1">
              <p className="font-semibold text-green-800">Leis Municipais — Curitiba</p>
              <p className="text-green-700 text-xs">Curitiba city-level incentive programs for community, environmental, and social projects in Paraná.</p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <StatCard label="Open Projects" value={openProjects.length.toString()} icon={<Activity className="h-4 w-4" />} color="blue" />
        <StatCard label="Total Projects" value={projects.length.toString()} icon={<CheckCircle className="h-4 w-4" />} color="green" />
        <StatCard label="Total Budget" value={totalBudget > 0 ? `R$ ${(totalBudget / 1000).toFixed(0)}K` : "—"} icon={<DollarSign className="h-4 w-4" />} color="purple" />
        <StatCard label="Raised So Far" value={totalRaised > 0 ? `R$ ${(totalRaised / 1000).toFixed(0)}K` : "—"} icon={<TrendingUp className="h-4 w-4" />} color="amber" />
      </div>

      {/* Projects */}
      {projects.length > 0 ? (
        <div className="space-y-4">
          {projects.map((project) => (
            <ProjectCard key={project.id as string} project={project} />
          ))}
        </div>
      ) : !migrationNeeded ? (
        <Card>
          <CardContent className="text-center py-12">
            <Heart className="h-10 w-10 text-muted-foreground mx-auto mb-3" />
            <p className="text-muted-foreground">No social projects yet</p>
            <p className="text-sm text-muted-foreground mt-1">Add projects that companies can sponsor via Lei de Incentivo</p>
          </CardContent>
        </Card>
      ) : null}

      {/* Add form */}
      {!migrationNeeded && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <Plus className="h-4 w-4" />
              Add Social Project
            </CardTitle>
          </CardHeader>
          <CardContent>
            <SocialProjectForm />
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function ProjectCard({ project }: { project: Record<string, unknown> }) {
  const typeConfig = TYPE_CONFIG[(project.project_type as string)] || TYPE_CONFIG.esporte;
  const budget = Number(project.budget_total) || 0;
  const raised = Number(project.budget_raised) || 0;
  const pct = budget > 0 ? Math.min(100, Math.round((raised / budget) * 100)) : 0;

  return (
    <Card>
      <CardContent className="pt-4">
        <div className="flex items-start gap-3">
          <div className={`mt-0.5 p-2 rounded-lg bg-${typeConfig.color}-50 text-${typeConfig.color}-600`}>
            {typeConfig.icon}
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-start justify-between gap-2 flex-wrap">
              <div>
                <p className="text-sm font-semibold">{project.name as string}</p>
                {!!project.description && <p className="text-xs text-muted-foreground mt-0.5">{project.description as string}</p>}
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <Badge variant="outline" className="text-xs">{typeConfig.label}</Badge>
                {!!project.lei_type && <Badge variant="secondary" className="text-xs">{project.lei_type as string}</Badge>}
                <Badge variant="outline" className={`text-xs capitalize ${project.status === "open" ? "text-green-700 bg-green-50" : ""}`}>
                  {project.status as string}
                </Badge>
              </div>
            </div>

            <div className="mt-3 grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
              {!!project.location && (
                <div>
                  <p className="text-muted-foreground">Location</p>
                  <p className="font-medium">{project.location as string}</p>
                </div>
              )}
              {!!project.beneficiaries && (
                <div>
                  <p className="text-muted-foreground">Beneficiaries</p>
                  <p className="font-medium">{project.beneficiaries as string}</p>
                </div>
              )}
              {!!project.deadline_apply && (
                <div>
                  <p className="text-muted-foreground">Application Deadline</p>
                  <p className="font-medium">{new Date(project.deadline_apply as string).toLocaleDateString("pt-BR")}</p>
                </div>
              )}
              {budget > 0 && (
                <div>
                  <p className="text-muted-foreground">Budget</p>
                  <p className="font-medium">R$ {budget.toLocaleString("pt-BR")}</p>
                </div>
              )}
            </div>

            {budget > 0 && (
              <div className="mt-3">
                <div className="flex items-center justify-between text-xs mb-1">
                  <span className="text-muted-foreground">Fundraising progress</span>
                  <span className="font-medium">{pct}%</span>
                </div>
                <div className="h-2 bg-muted rounded-full overflow-hidden">
                  <div className="h-full bg-green-500 rounded-full transition-all" style={{ width: `${pct}%` }} />
                </div>
              </div>
            )}

            {!!project.tax_benefit && (
              <div className="mt-3 flex items-start gap-1.5 p-2 rounded-md bg-green-50 border border-green-100">
                <CheckCircle className="h-4 w-4 text-green-600 shrink-0 mt-0.5" />
                <p className="text-xs text-green-700">{project.tax_benefit as string}</p>
              </div>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function StatCard({ label, value, icon, color }: { label: string; value: string; icon: React.ReactNode; color: string }) {
  const colors: Record<string, string> = {
    blue: "bg-blue-50 text-blue-700",
    green: "bg-green-50 text-green-700",
    purple: "bg-purple-50 text-purple-700",
    amber: "bg-amber-50 text-amber-700",
  };
  return (
    <div className={`rounded-lg border p-3 ${colors[color] || ""}`}>
      <div className="flex items-center gap-1.5 text-xs opacity-70 mb-1">{icon}{label}</div>
      <p className="text-2xl font-bold">{value}</p>
    </div>
  );
}

function TrendingUp({ className }: { className?: string }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <polyline points="22 7 13.5 15.5 8.5 10.5 2 17" />
      <polyline points="16 7 22 7 22 13" />
    </svg>
  );
}
