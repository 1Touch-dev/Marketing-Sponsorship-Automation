import { isMissingMigration } from "../proposals/revision-store";
import { formatDate } from "../utils";

type Sb = any;

/**
 * One answer to "is this connection working?", read by every screen that shows it (/crm-sync, /pipeline, /system) and by
 * the health endpoints. Before this, three screens each decided for themselves: one went green whenever a key was set,
 * one always said "ready to configure", one said both "no key required" and "missing / valid / invalid". The answer now
 * comes from four facts, all kept in `integration_health`:
 *
 *   configured       is a key set on this server (read from the environment, never stored)
 *   key_accepted     did the outside system accept it: true / false once it has answered, null while not known
 *   last_push_ok_at  when a push last succeeded
 *   last_error(_at)  the last thing that went wrong, and when
 *
 * and one rule: a failed push newer than the last good one is "failing", whatever else is true. So a failed sync and a
 * green banner cannot be on screen together.
 */
export type ConnectionState = "not_configured" | "key_rejected" | "failing" | "unverified" | "connected";
export type Tone = "ok" | "warn" | "bad" | "idle";

export interface IntegrationHealth {
  system: string;
  configured: boolean;
  key_accepted: boolean | null;
  key_checked_at: string | null;
  last_push_ok_at: string | null;
  last_error: string | null;
  last_error_at: string | null;
  last_error_kind: "push" | "check" | null;
}

export interface Connection extends IntegrationHealth {
  state: ConnectionState;
  tone: Tone;
  /** a short headline for a banner */
  label: string;
  /** one sentence saying why, with the time of the last good push or the last error */
  detail: string;
}

const t = (iso: string | null) => (iso ? new Date(iso).getTime() : null);
const when = (iso: string | null) => (iso ? formatDate(iso) : "never");

/** The state, from the four facts. Pure, so every screen gets the same answer from the same record. */
export function connectionOf(h: IntegrationHealth, name = "Pipedrive"): Connection {
  const base = { ...h };
  if (!h.configured) return { ...base, state: "not_configured", tone: "idle", label: `${name} is not connected`, detail: `No API key is set on this server, so nothing is sent to ${name}.` };
  if (h.key_accepted === false) return { ...base, state: "key_rejected", tone: "bad", label: `${name} rejected the API key`, detail: `${name} answered that the key is not valid${h.key_checked_at ? ` (checked ${when(h.key_checked_at)})` : ""}. Nothing is being sent.` };
  // an error counts until something of the same kind has worked since: a good push clears a failed push, a good key check clears a failed check
  const errAt = t(h.last_error_at);
  const okSince = h.last_error_kind === "check" ? Math.max(t(h.last_push_ok_at) ?? 0, h.key_accepted ? (t(h.key_checked_at) ?? 0) : 0) : (t(h.last_push_ok_at) ?? 0);
  if (errAt !== null && errAt > okSince) {
    return { ...base, state: "failing", tone: "bad", label: `${name} sync is failing`, detail: `The last ${h.last_error_kind === "check" ? "connection check" : "push"} failed (${when(h.last_error_at)}): ${h.last_error ?? "unknown error"}.${h.last_push_ok_at ? ` The last good push was ${when(h.last_push_ok_at)}.` : " Nothing has been pushed successfully yet."}` };
  }
  if (h.key_accepted === true) {
    return { ...base, state: "connected", tone: "ok", label: `${name} is connected`, detail: h.last_push_ok_at ? `Last successful push: ${when(h.last_push_ok_at)}.` : "The key is accepted. Nothing has been pushed yet." };
  }
  return { ...base, state: "unverified", tone: "warn", label: `${name} key is set but has not been checked`, detail: `A key is set, but ${name} has not answered yet, so it is not known to work.${h.last_push_ok_at ? ` Last successful push: ${when(h.last_push_ok_at)}.` : ""}` };
}

const COLS = "key_accepted, key_checked_at, last_push_ok_at, last_error, last_error_at, last_error_kind";

export async function loadHealth(sb: Sb, tenantId: string, system: string, configured: boolean): Promise<IntegrationHealth> {
  const empty: IntegrationHealth = { system, configured, key_accepted: null, key_checked_at: null, last_push_ok_at: null, last_error: null, last_error_at: null, last_error_kind: null };
  try {
    const { data, error } = await sb.from("integration_health").select(COLS).eq("tenant_id", tenantId).eq("system", system).maybeSingle();
    if (error || !data) return empty; // not set up yet, or never used: nothing is known
    return { ...empty, ...(data as Partial<IntegrationHealth>) };
  } catch {
    return empty;
  }
}

async function write(sb: Sb, tenantId: string, system: string, patch: Record<string, unknown>): Promise<void> {
  try {
    const row = { ...patch, updated_at: new Date().toISOString() };
    const upd = await sb.from("integration_health").update(row).eq("tenant_id", tenantId).eq("system", system).select("system");
    if (upd.error) { if (!isMissingMigration(upd.error)) console.error("[integration_health]", upd.error.message); return; }
    if ((upd.data ?? []).length > 0) return;
    const ins = await sb.from("integration_health").insert({ tenant_id: tenantId, system, ...row });
    // two writers made the first row at once: the other one wins, and ours goes in as an update
    if (ins.error && ins.error.code === "23505") await sb.from("integration_health").update(row).eq("tenant_id", tenantId).eq("system", system);
  } catch {
    /* the health record never breaks what it describes */
  }
}

const clip = (s: string) => s.replace(/api_token=[^&\s"']+/gi, "api_token=***").slice(0, 400);

/** A push worked: the key is accepted, and the last error (if any) is now older than a good push. */
export const recordPushOk = (sb: Sb, tenantId: string, system: string) => write(sb, tenantId, system, { key_accepted: true, last_push_ok_at: new Date().toISOString() });

/** A push failed. `status` 401/403 means the key itself was refused; anything else leaves what is known about the key alone. */
export const recordPushFailure = (sb: Sb, tenantId: string, system: string, error: string, status: number | null) =>
  write(sb, tenantId, system, {
    last_error: clip(error), last_error_at: new Date().toISOString(), last_error_kind: "push",
    ...(status === 401 || status === 403 ? { key_accepted: false, key_checked_at: new Date().toISOString() } : {}),
  });

/** The result of asking the outside system whether it accepts the key. */
export const recordKeyCheck = (sb: Sb, tenantId: string, system: string, r: { accepted: boolean | null; error?: string }) =>
  write(sb, tenantId, system, {
    key_checked_at: new Date().toISOString(),
    ...(r.accepted === null ? {} : { key_accepted: r.accepted }),
    ...(r.error ? { last_error: clip(r.error), last_error_at: new Date().toISOString(), last_error_kind: "check" } : {}),
  });

/** How long a key check is trusted before a screen asks again. */
export const KEY_CHECK_TTL_MS = 5 * 60 * 1000;
export const keyCheckIsStale = (h: IntegrationHealth, now = Date.now()) => !h.key_checked_at || now - new Date(h.key_checked_at).getTime() > KEY_CHECK_TTL_MS;
