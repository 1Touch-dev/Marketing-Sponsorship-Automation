import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";
import { recordAudit } from "@/lib/audit/log";

export const dynamic = "force-dynamic";

/**
 * Coritiba FC — Pipedrive CRM Integration
 *
 * Pipelines (real IDs from account):
 *   1 = Couto Pereira   (venue/events)
 *   2 = Mídias          (media/digital)
 *   3 = Patrocínios     (sponsorships)  ← main pipeline for proposals
 *   4 = Licenciamento / Varejo
 *   5 = Lei Incentivo
 *
 * Stage mapping for Patrocínios (pipeline 3):
 *   18 = Contatar Lead
 *   19 = Diagnóstico e Apresentação
 *   21 = Elaborar Proposta
 *   20 = Negociação
 *   24 = Contrato
 *
 * Custom Organization fields:
 *   fbd322ead72aa689d82c6eec5a4df360273c4925 = Origem do Lead
 *   fc019522db954595f0499113720ee6c7c54ef093 = Segmento
 *   1ad2a9e5a3e9a69189ac4ce35b7b2cd7ab04bf0e = Cidade
 *
 * Custom Deal fields:
 *   53d5ef0b9b13101669432847aeb0d801bad4988f = Categoria de Negócios Patrocínio
 *   25249fbe46305dd82a115ff564b904dbaedf2ee5 = Categoria Negócios Couto Pereira
 */

const PIPEDRIVE_BASE = "https://api.pipedrive.com/v1";

// Pipeline IDs
const PIPELINE = {
  COUTO_PEREIRA: 1,
  MIDIAS: 2,
  PATROCINIOS: 3,
  LICENCIAMENTO: 4,
  LEI_INCENTIVO: 5,
} as const;

// Stage IDs (Patrocínios pipeline — most common)
const STAGE_PATROCINIOS = {
  CONTATAR_LEAD: 18,
  DIAGNOSTICO: 19,
  ELABORAR_PROPOSTA: 21,
  NEGOCIACAO: 20,
  CONTRATO: 24,
} as const;

// Map our internal proposal_type to the right Pipedrive pipeline
function proposalTypeToPipeline(proposalType?: string): number {
  if (!proposalType) return PIPELINE.PATROCINIOS;
  const t = proposalType.toLowerCase();
  if (t.includes("lei") || t.includes("incentivo")) return PIPELINE.LEI_INCENTIVO;
  if (t.includes("midia") || t.includes("media") || t.includes("digital")) return PIPELINE.MIDIAS;
  if (t.includes("licencia") || t.includes("varejo")) return PIPELINE.LICENCIAMENTO;
  if (t.includes("evento") || t.includes("couto")) return PIPELINE.COUTO_PEREIRA;
  return PIPELINE.PATROCINIOS;
}

// Map our proposal status to Pipedrive stage ID
function statusToStage(status: string, pipelineId: number): number {
  // Patrocínios pipeline
  if (pipelineId === PIPELINE.PATROCINIOS) {
    if (status === "draft") return STAGE_PATROCINIOS.ELABORAR_PROPOSTA;
    if (status === "under_review") return STAGE_PATROCINIOS.ELABORAR_PROPOSTA;
    if (status === "approved") return STAGE_PATROCINIOS.NEGOCIACAO;
    if (status === "sent") return STAGE_PATROCINIOS.NEGOCIACAO;
    return STAGE_PATROCINIOS.CONTATAR_LEAD;
  }
  // Default: first stage of whatever pipeline
  return pipelineId === PIPELINE.LEI_INCENTIVO ? 33
    : pipelineId === PIPELINE.MIDIAS ? 11
    : pipelineId === PIPELINE.LICENCIAMENTO ? 26
    : STAGE_PATROCINIOS.CONTATAR_LEAD;
}

const apiKey = () => process.env.PIPEDRIVE_API_KEY ?? "";
const configured = () => !!process.env.PIPEDRIVE_API_KEY;

// ─── Helpers ──────────────────────────────────────────────────────────────────

async function pd(path: string, method = "GET", body?: unknown) {
  const url = `${PIPEDRIVE_BASE}${path}?api_token=${apiKey()}`;
  const opts: RequestInit = { method, headers: { "Content-Type": "application/json" } };
  if (body) opts.body = JSON.stringify(body);
  const res = await fetch(url, opts);
  return res.json();
}

/** Find org by name (exact first, then fuzzy) */
async function findOrg(name: string): Promise<number | null> {
  const data = await pd(`/organizations/search?term=${encodeURIComponent(name)}&limit=5`);
  const items = (data.data?.items ?? []) as Array<{ item: { id: number; name: string } }>;
  if (items.length > 0) return items[0].item.id;
  return null;
}

/** Create or get organization — returns Pipedrive org ID */
async function upsertOrganization(payload: {
  name: string;
  website?: string;
  industry?: string;
  segment?: string;
  city?: string;
}): Promise<number> {
  // Check if exists
  const existing = await findOrg(payload.name);
  if (existing) return existing;

  const body: Record<string, unknown> = {
    name: payload.name,
    visible_to: "3",
    // Custom fields
    ...(payload.segment ? { fc019522db954595f0499113720ee6c7c54ef093: payload.segment } : {}),
    ...(payload.city ? { "1ad2a9e5a3e9a69189ac4ce35b7b2cd7ab04bf0e": payload.city } : {}),
    ...(payload.website ? { website: payload.website } : {}),
    // Origem do Lead = Platform
    fbd322ead72aa689d82c6eec5a4df360273c4925: "Plataforma",
  };

  const result = await pd("/organizations", "POST", body);
  return result.data?.id as number;
}

/** Create a deal in the right pipeline */
async function createDeal(payload: {
  title: string;
  orgId: number;
  value?: number;
  proposalType?: string;
  status?: string;
}): Promise<{ id: number; pipeline_id: number }> {
  const pipelineId = proposalTypeToPipeline(payload.proposalType);
  const stageId = statusToStage(payload.status ?? "draft", pipelineId);

  const body: Record<string, unknown> = {
    title: payload.title,
    org_id: payload.orgId,
    pipeline_id: pipelineId,
    stage_id: stageId,
    value: payload.value ?? 0,
    currency: "BRL",
    visible_to: "3",
  };

  const result = await pd("/deals", "POST", body);
  return { id: result.data?.id as number, pipeline_id: pipelineId };
}

/** Update deal stage */
async function updateDealStage(dealId: number, status: string, pipelineId: number) {
  const stageId = statusToStage(status, pipelineId);
  return pd(`/deals/${dealId}`, "PUT", { stage_id: stageId });
}

/** Mark deal as won */
async function markDealWon(dealId: number) {
  return pd(`/deals/${dealId}`, "PUT", { status: "won" });
}

/** Mark deal as lost */
async function markDealLost(dealId: number, reason?: string) {
  return pd(`/deals/${dealId}`, "PUT", { status: "lost", lost_reason: reason ?? "Rejected" });
}

/** Add note to a deal */
async function addNote(dealId: number, content: string) {
  return pd("/notes", "POST", { deal_id: dealId, content });
}

// ─── GET — sync queue status ───────────────────────────────────────────────

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
    pipedrive_configured: configured(),
    architecture: "live",
  });
}

// ─── POST — queue + live sync ──────────────────────────────────────────────

export async function POST(req: Request) {
  try {
    const body = await req.json() as {
      entity_type: string;
      entity_id: string;
      operation: "create" | "update" | "delete" | "status_change";
      payload?: Record<string, unknown>;
    };

    const sb = supabaseAdmin();
    let crmResult: Record<string, unknown> = {};
    let syncStatus = "pending";

    if (configured()) {
      try {
        crmResult = await dispatchToPipedrive(body.entity_type, body.entity_id, body.operation, body.payload ?? {}, sb);
        syncStatus = "synced";
      } catch (err) {
        console.error("[CRM sync error]", err);
        syncStatus = "failed";
        crmResult = { error: err instanceof Error ? err.message : "sync failed" };
      }
    }

    // Queue entry (always — audit trail)
    const { data: queued } = await sb
      .from("crm_sync_queue" as "companies")
      .insert({
        entity_type: body.entity_type,
        entity_id: body.entity_id,
        operation: body.operation,
        crm_provider: "pipedrive",
        crm_entity_type: body.entity_type === "company" ? "organization" : "deal",
        payload: { ...body.payload, ...crmResult },
        status: syncStatus,
        attempts: configured() ? 1 : 0,
      } as unknown as Record<string, unknown>)
      .select()
      .single();

    await recordAudit({
      action: `crm.${body.operation}`,
      entity_type: body.entity_type,
      entity_id: body.entity_id,
      metadata: { crm_provider: "pipedrive", sync_status: syncStatus, ...crmResult },
    });

    return NextResponse.json({
      queued: true,
      job: queued,
      live_sync: configured(),
      sync_status: syncStatus,
      pipedrive_result: crmResult,
      message: syncStatus === "synced"
        ? "Synced to Pipedrive ✓"
        : syncStatus === "failed"
          ? `Queued (sync failed: ${crmResult.error})`
          : "Queued — add PIPEDRIVE_API_KEY to activate live sync",
    });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "CRM sync failed" }, { status: 500 });
  }
}

// ─── PATCH — retry / flush queue ──────────────────────────────────────────

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
      if (configured()) {
        try {
          const result = await dispatchToPipedrive(
            job.entity_type as string,
            job.entity_id as string,
            job.operation as "create" | "update" | "delete" | "status_change",
            (job.payload as Record<string, unknown>) ?? {},
            sb
          );
          await sb.from("crm_sync_queue" as "companies")
            .update({ status: "synced", attempts: ((job.attempts as number) ?? 0) + 1, payload: { ...(job.payload as Record<string,unknown>), pipedrive_result: result } } as unknown as Record<string, unknown>)
            .eq("id", job.id as string);
          succeeded++;
        } catch {
          await sb.from("crm_sync_queue" as "companies")
            .update({ status: "failed", attempts: ((job.attempts as number) ?? 0) + 1 } as unknown as Record<string, unknown>)
            .eq("id", job.id as string);
          failed++;
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

// ─── Dispatch logic ────────────────────────────────────────────────────────

async function dispatchToPipedrive(
  entityType: string,
  entityId: string,
  operation: string,
  payload: Record<string, unknown>,
  sb: ReturnType<typeof supabaseAdmin>
): Promise<Record<string, unknown>> {

  // ── COMPANY CREATE → Organization ────────────────────────────────────────
  if (entityType === "company" && operation === "create") {
    const orgId = await upsertOrganization({
      name: payload.company_name as string,
      website: payload.website as string | undefined,
      industry: payload.industry as string | undefined,
      segment: payload.segment as string | undefined,
      city: payload.city as string | undefined,
    });

    // Persist Pipedrive org ID back to DB
    // Try dedicated column first, fall back to full_intelligence JSONB
    try {
      await sb.from("companies")
        .update({ pipedrive_org_id: orgId, pipedrive_synced_at: new Date().toISOString() } as unknown as Record<string, unknown>)
        .eq("id", entityId);
    } catch {
      // Column may not exist yet — store in full_intelligence as fallback
      const { data: existing } = await sb.from("companies").select("full_intelligence").eq("id", entityId).maybeSingle();
      const intel = (existing?.full_intelligence ?? {}) as Record<string, unknown>;
      await sb.from("companies").update({
        full_intelligence: { ...intel, pipedrive_org_id: orgId, pipedrive_synced_at: new Date().toISOString() },
      }).eq("id", entityId);
    }

    return { pipedrive_org_id: orgId, action: "organization_created" };
  }

  // ── PROPOSAL CREATE → Deal ────────────────────────────────────────────────
  if (entityType === "proposal" && (operation === "create" || operation === "update")) {
    // Get proposal + company from DB
    const { data: proposal } = await sb
      .from("proposals")
      .select("*, companies(company_name, website, industry, segment, full_intelligence)")
      .eq("id", entityId)
      .maybeSingle();

    if (!proposal) throw new Error("Proposal not found");
    const p = proposal as Record<string, unknown>;
    const company = p.companies as Record<string, unknown> | null;

    // Get or create org — check full_intelligence.pipedrive_org_id as fallback
    const companyIntel = (company?.full_intelligence as Record<string, unknown>) ?? {};
    let orgId = companyIntel.pipedrive_org_id as number | undefined;
    if (!orgId && company?.company_name) {
      orgId = await upsertOrganization({
        name: company.company_name as string,
        website: company.website as string | undefined,
        industry: company.industry as string | undefined,
        segment: company.segment as string | undefined,
      });
      // Save org ID — try dedicated column, fallback to full_intelligence
      const companyId = (p.company_id as string) ?? entityId;
      try {
        await sb.from("companies")
          .update({ pipedrive_org_id: orgId } as unknown as Record<string, unknown>)
          .eq("id", companyId);
      } catch {
        const { data: ci } = await sb.from("companies").select("full_intelligence").eq("id", companyId).maybeSingle();
        const intel = ((ci as Record<string,unknown>)?.full_intelligence ?? {}) as Record<string, unknown>;
        await sb.from("companies").update({ full_intelligence: { ...intel, pipedrive_org_id: orgId } }).eq("id", companyId);
      }
    }

    // Get existing deal ID — check payload, then content JSONB fallback
    const contentJson = (p.content as Record<string, unknown>) ?? {};
    const existingDealId = payload.pipedrive_deal_id as number | undefined
      ?? (contentJson.pipedrive_deal_id as number | undefined);

    if (existingDealId && operation === "update") {
      // Update stage
      const pipelineId = proposalTypeToPipeline(p.proposal_type as string);
      await updateDealStage(existingDealId, p.status as string, pipelineId);
      return { pipedrive_deal_id: existingDealId, action: "deal_stage_updated" };
    }

    // Create new deal
    const dealTitle = `${company?.company_name ?? "Unknown"} — ${p.title ?? "Proposta"}`;
    const totalValue = extractProposalValue(p);
    const { id: dealId, pipeline_id } = await createDeal({
      title: dealTitle,
      orgId: orgId ?? 0,
      value: totalValue,
      proposalType: p.proposal_type as string,
      status: p.status as string,
    });

    // Add proposal link as note
    await addNote(dealId,
      `📄 Proposta gerada pela plataforma\n\nTítulo: ${p.title}\nStatus: ${p.status}\nLink: ${process.env.NEXT_PUBLIC_APP_URL ?? "https://localhost:3000"}/proposals/${entityId}`
    );

    // Save deal ID back to DB
    // Try dedicated column first, fall back to proposal content JSONB
    try {
      await sb.from("proposals")
        .update({ pipedrive_deal_id: dealId, pipedrive_pipeline_id: pipeline_id, pipedrive_synced_at: new Date().toISOString() } as unknown as Record<string, unknown>)
        .eq("id", entityId);
    } catch {
      // Columns may not exist yet — store in content JSONB
      const { data: existing } = await (sb as any).from("proposals").select("content").eq("id", entityId).maybeSingle();
      const content = (existing?.content ?? {}) as Record<string, unknown>;
      await (sb as any).from("proposals").update({
        content: { ...content, pipedrive_deal_id: dealId, pipedrive_pipeline_id: pipeline_id },
      }).eq("id", entityId);
    }

    return { pipedrive_deal_id: dealId, pipedrive_pipeline_id: pipeline_id, action: "deal_created" };
  }

  // ── PROPOSAL STATUS CHANGE → Update Deal Stage ───────────────────────────
  if (entityType === "proposal" && operation === "status_change") {
    const dealId = payload.pipedrive_deal_id as number;
    const newStatus = payload.new_status as string;
    const pipelineId = (payload.pipedrive_pipeline_id as number) ?? PIPELINE.PATROCINIOS;

    if (!dealId) {
      // No deal yet — create it
      return dispatchToPipedrive("proposal", entityId, "create", payload, sb);
    }

    if (newStatus === "sent") {
      await updateDealStage(dealId, "sent", pipelineId);
      await addNote(dealId, `✅ Proposta aprovada e enviada ao prospect em ${new Date().toLocaleDateString("pt-BR")}`);
    } else if (newStatus === "rejected") {
      await markDealLost(dealId, payload.status_reason as string | undefined);
    } else if (newStatus === "approved") {
      await updateDealStage(dealId, "approved", pipelineId);
    } else {
      await updateDealStage(dealId, newStatus, pipelineId);
    }

    return { pipedrive_deal_id: dealId, action: "deal_updated", new_status: newStatus };
  }

  return { mock: true, entity_type: entityType, entity_id: entityId, operation };
}

// Extract total value from proposal pricing tiers
function extractProposalValue(proposal: Record<string, unknown>): number {
  try {
    const tiers = proposal.pricing_tiers as Array<Record<string, unknown>> | undefined;
    if (tiers?.length) {
      // Return the first (lowest) tier value
      const sorted = [...tiers].sort((a, b) => Number(a.price ?? 0) - Number(b.price ?? 0));
      return Number(sorted[0]?.price ?? 0);
    }
    const content = proposal.content as Record<string, unknown> | undefined;
    if (content?.investment_note) {
      // Try to parse BRL value from text like "R$ 50.000"
      const match = String(content.investment_note).match(/R\$\s*([\d.,]+)/);
      if (match) return parseFloat(match[1].replace(/\./g, "").replace(",", "."));
    }
  } catch { /* ignore */ }
  return 0;
}
