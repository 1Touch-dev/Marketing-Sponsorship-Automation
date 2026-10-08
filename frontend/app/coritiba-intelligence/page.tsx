import Link from "next/link";
import { supabaseAdmin } from "@/lib/supabase/server";
import { resolveTenantId } from "@/lib/tenants/current";
import { PageHeader } from "@/components/shared/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { MapPin, Users, Trophy, Tv2, TrendingUp, Building2, Radio, Target, Scale } from "lucide-react";
import { loadRegistry, type RegistryEntry } from "@/lib/claims/store";

export const dynamic = "force-dynamic";

const CATEGORY_CONFIG: Record<string, { label: string; icon: React.ReactNode }> = {
  city:        { label: "City Metrics",       icon: <MapPin className="h-4 w-4" /> },
  club:        { label: "Club Facts",          icon: <Trophy className="h-4 w-4" /> },
  fanbase:     { label: "Fanbase Data",        icon: <Users className="h-4 w-4" /> },
  social:      { label: "Social Media",        icon: <TrendingUp className="h-4 w-4" /> },
  stadium:     { label: "Stadium Info",        icon: <Building2 className="h-4 w-4" /> },
  broadcast:   { label: "Broadcast Reach",     icon: <Tv2 className="h-4 w-4" /> },
  sponsorship: { label: "Sponsorship Facts",   icon: <Target className="h-4 w-4" /> },
  law:         { label: "Incentive-law Rules", icon: <Scale className="h-4 w-4" /> },
};

const STATE_LABEL: Record<string, string> = {
  current: "Verified",
  expiring_soon: "Verified, expiring soon",
  scheduled: "Not effective yet",
  expired: "Expired",
  unreviewed: "Needs verification",
  disputed: "Disputed",
  unsupported: "Missing source / owner / dates",
  retired: "Retired",
};

const stateCls = (e: RegistryEntry) =>
  e.evaluation.state === "current" ? "bg-emerald-100 text-emerald-800"
  : e.evaluation.state === "expiring_soon" ? "bg-amber-100 text-amber-800"
  : e.evaluation.state === "disputed" || e.evaluation.state === "expired" ? "bg-red-100 text-red-800"
  : "bg-slate-100 text-slate-700";

/**
 * Club facts live in the claims registry (lib/claims). This page is a read-only
 * view of them with their provenance; adding or changing a figure, and
 * verifying it, happens on /claims. It used to read a separate table that no
 * sponsor-facing page or prompt used, so a fact could be edited here and never
 * reach anyone, or sit here unverified.
 */
export default async function CoritibIntelligencePage() {
  const tenantId = await resolveTenantId();
  const res = await loadRegistry(supabaseAdmin(), tenantId);
  const entries = res.ok ? res.entries.filter((e) => !e.retired_at) : [];

  const byCategory = entries.reduce<Record<string, RegistryEntry[]>>((acc, e) => {
    (acc[e.category] = acc[e.category] || []).push(e);
    return acc;
  }, {});
  const categories = [...Object.keys(CATEGORY_CONFIG), ...Object.keys(byCategory).filter((c) => !(c in CATEGORY_CONFIG))];
  const usable = entries.filter((e) => e.evaluation.usable);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Coritiba FC Intelligence"
        description="Club, city, fanbase and incentive-law facts, each with its source, owner and review status"
      />

      {!res.ok && (
        <p className="rounded-lg border bg-card p-4 text-sm">
          {res.reason === "migration_missing" ? "The claims registry has not been set up yet (migration 0056)." : `Could not load the registry: ${res.error}`}
        </p>
      )}

      {res.ok && (
        <p className="text-sm text-muted-foreground" data-testid="intel-summary">
          <span className="font-semibold text-foreground">{usable.length} of {entries.length} facts</span> are verified and can be shown to sponsors or used by the AI.
          The rest are listed so they can be checked. To add, change or verify a fact, go to the{" "}
          <Link href="/claims" className="underline font-medium">claims registry</Link>.
        </p>
      )}

      {usable.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {usable.slice(0, 4).map((e) => (
            <div key={e.id} className="rounded-xl border bg-gradient-to-br from-green-50 to-white p-4 space-y-1">
              <p className="text-xs text-muted-foreground">{e.label}</p>
              <p className="text-2xl font-bold text-green-700">{e.current.value}</p>
              <p className="text-[11px] text-muted-foreground">{e.current.source_ref}</p>
            </div>
          ))}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {categories.map((cat) => {
          const config = CATEGORY_CONFIG[cat] ?? { label: cat, icon: <Target className="h-4 w-4" /> };
          const list = byCategory[cat] ?? [];
          if (list.length === 0 && !(cat in CATEGORY_CONFIG)) return null;
          return (
            <Card key={cat}>
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2">
                  {config.icon}
                  {config.label}
                  <Badge variant="secondary" className="text-xs ml-auto">{list.length}</Badge>
                </CardTitle>
              </CardHeader>
              <CardContent>
                {list.length > 0 ? (
                  <div className="space-y-2">
                    {list.map((e) => (
                      <div key={e.id} className="flex items-start justify-between gap-3 py-2 border-b last:border-0" data-testid={`intel-${e.key}`}>
                        <div className="min-w-0">
                          <p className="text-sm font-medium">{e.label}</p>
                          {e.current.description && <p className="text-xs text-muted-foreground mt-0.5">{e.current.description}</p>}
                          <p className="text-xs text-muted-foreground opacity-70">
                            Source: {e.current.source_ref ?? "none"}{e.current.owner ? ` · Owner: ${e.current.owner}` : " · No owner"}
                            {e.current.expires_at ? ` · Expires ${e.current.expires_at}` : ""}
                          </p>
                        </div>
                        <div className="shrink-0 text-right space-y-1">
                          <p className="text-sm font-bold text-green-700">{e.current.value}</p>
                          <span className={`inline-block rounded-full px-2 py-0.5 text-[10px] font-medium ${stateCls(e)}`}>{STATE_LABEL[e.evaluation.state]}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground text-center py-6">No {config.label.toLowerCase()} yet</p>
                )}
              </CardContent>
            </Card>
          );
        })}
      </div>

      <Card className="border-green-200 bg-green-50/30">
        <CardContent className="pt-4">
          <div className="flex items-start gap-3">
            <Radio className="h-5 w-5 text-green-600 shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-medium text-green-800">Where these facts are used</p>
              <p className="text-sm text-green-700 mt-0.5">
                Only verified, in-date facts reach AI proposal prompts, the proposal deck, the KPI cards and the incentive-law proposal text.
                A fact with a status other than Verified is never shown to a sponsor.
              </p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
