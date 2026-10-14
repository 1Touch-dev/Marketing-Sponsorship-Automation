import { findLink, linkExternal } from "../sync/external-refs";
import { isPipedriveConfigured, pdRequest } from "./client";
import { SYSTEM, type PushContext } from "./adapter";
import { logEvent, openAction } from "../integrations/log";

type Sb = any;

/**
 * Links the Pipedrive IDs this platform already holds (a column, or JSON on the proposal or company) to the records they
 * belong to, but only after asking Pipedrive whether each one still exists. Checked on 13 Oct 2026, none of the 44 stored deal
 * IDs existed there and all 35 stored organization IDs did (4 under a different name), so copying them blindly would have
 * made every later push of those proposals fail. This is the safe way in: a person runs it, it reads from Pipedrive, and it
 * changes nothing in Pipedrive.
 *
 *   • a deal ID that exists is linked; one that does not is reported and left unlinked (the next push creates a new deal);
 *   • an organization ID that exists AND has the same name as the company is linked; one under another name is listed for a
 *     person to decide, and one that does not exist is reported;
 *   • a company with no ID but an organization of exactly its name in Pipedrive is only SUGGESTED. Creating a second copy of
 *     an organization the club already has would be worse than linking none, so a person confirms each pair (`link`).
 *
 * `apply: false` (the default) only reports. Reads are spaced to stay within Pipedrive's rate limit.
 */
export interface LinkReport {
  dry_run: boolean;
  deals: { checked: number; linked: number; missing: Array<{ proposal_id: string; pipedrive_deal_id: number }> };
  organizations: {
    checked: number; linked: number;
    name_differs: Array<{ company_id: string; company_name: string; pipedrive_org_id: number; pipedrive_name: string }>;
    missing: Array<{ company_id: string; company_name: string; pipedrive_org_id: number }>;
  };
  suggestions: Array<{ company_id: string; company_name: string; pipedrive_org_id: number; pipedrive_name: string }>;
  confirmed: Array<{ company_id: string; pipedrive_org_id: number; linked: boolean; reason?: string }>;
  stopped_early: boolean;
  problems: string[];
}

const norm = (s: string | null | undefined) => (s ?? "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, " ").trim();
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const asId = (v: unknown): number | null => { const n = Number(v); return Number.isInteger(n) && n > 0 ? n : null; };

export async function linkExisting(
  ctx: PushContext,
  opts: { apply?: boolean; suggest?: boolean; link?: Array<{ company_id: string; pipedrive_org_id: number }>; maxChecks?: number; pauseMs?: number } = {},
): Promise<LinkReport> {
  const { sb, tenantId } = ctx;
  const apply = opts.apply === true;
  const pause = opts.pauseMs ?? 120;
  const report: LinkReport = { dry_run: !apply, deals: { checked: 0, linked: 0, missing: [] }, organizations: { checked: 0, linked: 0, name_differs: [], missing: [] }, suggestions: [], confirmed: [], stopped_early: false, problems: [] };
  if (!isPipedriveConfigured()) { report.problems.push("No Pipedrive API key is set on this server."); return report; }
  let budget = opts.maxChecks ?? 150;
  const actionId = apply ? await openAction(sb, tenantId, SYSTEM, { operation: "backfill", entityType: "proposals", entityId: "link-existing", auth: { ...ctx.auth, basis: "backfill" } }) : null;
  const read = async (path: string) => { budget--; const r = await pdRequest("GET", path, undefined, ctx.http); await sleep(pause); return r; };

  // ── deals ──
  const { data: props } = await sb.from("proposals").select("*").eq("tenant_id", tenantId);
  for (const p of (props ?? []) as Array<Record<string, unknown> & { id: string }>) {
    const stored = asId(p.pipedrive_deal_id) ?? asId((p.content as Record<string, unknown> | null)?.pipedrive_deal_id);
    if (!stored) continue;
    const link = await findLink(sb, tenantId, SYSTEM, "proposals", p.id);
    if (link.ok && link.value) continue;
    if (budget <= 0) { report.stopped_early = true; break; }
    const r = await read(`/deals/${stored}`);
    report.deals.checked++;
    if (r.status === 404 || (r.ok && r.data?.deleted === true)) { report.deals.missing.push({ proposal_id: p.id, pipedrive_deal_id: stored }); await logEvent(sb, tenantId, SYSTEM, actionId, { entityType: "proposals", entityId: p.id, externalType: "deal", externalId: String(stored), operation: "backfill", outcome: "skipped", error: "Pipedrive does not have this deal ID, so it was not linked." }); continue; }
    if (!r.ok) { report.problems.push(`Deal ${stored}: ${r.error}`); continue; }
    if (apply) {
      const l = await linkExternal(sb, tenantId, { entityType: "proposals", entityId: p.id, system: SYSTEM, externalId: String(stored), actor: ctx.auth.by, externalType: "deal" });
      if (l.ok) { report.deals.linked++; await logEvent(sb, tenantId, SYSTEM, actionId, { entityType: "proposals", entityId: p.id, externalType: "deal", externalId: String(stored), operation: "backfill", outcome: "succeeded" }); }
      else report.problems.push(`Deal ${stored} could not be linked: ${l.error}`);
    } else report.deals.linked++;
  }

  // ── organizations whose ID we hold ──
  const { data: cos } = await sb.from("companies").select("*").eq("tenant_id", tenantId);
  const companies = (cos ?? []) as Array<Record<string, unknown> & { id: string; company_name: string }>;
  const unlinked: typeof companies = [];
  for (const c of companies) {
    const link = await findLink(sb, tenantId, SYSTEM, "companies", c.id);
    if (link.ok && link.value) continue;
    const stored = asId(c.pipedrive_org_id) ?? asId((c.full_intelligence as Record<string, unknown> | null)?.pipedrive_org_id);
    if (!stored) { unlinked.push(c); continue; }
    if (budget <= 0) { report.stopped_early = true; break; }
    const r = await read(`/organizations/${stored}`);
    report.organizations.checked++;
    if (r.status === 404 || (r.ok && r.data?.active_flag === false)) { report.organizations.missing.push({ company_id: c.id, company_name: c.company_name, pipedrive_org_id: stored }); continue; }
    if (!r.ok) { report.problems.push(`Organization ${stored}: ${r.error}`); continue; }
    const pdName = String(r.data?.name ?? "");
    if (norm(pdName) !== norm(c.company_name)) { report.organizations.name_differs.push({ company_id: c.id, company_name: c.company_name, pipedrive_org_id: stored, pipedrive_name: pdName }); continue; }
    if (apply) {
      const l = await linkExternal(sb, tenantId, { entityType: "companies", entityId: c.id, system: SYSTEM, externalId: String(stored), actor: ctx.auth.by, externalType: "organization" });
      if (l.ok) { report.organizations.linked++; await logEvent(sb, tenantId, SYSTEM, actionId, { entityType: "companies", entityId: c.id, externalType: "organization", externalId: String(stored), operation: "backfill", outcome: "succeeded" }); }
      else report.problems.push(`Organization ${stored} could not be linked: ${l.error}`);
    } else report.organizations.linked++;
  }

  // ── organizations a person confirms ──
  for (const pair of opts.link ?? []) {
    const c = companies.find((x) => x.id === pair.company_id);
    if (!c) { report.confirmed.push({ ...pair, linked: false, reason: "No such company." }); continue; }
    const r = await read(`/organizations/${pair.pipedrive_org_id}`);
    if (!r.ok) { report.confirmed.push({ ...pair, linked: false, reason: r.status === 404 ? "Pipedrive has no organization with that ID." : (r.error ?? "Could not check it.") }); continue; }
    if (!apply) { report.confirmed.push({ ...pair, linked: false, reason: "Dry run: nothing linked." }); continue; }
    const l = await linkExternal(sb, tenantId, { entityType: "companies", entityId: c.id, system: SYSTEM, externalId: String(pair.pipedrive_org_id), actor: ctx.auth.by, externalType: "organization" });
    report.confirmed.push({ ...pair, linked: l.ok, ...(l.ok ? {} : { reason: l.error }) });
    if (l.ok) await logEvent(sb, tenantId, SYSTEM, actionId, { entityType: "companies", entityId: c.id, externalType: "organization", externalId: String(pair.pipedrive_org_id), operation: "backfill", outcome: "succeeded", detail: { confirmed_by_person: true } });
  }

  // ── companies with no ID: an organization of exactly their name is only suggested ──
  if (opts.suggest && unlinked.length > 0 && budget > 0) {
    const byName = new Map<string, { id: number; name: string }>();
    for (let start = 0; budget > 0; ) {
      const r = await read(`/organizations?start=${start}&limit=500`);
      if (!r.ok) { report.problems.push(`Organization list: ${r.error}`); break; }
      for (const o of ((r.data?.items ?? []) as Array<{ id: number; name: string }>)) byName.set(norm(o.name), { id: o.id, name: o.name });
      const page = (r.extra?.pagination ?? {}) as { more_items_in_collection?: boolean; next_start?: number };
      if (!page.more_items_in_collection || page.next_start === undefined) break;
      start = page.next_start;
    }
    for (const c of unlinked) {
      const hit = byName.get(norm(c.company_name));
      if (hit) report.suggestions.push({ company_id: c.id, company_name: c.company_name, pipedrive_org_id: hit.id, pipedrive_name: hit.name });
    }
  }
  return report;
}
