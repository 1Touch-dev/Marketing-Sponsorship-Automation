import { agentActor, type Actor } from "@/lib/identity/actor";

type Sb = any;

export interface Authority {
  assignmentId: string | null;
  definitionId: string | null;
  versionId: string | null;
  version: number | null;
  maxCostUsd: number;
  scopeKind: string;
  grandfathered: boolean;
  /** true before migration 0070: there is nothing to check against yet, so the agent runs as it always did */
  legacy: boolean;
}

export type AuthorizeResult = { ok: true; authority: Authority } | { ok: false; status: number; error: string };

const isMissingFunction = (e: { code?: string; message?: string } | null) =>
  !!e && (e.code === "PGRST202" || e.code === "42883" || e.code === "PGRST205" || /could not find the function|does not exist|schema cache/i.test(e.message ?? ""));

const LEGACY: Authority = { assignmentId: null, definitionId: null, versionId: null, version: null, maxCostUsd: 1, scopeKind: "legacy", grandfathered: false, legacy: true };

/**
 * May this agent act on this company or campaign, for all of these effects, right now? Asked before an agent
 * starts, so a refusal costs nothing. Authority is never inferred from the agent merely existing: it comes from
 * an assignment that covers the scope and the effect, and a live version. Before migration 0070 there are no
 * assignments to check, so agents run as they always have.
 */
export async function authorizeAgent(sb: Sb, tenantId: string, agentKey: string, o: { companyId?: string | null; campaignId?: string | null; effects: string[] }): Promise<AuthorizeResult> {
  let best = null as Authority | null;
  for (const effect of o.effects) {
    const { data, error } = await sb.rpc("agent_assignment_for", { p_tenant: tenantId, p_key: agentKey, p_company: o.companyId ?? null, p_campaign: o.campaignId ?? null, p_effect: effect });
    if (error) {
      if (isMissingFunction(error)) return { ok: true, authority: LEGACY };
      return { ok: false, status: 500, error: `Could not check the ${agentKey} agent's authority: ${error.message}` };
    }
    const row = (Array.isArray(data) ? data[0] : data) as { assignment_id: string; definition_id: string; version_id: string; version: number; max_cost_usd: number | string; scope_kind: string; grandfathered: boolean } | undefined;
    if (!row) {
      const where = o.campaignId ? "this campaign" : o.companyId ? "this company" : "the workspace";
      return { ok: false, status: 403, error: `The ${agentKey} agent is not assigned "${effect}" for ${where}, or its assignment was revoked or has expired. An administrator can assign it.` };
    }
    const a: Authority = { assignmentId: row.assignment_id, definitionId: row.definition_id, versionId: row.version_id, version: Number(row.version), maxCostUsd: Number(row.max_cost_usd), scopeKind: row.scope_kind, grandfathered: row.grandfathered, legacy: false };
    best = best !== null ? Object.assign({}, best, { maxCostUsd: Math.min(best.maxCostUsd, a.maxCostUsd) }) : a;
  }
  return { ok: true, authority: best ?? LEGACY };
}

/** The agent as it is written to the audit log: its name and the version that was live. */
export function governedActor(agentKey: string, authority: Authority, o: { onBehalfOf?: string | null; runId?: string | null } = {}): Actor {
  return agentActor(agentKey, { version: authority.version, onBehalfOf: o.onBehalfOf ?? null, runId: o.runId ?? null });
}
