import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";
import { dispatchToPipedrive, enqueueCrmSync, isPipedriveConfigured } from "@/lib/pipedrive/sync";
import { pipedriveConnection } from "@/lib/pipedrive/status";
import { pushContext, person } from "@/lib/pipedrive/context";
import { recentFailures } from "@/lib/integrations/log";
import { SYSTEM } from "@/lib/pipedrive/adapter";
import { requirePermission } from "@/lib/auth/server-permission";
import { resolveTenantId } from "@/lib/tenants/current";

export const dynamic = "force-dynamic";

const SINGULAR: Record<string, string> = { proposals: "proposal", companies: "company", contacts: "contact" };

/**
 * GET /api/crm[?include_status=1]
 * The connection record every screen reads (`connection`), the latest failed calls, and the counts of the OLD queue
 * (`stats`, `queue`): nothing writes to that queue any more, so those are history, kept so earlier jobs can still be seen.
 * With include_status=1 it first asks Pipedrive whether it accepts the key, if that has not been checked in five minutes.
 */
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const status = searchParams.get("status") ?? "pending";
  const tenantId = await resolveTenantId();
  const sb = supabaseAdmin();

  const connection = await pipedriveConnection(sb, tenantId, { check: searchParams.get("include_status") === "1" });
  const failures = await recentFailures(sb, tenantId, SYSTEM, 5);

  const { data: queue } = await sb
    .from("crm_sync_queue" as "companies")
    .select("*")
    .eq("tenant_id" as "id", tenantId)
    .eq("status", status)
    .order("created_at", { ascending: false })
    .limit(100);

  const { data: all } = await sb
    .from("crm_sync_queue" as "companies")
    .select("status")
    .eq("tenant_id" as "id", tenantId)
    .limit(1000);

  const stats = (all ?? []).reduce((acc: Record<string, number>, row: unknown) => {
    const r = row as Record<string, string>;
    acc[r.status] = (acc[r.status] ?? 0) + 1;
    return acc;
  }, {});

  return NextResponse.json({
    connection: {
      state: connection.state,
      tone: connection.tone,
      last_error: connection.last_error,
      last_error_at: connection.last_error_at,
      last_push_ok_at: connection.last_push_ok_at,
      key_checked_at: connection.key_checked_at,
      last_error_kind: connection.last_error_kind,
    },
    // the fields the status card has always read, now filled from the one record
    pipedrive_configured: connection.configured,
    api_valid: connection.key_accepted === true,
    api_error: connection.state === "key_rejected" || connection.state === "failing" ? connection.last_error ?? undefined : undefined,
    last_synced_at: connection.last_push_ok_at,
    pending_count: stats.pending ?? 0,
    recent_errors: failures.map((f) => ({ ts: f.ts, path: `${f.entity_type}/${f.entity_id}`, method: f.operation, error: f.error ?? `HTTP ${f.http_status ?? "?"}` })),
    queue: queue ?? [],
    stats,
    architecture: "live",
  });
}

export async function POST(req: Request) {
  const auth = await requirePermission("manage_integrations");
  if ("error" in auth) return auth.error;

  try {
    const body = await req.json() as {
      entity_type: string;
      entity_id: string;
      operation: "create" | "update" | "delete" | "status_change";
      payload?: Record<string, unknown>;
    };
    const sb = supabaseAdmin();

    // The "Sync" button on the status card sends entity_type "manual": it asks for the connection to be checked now.
    if (body.entity_type === "manual") {
      const c = await pipedriveConnection(sb, auth.user.tenant_id, { force: true });
      return NextResponse.json({ queued: false, live_sync: isPipedriveConfigured(), sync_status: c.state === "connected" ? "synced" : c.state === "not_configured" ? "skipped" : "failed", connection: { state: c.state, tone: c.tone, last_error: c.last_error, last_error_at: c.last_error_at, last_push_ok_at: c.last_push_ok_at, key_checked_at: c.key_checked_at, last_error_kind: c.last_error_kind }, pipedrive_result: {}, message: c.state });
    }

    const { sync_status, result } = await enqueueCrmSync(
      { entity_type: body.entity_type, entity_id: body.entity_id, operation: body.operation, payload: body.payload },
      pushContext(sb, auth.user.tenant_id, person(auth.user.email), "manual_sync", body.entity_id),
    );

    return NextResponse.json({
      queued: false,
      live_sync: isPipedriveConfigured(),
      sync_status,
      pipedrive_result: result,
      message: sync_status === "synced"
        ? "Synced to Pipedrive ✓"
        : sync_status === "failed"
          ? `Not synced: ${result.error}`
          : result.reason === "not_configured"
            ? "Not sent — no Pipedrive API key is set on this server."
            : `Nothing was sent: ${String(result.skipped ?? "skipped")}`,
    });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "CRM sync failed" }, { status: 500 });
  }
}

export async function PATCH(req: Request) {
  const auth = await requirePermission("manage_integrations");
  if ("error" in auth) return auth.error;

  const { action } = await req.json() as { action: "retry_failed" | "flush_pending" | "clear_synced" | "retry_recent_failures" };
  const sb = supabaseAdmin();
  const ctx = () => pushContext(sb, auth.user.tenant_id, person(auth.user.email), "retry");

  // Push again whatever failed recently, by stored ID. (The old queue below is history; nothing writes to it any more.)
  if (action === "retry_recent_failures") {
    if (!isPipedriveConfigured()) return NextResponse.json({ retried: 0, succeeded: 0, failed: 0, message: "No Pipedrive API key is set on this server." });
    const since = new Date(Date.now() - 24 * 3600 * 1000).toISOString();
    const { data } = await sb.from("integration_events" as "companies").select("entity_type, entity_id, operation").eq("tenant_id" as "id", auth.user.tenant_id).eq("system" as "id", SYSTEM).eq("outcome" as "id", "failed").gte("created_at", since).order("created_at", { ascending: false }).limit(200);
    const seen = new Set<string>();
    let retried = 0, succeeded = 0, failed = 0;
    for (const e of (data ?? []) as unknown as Array<{ entity_type: string; entity_id: string }>) {
      const key = `${e.entity_type}:${e.entity_id}`;
      const type = SINGULAR[e.entity_type];
      if (seen.has(key) || !type || seen.size >= 25) continue;
      seen.add(key);
      retried++;
      const r = await enqueueCrmSync({ entity_type: type, entity_id: e.entity_id, operation: "update" }, { ...ctx(), auth: { ...ctx().auth, basis: "retry", ref: e.entity_id } });
      if (r.sync_status === "synced") succeeded++; else if (r.sync_status === "failed") failed++;
    }
    return NextResponse.json({ retried, succeeded, failed, message: `Retried ${retried}: ${succeeded} synced, ${failed} failed` });
  }

  if (action === "retry_failed" || action === "flush_pending") {
    const targetStatus = action === "retry_failed" ? "failed" : "pending";
    const { data: jobs } = await sb
      .from("crm_sync_queue" as "companies")
      .select("*")
      .eq("tenant_id" as "id", auth.user.tenant_id)
      .eq("status", targetStatus)
      .limit(50);

    let retried = 0, succeeded = 0, failed = 0;

    for (const job of (jobs ?? []) as Array<Record<string, unknown>>) {
      if (isPipedriveConfigured()) {
        try {
          const result = await dispatchToPipedrive(
            job.entity_type as string,
            job.entity_id as string,
            job.operation as "create" | "update" | "delete" | "status_change",
            (job.payload as Record<string, unknown>) ?? {},
            { ...ctx(), auth: { ...ctx().auth, ref: String(job.id) } },
          );
          await sb.from("crm_sync_queue" as "companies")
            .update({
              status: "synced",
              attempts: ((job.attempts as number) ?? 0) + 1,
              payload: { ...(job.payload as Record<string, unknown>), ...result },
            } as unknown as Record<string, unknown>)
            .eq("id", job.id as string);
          succeeded++;
        } catch (err) {
          const msg = err instanceof Error ? err.message : "sync failed";
          const status = msg === "Proposal not found" ? "skipped" : "failed";
          await sb.from("crm_sync_queue" as "companies")
            .update({
              status,
              attempts: ((job.attempts as number) ?? 0) + 1,
              payload: { ...(job.payload as Record<string, unknown>), error: msg },
            } as unknown as Record<string, unknown>)
            .eq("id", job.id as string);
          if (status === "failed") failed++;
        }
      } else {
        await sb.from("crm_sync_queue" as "companies")
          .update({ attempts: ((job.attempts as number) ?? 0) + 1 } as unknown as Record<string, unknown>)
          .eq("id", job.id as string);
      }
      retried++;
    }

    return NextResponse.json({ retried, succeeded, failed, message: `Processed ${retried} jobs: ${succeeded} synced, ${failed} failed` });
  }

  if (action === "clear_synced") {
    await sb.from("crm_sync_queue" as "companies")
      .update({ status: "archived" } as unknown as Record<string, unknown>)
      .eq("status", "synced")
      .eq("tenant_id" as "id", auth.user.tenant_id);
    return NextResponse.json({ success: true, message: "Synced jobs archived" });
  }

  return NextResponse.json({ error: "Unknown action" }, { status: 400 });
}
