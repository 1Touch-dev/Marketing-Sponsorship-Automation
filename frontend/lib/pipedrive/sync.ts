/**
 * Coritiba FC — Pipedrive CRM sync (server-side only).
 * Call enqueueCrmSync() from API routes — never fetch /api/crm (middleware blocks it).
 */
import { supabaseAdmin } from "@/lib/supabase/server";
import { recordAudit } from "@/lib/audit/log";

const PIPEDRIVE_BASE = "https://api.pipedrive.com/v1";

export const PIPELINE = {
  COUTO_PEREIRA: 1,
  MIDIAS: 2,
  PATROCINIOS: 3,
  LICENCIAMENTO: 4,
  LEI_INCENTIVO: 5,
} as const;

const STAGE_PATROCINIOS = {
  CONTATAR_LEAD: 18,
  DIAGNOSTICO: 19,
  ELABORAR_PROPOSTA: 21,
  NEGOCIACAO: 20,
  CONTRATO: 24,
} as const;

const ORIGEM_LEAD_FIELD = "fbd322ead72aa689d82c6eec5a4df360273c4925";
const SEGMENTO_FIELD = "fc019522db954595f0499113720ee6c7c54ef093";
const CIDADE_FIELD = "1ad2a9e5a3e9a69189ac4ce35b7b2cd7ab04bf0e";

export type CrmOperation = "create" | "update" | "delete" | "status_change";

const apiKey = () => process.env.PIPEDRIVE_API_KEY ?? "";

export function isPipedriveConfigured(): boolean {
  return !!process.env.PIPEDRIVE_API_KEY;
}

function appBaseUrl(): string {
  return (
    process.env.APP_URL ??
    process.env.NEXT_PUBLIC_APP_URL ??
    "http://localhost:3000"
  );
}

export function proposalTypeToPipeline(proposalType?: string): number {
  if (!proposalType) return PIPELINE.PATROCINIOS;
  const t = proposalType.toLowerCase();
  if (t.includes("lei") || t.includes("incentivo")) return PIPELINE.LEI_INCENTIVO;
  if (t.includes("midia") || t.includes("media") || t.includes("digital")) return PIPELINE.MIDIAS;
  if (t.includes("licencia") || t.includes("varejo")) return PIPELINE.LICENCIAMENTO;
  if (t.includes("evento") || t.includes("couto")) return PIPELINE.COUTO_PEREIRA;
  return PIPELINE.PATROCINIOS;
}

export function statusToStage(status: string, pipelineId: number): number {
  if (pipelineId === PIPELINE.PATROCINIOS) {
    if (status === "draft" || status === "under_review") return STAGE_PATROCINIOS.ELABORAR_PROPOSTA;
    if (status === "approved" || status === "sent") return STAGE_PATROCINIOS.NEGOCIACAO;
    return STAGE_PATROCINIOS.CONTATAR_LEAD;
  }
  return pipelineId === PIPELINE.LEI_INCENTIVO ? 33
    : pipelineId === PIPELINE.MIDIAS ? 11
    : pipelineId === PIPELINE.LICENCIAMENTO ? 26
    : STAGE_PATROCINIOS.CONTATAR_LEAD;
}

async function pd(path: string, method = "GET", body?: unknown) {
  const sep = path.includes("?") ? "&" : "?";
  const url = `${PIPEDRIVE_BASE}${path}${sep}api_token=${apiKey()}`;
  const opts: RequestInit = { method, headers: { "Content-Type": "application/json" } };
  if (body) opts.body = JSON.stringify(body);
  const res = await fetch(url, opts);
  const json = await res.json();
  if (!res.ok) {
    const msg = json.error ?? json.error_info ?? `Pipedrive HTTP ${res.status}`;
    throw new Error(typeof msg === "string" ? msg : JSON.stringify(msg));
  }
  return json;
}

async function findOrg(name: string): Promise<number | null> {
  const data = await pd(`/organizations/search?term=${encodeURIComponent(name)}&limit=5`);
  const items = (data.data?.items ?? []) as Array<{ item: { id: number; name: string } }>;
  if (items.length > 0) return items[0].item.id;
  return null;
}

async function upsertOrganization(payload: {
  name: string;
  website?: string;
  industry?: string;
  segment?: string;
  city?: string;
}): Promise<number> {
  const existing = await findOrg(payload.name);
  const fields: Record<string, unknown> = {
    [ORIGEM_LEAD_FIELD]: "Plataforma",
    ...(payload.segment ? { [SEGMENTO_FIELD]: payload.segment } : {}),
    ...(payload.city ? { [CIDADE_FIELD]: payload.city } : {}),
    ...(payload.website ? { website: payload.website } : {}),
  };

  if (existing) {
    await pd(`/organizations/${existing}`, "PUT", fields);
    return existing;
  }

  const result = await pd("/organizations", "POST", {
    name: payload.name,
    visible_to: "3",
    ...fields,
  });
  return result.data?.id as number;
}

async function createDeal(payload: {
  title: string;
  orgId: number;
  value?: number;
  proposalType?: string;
  status?: string;
}): Promise<{ id: number; pipeline_id: number }> {
  const pipelineId = proposalTypeToPipeline(payload.proposalType);
  const stageId = statusToStage(payload.status ?? "draft", pipelineId);

  const result = await pd("/deals", "POST", {
    title: payload.title,
    org_id: payload.orgId,
    pipeline_id: pipelineId,
    stage_id: stageId,
    value: payload.value ?? 0,
    currency: "BRL",
    visible_to: "3",
  });
  return { id: result.data?.id as number, pipeline_id: pipelineId };
}

async function updateDealStage(dealId: number, status: string, pipelineId: number) {
  const stageId = statusToStage(status, pipelineId);
  return pd(`/deals/${dealId}`, "PUT", { stage_id: stageId });
}

async function markDealLost(dealId: number, reason?: string) {
  return pd(`/deals/${dealId}`, "PUT", { status: "lost", lost_reason: reason ?? "Rejected" });
}

async function addNote(dealId: number, content: string) {
  return pd("/notes", "POST", { deal_id: dealId, content });
}

function extractProposalValue(proposal: Record<string, unknown>): number {
  try {
    const tiers = proposal.pricing_tiers as Array<Record<string, unknown>> | undefined;
    if (tiers?.length) {
      const sorted = [...tiers].sort((a, b) => Number(a.price ?? 0) - Number(b.price ?? 0));
      return Number(sorted[0]?.price ?? 0);
    }
    const content = proposal.content as Record<string, unknown> | undefined;
    if (content?.investment_note) {
      const match = String(content.investment_note).match(/R\$\s*([\d.,]+)/);
      if (match) return parseFloat(match[1].replace(/\./g, "").replace(",", "."));
    }
  } catch { /* ignore */ }
  return 0;
}

async function persistCompanyOrgId(
  sb: ReturnType<typeof supabaseAdmin>,
  companyId: string,
  orgId: number,
) {
  const { error } = await sb.from("companies")
    .update({ pipedrive_org_id: orgId, pipedrive_synced_at: new Date().toISOString() } as unknown as Record<string, unknown>)
    .eq("id", companyId);

  if (error) {
    const { data: existing } = await sb.from("companies").select("full_intelligence").eq("id", companyId).maybeSingle();
    const intel = (existing?.full_intelligence ?? {}) as Record<string, unknown>;
    await sb.from("companies").update({
      full_intelligence: { ...intel, pipedrive_org_id: orgId, pipedrive_synced_at: new Date().toISOString() },
    }).eq("id", companyId);
  }
}

async function persistProposalDealId(
  sb: ReturnType<typeof supabaseAdmin>,
  proposalId: string,
  dealId: number,
  pipelineId: number,
) {
  const { error } = await sb.from("proposals")
    .update({
      pipedrive_deal_id: dealId,
      pipedrive_pipeline_id: pipelineId,
      pipedrive_synced_at: new Date().toISOString(),
    } as unknown as Record<string, unknown>)
    .eq("id", proposalId);

  if (error) {
    const { data: existing } = await sb.from("proposals").select("content").eq("id", proposalId).maybeSingle();
    const content = (existing?.content ?? {}) as Record<string, unknown>;
    await sb.from("proposals").update({
      content: { ...content, pipedrive_deal_id: dealId, pipedrive_pipeline_id: pipelineId },
    }).eq("id", proposalId);
  }
}

export async function dispatchToPipedrive(
  entityType: string,
  entityId: string,
  operation: string,
  payload: Record<string, unknown>,
  sb: ReturnType<typeof supabaseAdmin> = supabaseAdmin(),
): Promise<Record<string, unknown>> {

  if (entityType === "company" && operation === "create") {
    const orgId = await upsertOrganization({
      name: payload.company_name as string,
      website: payload.website as string | undefined,
      industry: payload.industry as string | undefined,
      segment: payload.segment as string | undefined,
      city: payload.city as string | undefined,
    });
    await persistCompanyOrgId(sb, entityId, orgId);
    return { pipedrive_org_id: orgId, action: "organization_created" };
  }

  if (entityType === "proposal" && (operation === "create" || operation === "update")) {
    const { data: proposal } = await sb
      .from("proposals")
      .select("*, companies(company_name, website, industry, segment, full_intelligence, pipedrive_org_id)")
      .eq("id", entityId)
      .maybeSingle();

    if (!proposal) throw new Error("Proposal not found");
    const p = proposal as Record<string, unknown>;
    const company = p.companies as Record<string, unknown> | null;
    const companyIntel = (company?.full_intelligence as Record<string, unknown>) ?? {};
    const companyId = p.company_id as string;

    let orgId =
      (company?.pipedrive_org_id as number | undefined) ??
      (companyIntel.pipedrive_org_id as number | undefined);

    if (!orgId && company?.company_name) {
      orgId = await upsertOrganization({
        name: company.company_name as string,
        website: company.website as string | undefined,
        industry: company.industry as string | undefined,
        segment: company.segment as string | undefined,
      });
      if (companyId) await persistCompanyOrgId(sb, companyId, orgId);
    }

    const contentJson = (p.content as Record<string, unknown>) ?? {};
    const existingDealId =
      (p.pipedrive_deal_id as number | undefined) ??
      (payload.pipedrive_deal_id as number | undefined) ??
      (contentJson.pipedrive_deal_id as number | undefined);

    const pipelineId =
      (p.pipedrive_pipeline_id as number | undefined) ??
      (contentJson.pipedrive_pipeline_id as number | undefined) ??
      proposalTypeToPipeline(p.proposal_type as string);

    if (existingDealId) {
      await updateDealStage(existingDealId, (p.status as string) ?? "draft", pipelineId);
      return { pipedrive_deal_id: existingDealId, pipedrive_pipeline_id: pipelineId, action: "deal_stage_updated" };
    }

    if (!orgId) throw new Error("Cannot create Pipedrive deal without organization");

    const dealTitle = `${company?.company_name ?? "Unknown"} — ${p.title ?? "Proposta"}`;
    const { id: dealId, pipeline_id } = await createDeal({
      title: dealTitle,
      orgId,
      value: extractProposalValue(p),
      proposalType: p.proposal_type as string,
      status: p.status as string,
    });

    await addNote(
      dealId,
      `📄 Proposta gerada pela plataforma\n\nTítulo: ${p.title}\nStatus: ${p.status}\nLink: ${appBaseUrl()}/proposals/${entityId}`,
    );

    await persistProposalDealId(sb, entityId, dealId, pipeline_id);
    return { pipedrive_deal_id: dealId, pipedrive_pipeline_id: pipeline_id, pipedrive_org_id: orgId, action: "deal_created" };
  }

  if (entityType === "proposal" && operation === "status_change") {
    const dealId =
      (payload.pipedrive_deal_id as number | undefined) ??
      (await resolveProposalPipedriveIds(sb, entityId)).dealId;

    const newStatus = payload.new_status as string;
    const pipelineId = (payload.pipedrive_pipeline_id as number) ?? PIPELINE.PATROCINIOS;

    if (!dealId) {
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

/** Resolve Pipedrive deal/org IDs for a proposal (columns + JSONB fallbacks). */
export async function resolveProposalPipedriveIds(
  sb: ReturnType<typeof supabaseAdmin>,
  proposalId: string,
): Promise<{ dealId: number | null; orgId: number | null; pipelineId: number | null }> {
  const { data: proposal } = await sb
    .from("proposals")
    .select("pipedrive_deal_id, pipedrive_pipeline_id, content, companies(pipedrive_org_id, full_intelligence)")
    .eq("id", proposalId)
    .maybeSingle();

  if (!proposal) return { dealId: null, orgId: null, pipelineId: null };

  const p = proposal as Record<string, unknown>;
  const content = (p.content as Record<string, unknown>) ?? {};
  const company = p.companies as Record<string, unknown> | null;
  const intel = (company?.full_intelligence as Record<string, unknown>) ?? {};

  return {
    dealId: (p.pipedrive_deal_id as number) ?? (content.pipedrive_deal_id as number) ?? null,
    orgId: (company?.pipedrive_org_id as number) ?? (intel.pipedrive_org_id as number) ?? null,
    pipelineId: (p.pipedrive_pipeline_id as number) ?? (content.pipedrive_pipeline_id as number) ?? null,
  };
}

/** Queue + live sync (no HTTP). Safe to call fire-and-forget from API routes. */
export async function enqueueCrmSync(args: {
  entity_type: string;
  entity_id: string;
  operation: CrmOperation;
  payload?: Record<string, unknown>;
}): Promise<{ sync_status: string; result: Record<string, unknown> }> {
  const sb = supabaseAdmin();
  let crmResult: Record<string, unknown> = {};
  let syncStatus = "pending";

  if (isPipedriveConfigured()) {
    try {
      crmResult = await dispatchToPipedrive(
        args.entity_type,
        args.entity_id,
        args.operation,
        args.payload ?? {},
        sb,
      );
      syncStatus = "synced";
    } catch (err) {
      console.error("[CRM sync error]", err);
      syncStatus = err instanceof Error && err.message === "Proposal not found" ? "skipped" : "failed";
      crmResult = { error: err instanceof Error ? err.message : "sync failed" };
    }
  }

  await sb.from("crm_sync_queue" as "companies").insert({
    entity_type: args.entity_type,
    entity_id: args.entity_id,
    operation: args.operation,
    crm_provider: "pipedrive",
    crm_entity_type: args.entity_type === "company" ? "organization" : "deal",
    payload: { ...args.payload, ...crmResult },
    status: syncStatus,
    attempts: isPipedriveConfigured() ? 1 : 0,
  } as unknown as Record<string, unknown>);

  await recordAudit({
    action: `crm.${args.operation}`,
    entity_type: args.entity_type,
    entity_id: args.entity_id,
    metadata: { crm_provider: "pipedrive", sync_status: syncStatus, ...crmResult },
  });

  return { sync_status: syncStatus, result: crmResult };
}
