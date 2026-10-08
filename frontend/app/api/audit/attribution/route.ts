import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";
import { requirePermission } from "@/lib/auth/server-permission";
import { ACTOR_KINDS } from "@/lib/identity/actor";
import { isMissingMigration } from "@/lib/proposals/revision-store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/audit/attribution?days=30
 * How the recent audit entries split by who did them (human, approver, agent, service, external) and how many
 * come from before actors were recorded (legacy). Shows at a glance whether anything is going unattributed.
 */
export async function GET(req: Request) {
  const auth = await requirePermission("view_audit");
  if ("error" in auth) return auth.error;
  const days = Math.min(Math.max(parseInt(new URL(req.url).searchParams.get("days") ?? "30", 10) || 30, 1), 365);
  const since = new Date(Date.now() - days * 86_400_000).toISOString();
  const sb = supabaseAdmin();
  const kinds = [...ACTOR_KINDS, "legacy"] as string[];
  const counts: Record<string, number> = {};
  // A HEAD count carries no error text, so look for the column with a normal read first.
  const probe = await sb.from("audit_logs").select("actor_kind").limit(1);
  if (probe.error) return NextResponse.json({ error: isMissingMigration(probe.error) ? "Actors are not recorded yet (migration 0069)." : probe.error.message }, { status: isMissingMigration(probe.error) ? 503 : 500 });
  for (const k of kinds) {
    const { count, error } = await sb.from("audit_logs").select("id", { count: "exact", head: true }).eq("tenant_id", auth.user.tenant_id).eq("actor_kind", k).gte("created_at", since);
    if (error) return NextResponse.json({ error: error.message || "Could not count audit entries." }, { status: 500 });
    counts[k] = count ?? 0;
  }
  const total = Object.values(counts).reduce((a, b) => a + b, 0);
  return NextResponse.json({ days, total, by_actor_kind: counts, unattributed: counts.legacy, attributed_share: total > 0 ? Math.round(((total - counts.legacy) / total) * 100) : null });
}
