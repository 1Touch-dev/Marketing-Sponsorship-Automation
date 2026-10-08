import { isMissingMigration } from "../proposals/revision-store";
import type { WriteResult } from "../accounts/store";
import { listObligations } from "../obligations/store";
import { listLines } from "../finance/store";
import { loadProof } from "../contracts/evidence-store";
import {
  assembleRecap, issueProblems, recapChecksum, recapPromptBlock, recommendRenewal,
  type Financial, type ObligationFact, type ReachRow, type Recap, type RenewalRecommendation,
} from "./model";

type Sb = any;

const notSetUp = "Sponsor recaps are not set up yet (migration 0067).";
const todayStr = () => new Date().toISOString().slice(0, 10);

async function loadFinancial(sb: Sb, tenantId: string, contractId: string): Promise<Financial> {
  const lines = await listLines(sb, tenantId, { contractId });
  if (!lines.ok) return { recorded: false, cash: { committed: 0, invoiced: 0, settled: 0 }, barter: { committed: 0, received: 0 }, savings_realized: 0, note: lines.status === 503 ? "Cash and barter accounting is not set up yet." : "Could not be read." };
  const live = lines.value.filter((l) => l.bucket === "contracted" || l.bucket === "invoiced" || l.bucket === "settled");
  const sum = (f: (l: (typeof live)[number]) => boolean, v: (l: (typeof live)[number]) => number) => Math.round(live.filter(f).reduce((s, l) => s + v(l), 0) * 100) / 100;
  return {
    recorded: lines.value.some((l) => l.bucket !== "voided"),
    cash: { committed: sum((l) => l.kind === "cash", (l) => l.amount_brl), invoiced: sum((l) => l.kind === "cash" && (l.bucket === "invoiced" || l.bucket === "settled"), (l) => l.amount_brl), settled: sum((l) => l.kind === "cash" && l.bucket === "settled", (l) => l.amount_brl) },
    barter: { committed: sum((l) => l.kind === "barter", (l) => l.amount_brl), received: sum((l) => l.kind === "barter" && l.bucket === "settled", (l) => l.amount_brl) },
    savings_realized: sum((l) => l.kind === "barter" && l.bucket === "settled" && l.club_reference_value !== null, (l) => l.club_reference_value ?? 0),
    note: "Recorded in the cash and barter ledger. Cash, barter and savings are separate measures and are not added together.",
  };
}

/** The recap as it stands now, derived from obligations, their proof, recorded reach and the ledger. Changes nothing. */
export async function buildRecap(sb: Sb, tenantId: string, contractId: string): Promise<WriteResult<Recap>> {
  const { data: c } = await sb.from("contracts").select("id, contract_number, title, company_id, start_date, end_date, status, proposal_id").eq("id", contractId).eq("tenant_id", tenantId).maybeSingle();
  if (!c) return { ok: false, status: 404, error: "Contract not found" };
  if (!c.company_id) return { ok: false, status: 409, error: "This contract is not linked to a company, so it cannot have a recap." };
  const today = todayStr();

  const obs = await listObligations(sb, tenantId, { contractId });
  if (!obs.ok) return obs.status === 503 ? { ok: false, status: 503, error: "Obligations are not set up yet (migration 0064), so there is nothing to reconcile." } : obs;
  const obligations: ObligationFact[] = obs.value.map((o) => ({
    id: o.id, title: o.title, kind: o.kind, quantity: o.quantity, unit: o.unit, allocation_id: o.allocation_id, due_date: o.due_date, owner_email: o.owner_email,
    status: o.status, proof: o.proof, moved: o.moved,
  }));

  // matches played during the contract, and the reach recorded for them
  let reach: ReachRow[] = [];
  let pastMatches: Array<{ id: string; opponent: string; match_date: string }> = [];
  if (c.start_date) {
    const until = c.end_date && c.end_date < today ? c.end_date : today;
    const { data: ms } = await sb.from("matches").select("id, match_date, opponent, match_media_reach(official_views, unofficial_fan_views, rival_account_views, media_tv_radio_views, source_notes)")
      .eq("tenant_id", tenantId).gte("match_date", c.start_date).lte("match_date", until);
    for (const m of (ms ?? []) as Array<Record<string, any>>) {
      pastMatches.push({ id: m.id, opponent: m.opponent, match_date: m.match_date });
      const r = Array.isArray(m.match_media_reach) ? m.match_media_reach[0] : m.match_media_reach;
      if (r) reach.push({ match_id: m.id, match_date: m.match_date, opponent: m.opponent, official_views: Number(r.official_views) || 0, unofficial_fan_views: Number(r.unofficial_fan_views) || 0, rival_account_views: Number(r.rival_account_views) || 0, media_tv_radio_views: Number(r.media_tv_radio_views) || 0, source_notes: r.source_notes ?? null });
    }
  }

  let variants: unknown = null;
  if (c.proposal_id) {
    const { data: p } = await sb.from("proposals").select("strategy_variants").eq("id", c.proposal_id).eq("tenant_id", tenantId).maybeSingle();
    variants = p?.strategy_variants ?? null;
  }

  let signature: Recap["signature"] = null;
  try {
    const proof = await loadProof(sb, tenantId, contractId);
    if (proof) signature = { stage: proof.proof.stage, label: proof.proof.label, verified: proof.proof.verified };
  } catch { /* the signature line is optional */ }

  return {
    ok: true,
    value: assembleRecap({
      contract: { id: c.id, contract_number: c.contract_number, title: c.title, company_id: c.company_id, start_date: c.start_date, end_date: c.end_date, status: c.status },
      today, obligations, reach, pastMatches, variants, financial: await loadFinancial(sb, tenantId, contractId), signature,
    }),
  };
}

export interface IssuedRecap {
  id: string; contract_id: string; company_id: string; version: number; status: string; gap_count: number; blocking_gap_count: number; gaps_acknowledged: boolean;
  acknowledgement: string | null; issued_by: string; issued_at: string; checksum: string; period_start: string | null; period_end: string | null;
}
const ISSUED = "id, contract_id, company_id, version, status, gap_count, blocking_gap_count, gaps_acknowledged, acknowledgement, issued_by, issued_at, checksum, period_start, period_end";

/**
 * Issues the recap as it stands: a numbered, immutable version with a checksum. A recap with gaps is
 * issued only against a written acknowledgement that they exist, and the gaps travel with it.
 */
export async function issueRecap(sb: Sb, tenantId: string, contractId: string, acknowledgement: string | null | undefined, actorEmail: string): Promise<WriteResult<IssuedRecap & { recap: Recap }>> {
  if (!actorEmail) return { ok: false, status: 403, error: "A signed-in person is required." };
  const built = await buildRecap(sb, tenantId, contractId);
  if (!built.ok) return built;
  const recap = built.value;
  const problems = issueProblems(recap, acknowledgement);
  if (problems.length > 0) return { ok: false, status: recap.status === "not_ready" ? 409 : 400, error: `Cannot issue this recap: ${problems.join("; ")}.` };

  const probe = await sb.from("sponsor_recaps").select("version").eq("contract_id", contractId).order("version", { ascending: false }).limit(1);
  if (probe.error) return isMissingMigration(probe.error) ? { ok: false, status: 503, error: notSetUp } : { ok: false, status: 500, error: probe.error.message };
  const version = ((probe.data?.[0] as { version?: number } | undefined)?.version ?? 0) + 1;

  const content = JSON.parse(JSON.stringify(recap));
  const { data, error } = await sb.from("sponsor_recaps").insert({
    tenant_id: tenantId, company_id: recap.contract.company_id, contract_id: contractId, version, status: recap.status === "not_ready" ? "in_progress" : recap.status,
    period_start: recap.contract.start_date, period_end: recap.contract.end_date, gap_count: recap.gap_count, blocking_gap_count: recap.blocking_gap_count,
    gaps_acknowledged: recap.gap_count > 0, acknowledgement: recap.gap_count > 0 ? acknowledgement!.trim() : null, issued_by: actorEmail, content, checksum: recapChecksum(content),
  }).select(ISSUED).single();
  if (error) {
    if (error.code === "23505") return { ok: false, status: 409, error: "Another version was issued at the same moment; try again." };
    return isMissingMigration(error) ? { ok: false, status: 503, error: notSetUp } : { ok: false, status: 500, error: error.message };
  }
  return { ok: true, value: { ...(data as IssuedRecap), recap } };
}

export async function listIssued(sb: Sb, tenantId: string, f: { contractId?: string | null; companyId?: string | null }): Promise<WriteResult<IssuedRecap[]>> {
  let q = sb.from("sponsor_recaps").select(ISSUED).eq("tenant_id", tenantId).order("issued_at", { ascending: false }).limit(200);
  if (f.contractId) q = q.eq("contract_id", f.contractId);
  if (f.companyId) q = q.eq("company_id", f.companyId);
  const { data, error } = await q;
  if (error) return isMissingMigration(error) ? { ok: false, status: 503, error: notSetUp } : { ok: false, status: 500, error: error.message };
  return { ok: true, value: (data ?? []) as IssuedRecap[] };
}

/** One issued version, with its content and a check that the stored content still matches its checksum. */
export async function getIssued(sb: Sb, tenantId: string, id: string): Promise<WriteResult<IssuedRecap & { content: Recap; intact: boolean }>> {
  const { data, error } = await sb.from("sponsor_recaps").select(`${ISSUED}, content`).eq("id", id).eq("tenant_id", tenantId).maybeSingle();
  if (error) return isMissingMigration(error) ? { ok: false, status: 503, error: notSetUp } : { ok: false, status: 500, error: error.message };
  if (!data) return { ok: false, status: 404, error: "Recap not found" };
  return { ok: true, value: { ...(data as IssuedRecap & { content: Recap }), intact: recapChecksum((data as { content: unknown }).content) === (data as { checksum: string }).checksum } };
}

/** The reading of the recap that a renewal draft is built from, with the text block handed to the model. */
export async function renewalBasis(sb: Sb, tenantId: string, contractId: string): Promise<WriteResult<{ recap: Recap; recommendation: RenewalRecommendation; promptBlock: string; checksum: string }>> {
  const built = await buildRecap(sb, tenantId, contractId);
  if (!built.ok) return built;
  const recommendation = recommendRenewal(built.value);
  return { ok: true, value: { recap: built.value, recommendation, promptBlock: recapPromptBlock(built.value, recommendation), checksum: recapChecksum(JSON.parse(JSON.stringify(built.value))) } };
}
