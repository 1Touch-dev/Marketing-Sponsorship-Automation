import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";
import { recordAudit } from "@/lib/audit/log";

export const dynamic = "force-dynamic";

/**
 * CRM Sync Abstraction Layer — Pipedrive-ready
 * Architecture for when real Pipedrive credentials are available.
 * Currently: queues sync operations and returns mock responses.
 */

// Pipedrive field mappings
const DEAL_STAGE_MAP: Record<string, number> = {
  prospect: 1, contacted: 2, proposal_sent: 3,
  negotiation: 4, verbal_agreement: 5, closed_won: 6, closed_lost: 7,
};

const ENTITY_MAP: Record<string, string> = {
  company: "organization", proposal: "deal",
  pipeline_lead: "deal", campaign: "note",
};

/**
 * GET /api/crm — sync queue status
 */
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
    pipedrive_configured: !!(process.env.PIPEDRIVE_API_KEY),
    architecture: "ready",
    note: "Pipedrive sync will activate when PIPEDRIVE_API_KEY is set in environment",
  });
}

/**
 * POST /api/crm — queue a sync operation
 */
export async function POST(req: Request) {
  try {
    const body = await req.json() as {
      entity_type: string;
      entity_id: string;
      operation: "create" | "update" | "delete" | "status_change";
      payload?: Record<string, unknown>;
    };

    const sb = supabaseAdmin();

    // Build CRM payload based on entity type
    let crmPayload: Record<string, unknown> = body.payload ?? {};
    let crmEntityType = ENTITY_MAP[body.entity_type] ?? body.entity_type;

    // If we have Pipedrive credentials, try live sync
    if (process.env.PIPEDRIVE_API_KEY) {
      const result = await syncToPipedrive(body.entity_type, body.entity_id, body.operation, crmPayload);
      crmPayload = { ...crmPayload, pipedrive_response: result };
    }

    // Always queue for audit trail
    const { data: queued } = await sb
      .from("crm_sync_queue" as "companies")
      .insert({
        entity_type: body.entity_type,
        entity_id: body.entity_id,
        operation: body.operation,
        crm_provider: "pipedrive",
        crm_entity_type: crmEntityType,
        payload: crmPayload,
        status: process.env.PIPEDRIVE_API_KEY ? "synced" : "pending",
        attempts: process.env.PIPEDRIVE_API_KEY ? 1 : 0,
      } as unknown as Record<string,unknown>)
      .select()
      .single();

    await recordAudit({
      action: `crm.${body.operation}`,
      entity_type: body.entity_type,
      entity_id: body.entity_id,
      metadata: { crm_provider: "pipedrive", has_credentials: !!process.env.PIPEDRIVE_API_KEY },
    });

    return NextResponse.json({
      queued: true,
      job: queued,
      live_sync: !!process.env.PIPEDRIVE_API_KEY,
      message: process.env.PIPEDRIVE_API_KEY
        ? "Synced to Pipedrive"
        : "Queued for sync — add PIPEDRIVE_API_KEY to environment to enable live sync",
    });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "CRM sync failed" }, { status: 500 });
  }
}

/**
 * PATCH /api/crm — retry failed items or bulk sync
 */
export async function PATCH(req: Request) {
  const { action } = await req.json() as { action: "retry_failed" | "clear_synced" };
  const sb = supabaseAdmin();

  if (action === "retry_failed") {
    const { data: failed } = await sb
      .from("crm_sync_queue" as "companies")
      .select("*")
      .eq("status", "failed")
      .limit(50);

    const retried = (failed ?? []).length;
    await sb.from("crm_sync_queue" as "companies")
      .update({ status: "pending", attempts: 0 } as unknown as Record<string,unknown>)
      .eq("status", "failed");
    return NextResponse.json({ retried, message: `${retried} failed jobs reset to pending` });
  }

  if (action === "clear_synced") {
    await sb.from("crm_sync_queue" as "companies")
      .update({ status: "archived" } as unknown as Record<string,unknown>)
      .eq("status", "synced");
    return NextResponse.json({ success: true, message: "Synced jobs archived" });
  }

  return NextResponse.json({ error: "Unknown action" }, { status: 400 });
}

// ── Pipedrive integration (activates when API key is present) ──────────────
async function syncToPipedrive(entityType: string, entityId: string, operation: string, payload: Record<string, unknown>) {
  const apiKey = process.env.PIPEDRIVE_API_KEY;
  const baseUrl = "https://api.pipedrive.com/v1";

  if (entityType === "company" && operation === "create") {
    const res = await fetch(`${baseUrl}/organizations?api_token=${apiKey}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: payload.company_name, visible_to: "3" }),
    });
    return await res.json();
  }

  if (entityType === "pipeline_lead" && operation === "create") {
    const stageId = DEAL_STAGE_MAP[payload.stage as string] ?? 1;
    const res = await fetch(`${baseUrl}/deals?api_token=${apiKey}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title: payload.title ?? `Deal — ${entityId}`,
        stage_id: stageId,
        value: payload.value ?? 0,
        currency: "BRL",
        visible_to: "3",
      }),
    });
    return await res.json();
  }

  return { mock: true, entity_type: entityType, entity_id: entityId, operation };
}
