import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";
import { recordAudit } from "@/lib/audit/log";
import { logger } from "@/lib/monitoring/logger";
import { resolveTenantId } from "@/lib/tenants/current";
import { currentActor } from "@/lib/identity/current";

export const dynamic = "force-dynamic";

/** Export tracking — log every proposal export/download/view */

export async function POST(req: Request) {
  try {
    const { proposal_id, export_type, company_id, metadata } = await req.json() as {
      proposal_id: string;
      export_type: "pdf_executive" | "pdf_print" | "share_link" | "presentation" | "preview";
      company_id?: string;
      metadata?: Record<string, unknown>;
    };

    // Staff screens only (the middleware requires a session). The type becomes part of an audit action name and the
    // audit log is permanent, so it must be one of the known types, not text.
    if (!["pdf_executive", "pdf_print", "share_link", "presentation", "preview"].includes(export_type)) return NextResponse.json({ error: "Unknown export type" }, { status: 400 });
    if (typeof proposal_id !== "string" || !/^[0-9a-f-]{36}$/i.test(proposal_id)) return NextResponse.json({ error: "proposal_id required" }, { status: 400 });
    const tenantId = await resolveTenantId();
    const sb = supabaseAdmin();

    // Log the export event
    await recordAudit({
      actor: await currentActor("export request"),
      action: `proposal.export_${export_type}`,
      entity_type: "proposal",
      entity_id: proposal_id,
      metadata: { export_type, company_id: typeof company_id === "string" ? company_id.slice(0, 40) : null, via: typeof metadata?.via === "string" ? metadata.via.slice(0, 40) : null },
    });

    // Increment view/export count on proposal
    const { data: proposal } = await sb.from("proposals")
      .select("metadata")
      .eq("id", proposal_id)
      .eq("tenant_id", tenantId)
      .maybeSingle();

    const existingMeta = (proposal?.metadata ?? {}) as Record<string, number>;
    const exportKey = `exports_${export_type}`;
    await sb.from("proposals").update({
      metadata: {
        ...existingMeta,
        [exportKey]: (existingMeta[exportKey] ?? 0) + 1,
        total_exports: (existingMeta.total_exports ?? 0) + 1,
        last_exported_at: new Date().toISOString(),
      },
    } as unknown as Record<string, unknown>).eq("id", proposal_id).eq("tenant_id", tenantId);

    logger.info("Proposal exported", { proposal_id, export_type });
    return NextResponse.json({ success: true, tracked: true });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Failed" }, { status: 500 });
  }
}

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const proposal_id = searchParams.get("proposal_id");
  if (!proposal_id) return NextResponse.json({ error: "proposal_id required" }, { status: 400 });

  const tenantId = await resolveTenantId();
  const sb = supabaseAdmin();
  const { data: auditLogs } = await sb.from("audit_logs")
    .select("action, created_at, metadata")
    .eq("entity_id", proposal_id)
    .eq("tenant_id", tenantId)
    .like("action", "proposal.export_%")
    .order("created_at", { ascending: false })
    .limit(50);

  const stats: Record<string, number> = {};
  for (const log of (auditLogs ?? []) as Array<Record<string, unknown>>) {
    const action = String(log.action).replace("proposal.export_", "");
    stats[action] = (stats[action] ?? 0) + 1;
  }

  return NextResponse.json({ proposal_id, stats, logs: auditLogs ?? [] });
}
