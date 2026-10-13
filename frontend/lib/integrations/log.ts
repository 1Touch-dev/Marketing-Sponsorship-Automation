import { isMissingMigration } from "../proposals/revision-store";

type Sb = any;

/**
 * The log of what was sent to an outside system and who was allowed to send it (migration 0075).
 *
 *   an ACTION  is written first: who authorised this push, and on what basis (a person approving a proposal, a person
 *              pressing sync, an agent run...). A push with no one to answer for it does not happen.
 *   an EVENT   is written after each call the push makes: what it did to which outside object, and how it ended.
 *
 * Both are append-only. Writing them never breaks the push they describe: on a database without the migration, the push
 * still runs and nothing is logged.
 */
export type Basis = "proposal_decision" | "proposal_status" | "proposal_created" | "company_created" | "manual_sync" | "scheduled_sync" | "retry" | "email_logged" | "sponsor_view" | "agent_run" | "record_deleted" | "backfill";

export interface Authorization {
  kind: "human" | "agent" | "service";
  /** the person's email, or the agent / service name */
  by: string;
  basis: Basis;
  /** the thing that gave the permission: the approval, the run, the email */
  ref?: string | null;
}

export type Operation = "push" | "remove_link" | "log_activity" | "backfill";
export type EventOperation = "create" | "update" | "link_removed" | "log_activity" | "backfill" | "check_key";
export type Outcome = "succeeded" | "failed" | "skipped";

export interface IntegrationEventInput {
  entityType: string;
  entityId: string;
  externalType?: string | null;
  externalId?: string | null;
  operation: EventOperation;
  outcome: Outcome;
  httpStatus?: number | null;
  error?: string | null;
  detail?: Record<string, unknown>;
  durationMs?: number | null;
}

const clip = (s: string | null | undefined) => (s ? s.replace(/api_token=[^&\s"']+/gi, "api_token=***").slice(0, 500) : null);

/** Records who is allowed to trigger this push. Null when the log is not set up yet; the push then runs unlogged. */
export async function openAction(sb: Sb, tenantId: string, system: string, i: { operation: Operation; entityType: string; entityId: string; auth: Authorization }): Promise<string | null> {
  if (!i.auth?.by?.trim()) throw new Error("A push to an outside system needs someone to answer for it (a person, an agent or a named service).");
  try {
    const { data, error } = await sb.from("integration_actions").insert({
      tenant_id: tenantId, system, operation: i.operation, entity_type: i.entityType, entity_id: i.entityId,
      basis: i.auth.basis, basis_ref: i.auth.ref ?? null, authorized_kind: i.auth.kind, authorized_by: i.auth.by,
    }).select("id").single();
    if (error) { if (!isMissingMigration(error)) console.error("[integration_actions]", error.message); return null; }
    return (data as { id: string }).id;
  } catch {
    return null;
  }
}

export async function logEvent(sb: Sb, tenantId: string, system: string, actionId: string | null, e: IntegrationEventInput): Promise<void> {
  if (!actionId) return;
  try {
    const { error } = await sb.from("integration_events").insert({
      tenant_id: tenantId, action_id: actionId, system, entity_type: e.entityType, entity_id: e.entityId,
      external_type: e.externalType ?? null, external_id: e.externalId ?? null, operation: e.operation, outcome: e.outcome,
      http_status: e.httpStatus ?? null, error: clip(e.error), detail: e.detail ?? {}, duration_ms: e.durationMs ?? null,
    });
    if (error && !isMissingMigration(error)) console.error("[integration_events]", error.message);
  } catch {
    /* logging never breaks the push */
  }
}

export interface RecentFailure { ts: string; entity_type: string; entity_id: string; operation: string; http_status: number | null; error: string | null }

/** The latest failed calls, for the status card. */
export async function recentFailures(sb: Sb, tenantId: string, system: string, limit = 5): Promise<RecentFailure[]> {
  try {
    const { data, error } = await sb.from("integration_events").select("created_at, entity_type, entity_id, operation, http_status, error").eq("tenant_id", tenantId).eq("system", system).eq("outcome", "failed").order("created_at", { ascending: false }).limit(limit);
    if (error) return [];
    return ((data ?? []) as Array<{ created_at: string } & Omit<RecentFailure, "ts">>).map(({ created_at, ...r }) => ({ ts: created_at, ...r }));
  } catch {
    return [];
  }
}
