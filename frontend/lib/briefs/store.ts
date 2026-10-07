import { isMissingMigration } from "../proposals/revision-store";
import type { WriteResult } from "../accounts/store";
import { briefPromptBlock, cleanBrief, evaluateGate, gateMessage, validateBrief, type BriefInput, type BriefRow, type GateResult } from "./model";

type Sb = any;

const COLUMNS =
  "id, level, author_email, objective, period_start, period_end, contact_name, contact_email, next_action, next_action_due, why_sponsor, why_package, evidence, unverified, opportunity_id, research_id, created_at";

export async function saveBrief(sb: Sb, tenantId: string, companyId: string, input: BriefInput, authorEmail: string): Promise<WriteResult<{ id: string }>> {
  if (!authorEmail) return { ok: false, status: 403, error: "A brief has to be written by a signed-in person: the buyer's objective comes from a conversation, not a model." };
  const bad = validateBrief(input);
  if (bad) return { ok: false, status: 400, error: bad };
  const { data: company } = await sb.from("companies").select("id").eq("id", companyId).eq("tenant_id", tenantId).maybeSingle();
  if (!company) return { ok: false, status: 404, error: "Company not found" };

  const { data, error } = await sb
    .from("proposal_briefs")
    .insert({ tenant_id: tenantId, company_id: companyId, author_email: authorEmail, ...cleanBrief(input) })
    .select("id")
    .single();
  if (error) return { ok: false, status: isMissingMigration(error) ? 503 : 500, error: isMissingMigration(error) ? "Briefs are not set up yet (migration 0060)." : error.message };
  return { ok: true, value: { id: data.id } };
}

export async function listBriefs(sb: Sb, tenantId: string, companyId: string): Promise<WriteResult<BriefRow[]>> {
  const { data, error } = await sb.from("proposal_briefs").select(COLUMNS).eq("tenant_id", tenantId).eq("company_id", companyId).order("created_at", { ascending: false });
  if (error) return { ok: false, status: isMissingMigration(error) ? 503 : 500, error: isMissingMigration(error) ? "Briefs are not set up yet (migration 0060)." : error.message };
  return { ok: true, value: (data ?? []) as BriefRow[] };
}

export interface GateCheck extends GateResult {
  /** False when briefs are not set up yet: nobody can write one, so generation is not blocked. */
  enforced: boolean;
  brief: BriefRow | null;
  message: string | null;
}

export async function checkDiscoveryGate(sb: Sb, tenantId: string, companyId: string, companyName: string, now: Date = new Date()): Promise<GateCheck> {
  const res = await listBriefs(sb, tenantId, companyId);
  if (!res.ok) {
    if (res.status === 503) return { ok: true, enforced: false, level: null, missing: [], briefId: null, brief: null, message: null };
    // Any other failure to read must not silently open the gate.
    return { ok: false, enforced: true, level: null, missing: [`the brief could not be read (${res.error})`], briefId: null, brief: null, message: `Could not check the buyer brief for ${companyName}: ${res.error}` };
  }
  const brief = res.value[0] ?? null;
  const gate = evaluateGate(brief, now);
  return { ...gate, enforced: true, brief, message: gate.ok ? null : gateMessage(companyName, companyId, gate) };
}

/** Thrown by code that generates proposals outside an HTTP route, so callers can answer with a 409. */
export class DiscoveryGateError extends Error {
  readonly code = "discovery_brief_required";
  readonly status = 409;
  constructor(message: string, readonly missing: string[]) {
    super(message);
  }
}

/** Marks which brief a proposal was generated from. Never throws. */
export async function linkBrief(sb: Sb, tenantId: string, proposalId: string, briefId: string | null): Promise<void> {
  if (!briefId) return;
  try {
    await sb.from("proposals").update({ brief_id: briefId }).eq("id", proposalId).eq("tenant_id", tenantId);
  } catch {
    /* the proposal is saved; the link is a record, not a requirement */
  }
}

export { briefPromptBlock };
