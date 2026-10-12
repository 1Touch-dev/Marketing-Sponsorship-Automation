import { isMissingMigration } from "../proposals/revision-store";
import type { WriteResult } from "../accounts/store";

type Sb = any;

/**
 * A match on an obligation (migration 0074). It only lets delivery work be grouped around a match; it moves no date, because
 * how sold items are dated (the contract end date, or dates of their own) is still James's decision (T16-02).
 *
 * The link is read on its own rather than as part of the obligation's columns, so the obligation list keeps working on a
 * database where 0074 has not been applied.
 */
export interface MatchSummary { id: string; opponent: string; match_date: string; competition: string | null; home_away: string }

const chunks = <T,>(xs: T[], n = 100) => Array.from({ length: Math.ceil(xs.length / n) }, (_, i) => xs.slice(i * n, i * n + n));

export async function loadMatchLinks(sb: Sb, tenantId: string, obligationIds: string[]): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  for (const part of chunks(obligationIds)) {
    const { data, error } = await sb.from("obligations").select("id, match_id").eq("tenant_id", tenantId).in("id", part);
    if (error) return out; // not set up yet: nothing is linked
    for (const r of (data ?? []) as Array<{ id: string; match_id: string | null }>) if (r.match_id) out.set(r.id, r.match_id);
  }
  return out;
}

export async function loadMatches(sb: Sb, matchIds: string[]): Promise<Map<string, MatchSummary>> {
  const out = new Map<string, MatchSummary>();
  const ids = Array.from(new Set(matchIds));
  for (const part of chunks(ids)) {
    const { data } = await sb.from("matches").select("id, opponent, match_date, competition, home_away").in("id", part);
    for (const m of (data ?? []) as MatchSummary[]) out.set(m.id, m);
  }
  return out;
}

/** Puts an obligation under a match, or takes it out from under one (null). */
export async function setObligationMatch(sb: Sb, tenantId: string, obligationId: string, matchId: string | null): Promise<WriteResult<{ id: string; match_id: string | null }>> {
  if (matchId) {
    const { data: m, error } = await sb.from("matches").select("id").eq("id", matchId).maybeSingle();
    if (error) return { ok: false, status: 500, error: error.message };
    if (!m) return { ok: false, status: 404, error: "Match not found" };
  }
  const { data, error } = await sb.from("obligations").update({ match_id: matchId }).eq("id", obligationId).eq("tenant_id", tenantId).select("id").maybeSingle();
  if (error) return isMissingMigration(error) ? { ok: false, status: 503, error: "Matches on obligations are not set up yet (migration 0074)." } : { ok: false, status: 500, error: error.message };
  if (!data) return { ok: false, status: 404, error: "Obligation not found" };
  return { ok: true, value: { id: obligationId, match_id: matchId } };
}

export interface MatchGroup<T> { match: MatchSummary | null; obligations: T[] }

/** Obligations grouped under their match, soonest match first; the ones with no match come last. */
export function groupByMatch<T extends { id: string; match_id?: string | null }>(obligations: T[], matches: Map<string, MatchSummary>): Array<MatchGroup<T>> {
  const groups = new Map<string, MatchGroup<T>>();
  const none: T[] = [];
  for (const o of obligations) {
    const m = o.match_id ? matches.get(o.match_id) : undefined;
    if (!m) { none.push(o); continue; }
    if (!groups.has(m.id)) groups.set(m.id, { match: m, obligations: [] });
    groups.get(m.id)!.obligations.push(o);
  }
  const ordered = [...groups.values()].sort((a, b) => (a.match!.match_date < b.match!.match_date ? -1 : a.match!.match_date > b.match!.match_date ? 1 : 0));
  return none.length > 0 ? [...ordered, { match: null, obligations: none }] : ordered;
}
