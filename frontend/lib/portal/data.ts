import type { WriteResult } from "../accounts/store";
import { listObligations } from "../obligations/store";
import { getIssued, listIssued } from "../recap/store";
import { getTenantById } from "../tenants/current";
import type { PortalContext } from "./guard";
import {
  SPONSOR_VISIBLE_CONTRACT_STATUSES, SPONSOR_VISIBLE_PROPOSAL_STATUSES,
  sponsorContract, sponsorObligation, sponsorPackages, sponsorProposal, sponsorRecap,
} from "./safe-view";

type Sb = any;
type Rec = Record<string, unknown>;

/**
 * What the sponsor portal serves. Every function takes the confirmed session (portal/guard.ts) and scopes EVERY query by
 * its tenant and company, whatever id the caller asked for: asking for another sponsor's record is "not found", the same
 * answer as for one that does not exist, so a sponsor cannot learn that someone else's record is there.
 */

const PROPOSAL_COLUMNS = "id, title, status, version, created_at, approved_at, share_token, expires_at, content, pricing_tiers, strategy_variants";
const CONTRACT_COLUMNS = "id, contract_number, title, status, deal_type, start_date, end_date, total_value_brl, signature_status";
const notFound = <T,>(what: string): WriteResult<T> => ({ ok: false, status: 404, error: `${what} not found` });
const dbError = <T,>(e: { message: string }): WriteResult<T> => ({ ok: false, status: 500, error: e.message });

export async function portalMe(sb: Sb, ctx: PortalContext): Promise<Rec> {
  const { data: company } = await sb.from("companies").select("id, company_name, logo_url, industry").eq("id", ctx.companyId).eq("tenant_id", ctx.tenantId).maybeSingle();
  const tenant = await getTenantById(ctx.tenantId).catch(() => null);
  return {
    company: company ? { id: company.id, name: company.company_name, logo_url: company.logo_url ?? null, industry: company.industry ?? null } : null,
    email: ctx.email,
    session_expires_at: new Date(ctx.expiresAt).toISOString(),
    club: tenant ? { name: tenant.club_facts.short_name ?? tenant.club_facts.club_name, crest_url: tenant.branding.crest_url ?? tenant.branding.logo_url ?? null, primary_color: tenant.branding.primary_color ?? null } : null,
  };
}

export async function portalProposals(sb: Sb, ctx: PortalContext): Promise<WriteResult<Rec[]>> {
  const { data, error } = await sb.from("proposals").select(PROPOSAL_COLUMNS).eq("tenant_id", ctx.tenantId).eq("company_id", ctx.companyId).in("status", [...SPONSOR_VISIBLE_PROPOSAL_STATUSES]).order("created_at", { ascending: false });
  if (error) return dbError(error);
  return { ok: true, value: ((data ?? []) as Rec[]).map(sponsorProposal) };
}

export async function portalProposal(sb: Sb, ctx: PortalContext, id: string): Promise<WriteResult<Rec>> {
  const { data, error } = await sb.from("proposals").select(PROPOSAL_COLUMNS).eq("id", id).eq("tenant_id", ctx.tenantId).eq("company_id", ctx.companyId).in("status", [...SPONSOR_VISIBLE_PROPOSAL_STATUSES]).maybeSingle();
  if (error) return dbError(error);
  if (!data) return notFound("Proposal");
  const { data: packages } = await sb.from("proposal_packages").select("id, name, description, price_brl, benefits, inventory_items, sort_order").eq("proposal_id", id).eq("active", true).order("sort_order", { ascending: true });
  return { ok: true, value: { ...sponsorProposal(data as Rec), packages: sponsorPackages(packages) } };
}

export async function portalContracts(sb: Sb, ctx: PortalContext): Promise<WriteResult<Rec[]>> {
  const { data, error } = await sb.from("contracts").select(CONTRACT_COLUMNS).eq("tenant_id", ctx.tenantId).eq("company_id", ctx.companyId).in("status", [...SPONSOR_VISIBLE_CONTRACT_STATUSES]).order("start_date", { ascending: false });
  if (error) return dbError(error);
  return { ok: true, value: ((data ?? []) as Rec[]).map(sponsorContract) };
}

/** The sold items and where each stands. The club's own onboarding steps are not part of what was sold, so they are not shown. */
export async function portalDelivery(sb: Sb, ctx: PortalContext): Promise<WriteResult<Rec[]>> {
  const contracts = await portalContracts(sb, ctx);
  if (!contracts.ok) return contracts;
  const visible = new Set(contracts.value.map((c) => c.id as string));
  const res = await listObligations(sb, ctx.tenantId, { companyId: ctx.companyId });
  if (!res.ok) return res.status === 503 ? { ok: true, value: [] } : res;
  return { ok: true, value: res.value.filter((o) => o.company_id === ctx.companyId && o.kind === "deliverable" && visible.has(o.contract_id)).map((o) => sponsorObligation(o as unknown as Rec)) };
}

export async function portalRecaps(sb: Sb, ctx: PortalContext): Promise<WriteResult<Rec[]>> {
  const res = await listIssued(sb, ctx.tenantId, { companyId: ctx.companyId });
  if (!res.ok) return res.status === 503 ? { ok: true, value: [] } : res;
  return { ok: true, value: res.value.filter((r) => r.company_id === ctx.companyId).map((r) => sponsorRecap(r as unknown as Rec)) };
}

export async function portalRecap(sb: Sb, ctx: PortalContext, id: string): Promise<WriteResult<Rec>> {
  const res = await getIssued(sb, ctx.tenantId, id);
  // another sponsor's recap, and one that does not exist, look the same
  if (!res.ok || res.value.company_id !== ctx.companyId) return notFound("Recap");
  return { ok: true, value: sponsorRecap(res.value as unknown as Rec, res.value.content) };
}
