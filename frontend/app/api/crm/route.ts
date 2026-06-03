import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";
import {
  dispatchToPipedrive,
  enqueueCrmSync,
  isPipedriveConfigured,
} from "@/lib/pipedrive/sync";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const status = searchParams.get("status") ?? "pending";
  const sb = supabaseAdmin();

  const { data: queue } = await sb
    .from("crm_sync_queue" as "companies")
    .select("*")
    .eq("status", status)
    .order("created_at", { ascending: false })
    .limit(100);

  const { data: all } = await sb
    .from("crm_sync_queue" as "companies")
    .select("status")
    .limit(1000);

  const stats = (all ?? []).reduce((acc: Record<string, number>, row: unknown) => {
    const r = row as Record<string, string>;
    acc[r.status] = (acc[r.status] ?? 0) + 1;
    return acc;
  }, {});

  return NextResponse.json({
    queue: queue ?? [],
    stats,
    pipedrive_configured: isPipedriveConfigured(),
    architecture: "live",
  });
}

export async function POST(req: Request) {
  try {
    const body = await req.json() as {
      entity_type: string;
      entity_id: string;
      operation: "create" | "update" | "delete" | "status_change";
      payload?: Record<string, unknown>;
    };

    const { sync_status, result } = await enqueueCrmSync({
      entity_type: body.entity_type,
      entity_id: body.entity_id,
      operation: body.operation,
      payload: body.payload,
    });

    return NextResponse.json({
      queued: true,
      live_sync: isPipedriveConfigured(),
      sync_status,
      pipedrive_result: result,
      message: sync_status === "synced"
        ? "Synced to Pipedrive ✓"
        : sync_status === "failed"
          ? `Queued (sync failed: ${result.error})`
          : sync_status === "skipped"
            ? "Skipped — entity not found"
            : "Queued — add PIPEDRIVE_API_KEY to activate live sync",
    });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "CRM sync failed" }, { status: 500 });
  }
}

export async function PATCH(req: Request) {
  const { action } = await req.json() as { action: "retry_failed" | "flush_pending" | "clear_synced" };
  const sb = supabaseAdmin();

  if (action === "retry_failed" || action === "flush_pending") {
    const targetStatus = action === "retry_failed" ? "failed" : "pending";
    const { data: jobs } = await sb
      .from("crm_sync_queue" as "companies")
      .select("*")
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
            sb,
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
      .eq("status", "synced");
    return NextResponse.json({ success: true, message: "Synced jobs archived" });
  }

  return NextResponse.json({ error: "Unknown action" }, { status: 400 });
}
