import { supabaseAdmin } from "@/lib/supabase/server";
import { PageHeader } from "@/components/shared/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { MapPin, Users, Trophy, Tv2, TrendingUp, Building2, Radio, Target, Plus, RefreshCw } from "lucide-react";
import { CoritibMetricForm } from "./metric-form";
import { MigrationBanner } from "./migration-banner";

export const dynamic = "force-dynamic";

const CATEGORY_CONFIG: Record<string, { label: string; icon: React.ReactNode; color: string }> = {
  city:        { label: "City Metrics",       icon: <MapPin className="h-4 w-4" />,      color: "blue" },
  club:        { label: "Club Facts",          icon: <Trophy className="h-4 w-4" />,      color: "green" },
  fanbase:     { label: "Fanbase Data",        icon: <Users className="h-4 w-4" />,       color: "purple" },
  social:      { label: "Social Media",        icon: <TrendingUp className="h-4 w-4" />,  color: "pink" },
  stadium:     { label: "Stadium Info",        icon: <Building2 className="h-4 w-4" />,   color: "amber" },
  broadcast:   { label: "Broadcast Reach",     icon: <Tv2 className="h-4 w-4" />,         color: "indigo" },
  sponsorship: { label: "Sponsorship Facts",   icon: <Target className="h-4 w-4" />,      color: "orange" },
};

export default async function CoritibIntelligencePage() {
  const sb = supabaseAdmin();

  let metrics: Record<string, unknown>[] = [];
  let migrationNeeded = false;

  try {
    const { data, error } = await (sb as ReturnType<typeof supabaseAdmin>)
      .from("coritiba_metrics" as "companies")
      .select("*")
      .order("category")
      .order("sort_order");

    if (error?.message?.includes("not find")) {
      migrationNeeded = true;
    } else {
      metrics = (data ?? []) as Record<string, unknown>[];
    }
  } catch {
    migrationNeeded = true;
  }

  const byCategory = metrics.reduce<Record<string, Record<string, unknown>[]>>((acc, m) => {
    const cat = (m.category as string) || "other";
    acc[cat] = acc[cat] || [];
    acc[cat].push(m);
    return acc;
  }, {});

  const featured = metrics.filter((m) => m.is_featured);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Coritiba FC Intelligence"
        description="Manage reusable city, club, fanbase, and sponsorship metrics for proposals"
        actions={
          <div className="flex items-center gap-2">
            <a href="/api/internal/apply-sql" className="hidden">
              <Button variant="outline" size="sm">
                <RefreshCw className="h-4 w-4 mr-1" />
                Apply Migration
              </Button>
            </a>
          </div>
        }
      />

      {migrationNeeded && <MigrationBanner />}

      {/* Hero stats */}
      {featured.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {featured.slice(0, 4).map((m) => (
            <div key={m.id as string} className="rounded-xl border bg-gradient-to-br from-green-50 to-white p-4 space-y-1">
              <p className="text-xs text-muted-foreground">{m.metric_name as string}</p>
              <p className="text-2xl font-bold text-green-700">{m.metric_value as string}</p>
              {!!m.unit && <p className="text-xs text-muted-foreground">{m.unit as string}</p>}
            </div>
          ))}
        </div>
      )}

      {/* Metrics by category */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {Object.entries(CATEGORY_CONFIG).map(([cat, config]) => {
          const catMetrics = byCategory[cat] || [];
          return (
            <Card key={cat}>
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2">
                  {config.icon}
                  {config.label}
                  <Badge variant="secondary" className="text-xs ml-auto">{catMetrics.length}</Badge>
                </CardTitle>
              </CardHeader>
              <CardContent>
                {catMetrics.length > 0 ? (
                  <div className="space-y-2">
                    {catMetrics.map((m) => (
                      <div key={m.id as string} className="flex items-start justify-between gap-3 py-2 border-b last:border-0">
                        <div className="min-w-0">
                          <div className="flex items-center gap-2">
                            <p className="text-sm font-medium">{m.metric_name as string}</p>
                            {!!m.is_featured && <Badge variant="outline" className="text-xs py-0">Featured</Badge>}
                          </div>
                          {!!m.description && <p className="text-xs text-muted-foreground mt-0.5">{m.description as string}</p>}
                          {!!m.source && <p className="text-xs text-muted-foreground opacity-60">Source: {m.source as string}</p>}
                        </div>
                        <div className="shrink-0 text-right">
                          <p className="text-sm font-bold text-green-700">{m.metric_value as string}</p>
                          {!!m.unit && <p className="text-xs text-muted-foreground">{m.unit as string}</p>}
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-center py-6 text-muted-foreground">
                    <p className="text-sm">No {config.label.toLowerCase()} yet</p>
                    {migrationNeeded && <p className="text-xs mt-1">Apply migration to seed default data</p>}
                  </div>
                )}
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* Add metric form */}
      {!migrationNeeded && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <Plus className="h-4 w-4" />
              Add New Metric
            </CardTitle>
          </CardHeader>
          <CardContent>
            <CoritibMetricForm categories={Object.keys(CATEGORY_CONFIG)} />
          </CardContent>
        </Card>
      )}

      {/* Proposal integration info */}
      <Card className="border-green-200 bg-green-50/30">
        <CardContent className="pt-4">
          <div className="flex items-start gap-3">
            <Radio className="h-5 w-5 text-green-600 shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-medium text-green-800">Proposal Integration</p>
              <p className="text-sm text-green-700 mt-0.5">
                These metrics are automatically injected into AI proposal generation prompts.
                Featured metrics appear in proposal hero stats and company presentations.
                All data is Coritiba FC / Couto Pereira specific — no competitor references.
              </p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
