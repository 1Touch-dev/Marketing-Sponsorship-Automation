import type { WriteResult } from "../accounts/store";
import { isMissingMigration } from "../proposals/revision-store";

type Sb = any;

const notSetUp = "Agent governance is not set up yet (migration 0070).";
const fail = (e: { message: string; code?: string }): { ok: false; status: number; error: string } => {
  if (isMissingMigration(e)) return { ok: false, status: 503, error: notSetUp };
  const conflict = e.code === "23505" || e.code === "P0001" || e.code === "23514" || /cannot|only|already|must|unknown|another|not one of|retired|live|requires|violates/i.test(e.message);
  return { ok: false, status: conflict ? 409 : 500, error: e.message.replace(/^.*?ERROR:\s*/, "") };
};

export interface RegistryEntry {
  id: string; key: string; name: string; description: string | null; runtime: string; created_at: string; retired_at: string | null; retire_reason: string | null;
  live_version: { id: string; version: number; effects: string[]; tools: string[]; max_cost_usd: number } | null;
  versions: Array<{ id: string; version: number; effects: string[]; max_cost_usd: number; prompt_ref: string | null; model: string | null; created_by: string; created_at: string; status: "live" | "retired" | "not_promoted"; promoted_evidence: Record<string, unknown> | null }>;
  assignments: Array<{ id: string; scope_kind: string; scope_id: string | null; allowed_effects: string[]; max_cost_usd: number; expires_at: string | null; grandfathered: boolean; justification: string | null; assigned_by: string; created_at: string; revoked_at: string | null; revoke_reason: string | null; active: boolean }>;
}

export async function listRegistry(sb: Sb, tenantId: string): Promise<WriteResult<RegistryEntry[]>> {
  const defs = await sb.from("agent_definitions").select("id, key, name, description, runtime, created_at, retired_at, retire_reason").eq("tenant_id", tenantId).order("key");
  if (defs.error) return fail(defs.error);
  const ids = ((defs.data ?? []) as Array<{ id: string }>).map((d) => d.id);
  if (ids.length === 0) return { ok: true, value: [] };
  const [vers, evs, asg] = await Promise.all([
    sb.from("agent_versions").select("id, definition_id, version, effects, tools, max_cost_usd, prompt_ref, model, created_by, created_at").in("definition_id", ids).order("version", { ascending: false }),
    sb.from("agent_version_events").select("version_id, event_type, evidence, seq").eq("tenant_id", tenantId).order("seq", { ascending: true }),
    sb.from("agent_assignments").select("id, definition_id, scope_kind, scope_id, allowed_effects, max_cost_usd, expires_at, grandfathered, justification, assigned_by, created_at, revoked_at, revoke_reason").eq("tenant_id", tenantId).order("created_at", { ascending: false }),
  ]);
  for (const r of [vers, evs, asg]) if (r.error) return fail(r.error);
  const status = new Map<string, { live: boolean; promoted: boolean; evidence: Record<string, unknown> | null }>();
  for (const e of (evs.data ?? []) as Array<{ version_id: string; event_type: string; evidence: Record<string, unknown> }>) {
    const cur = status.get(e.version_id) ?? { live: false, promoted: false, evidence: null };
    if (e.event_type === "promoted") { cur.live = true; cur.promoted = true; cur.evidence = e.evidence; } else cur.live = false;
    status.set(e.version_id, cur);
  }
  const now = Date.now();
  const value = ((defs.data ?? []) as Array<Record<string, any>>).map((d) => {
    const versions = ((vers.data ?? []) as Array<Record<string, any>>).filter((v) => v.definition_id === d.id).map((v) => {
      const st = status.get(v.id);
      return { id: v.id, version: v.version, effects: v.effects, tools: v.tools, max_cost_usd: Number(v.max_cost_usd), prompt_ref: v.prompt_ref, model: v.model, created_by: v.created_by, created_at: v.created_at,
        status: (st?.live ? "live" : st?.promoted ? "retired" : "not_promoted") as "live" | "retired" | "not_promoted", promoted_evidence: st?.evidence ?? null };
    });
    const live = versions.find((v) => v.status === "live");
    return {
      id: d.id, key: d.key, name: d.name, description: d.description, runtime: d.runtime, created_at: d.created_at, retired_at: d.retired_at, retire_reason: d.retire_reason,
      live_version: live ? { id: live.id, version: live.version, effects: live.effects, tools: live.tools, max_cost_usd: live.max_cost_usd } : null,
      versions,
      assignments: ((asg.data ?? []) as Array<Record<string, any>>).filter((a) => a.definition_id === d.id).map((a) => ({
        id: a.id, scope_kind: a.scope_kind, scope_id: a.scope_id, allowed_effects: a.allowed_effects, max_cost_usd: Number(a.max_cost_usd), expires_at: a.expires_at, grandfathered: a.grandfathered,
        justification: a.justification, assigned_by: a.assigned_by, created_at: a.created_at, revoked_at: a.revoked_at, revoke_reason: a.revoke_reason,
        active: !a.revoked_at && (!a.expires_at || new Date(a.expires_at).getTime() > now),
      })),
    };
  });
  return { ok: true, value };
}

const definitionId = async (sb: Sb, tenantId: string, key: string) => (await sb.from("agent_definitions").select("id, retired_at").eq("tenant_id", tenantId).eq("key", key).maybeSingle()).data as { id: string; retired_at: string | null } | null;

export async function createDefinition(sb: Sb, tenantId: string, i: { key: string; name: string; description?: string | null; runtime: string }, actor: string): Promise<WriteResult<{ id: string }>> {
  const { data, error } = await sb.from("agent_definitions").insert({ tenant_id: tenantId, key: i.key, name: i.name, description: i.description ?? null, runtime: i.runtime, created_by: actor }).select("id").single();
  return error ? (error.code === "23505" ? { ok: false, status: 409, error: `An agent with the key "${i.key}" already exists.` } : fail(error)) : { ok: true, value: { id: data.id } };
}

export async function createVersion(sb: Sb, tenantId: string, key: string, i: { effects: string[]; tools?: string[]; max_cost_usd: number; model?: string | null; prompt_ref?: string | null; notes?: string | null }, actor: string): Promise<WriteResult<{ id: string; version: number }>> {
  const def = await definitionId(sb, tenantId, key);
  if (!def) return { ok: false, status: 404, error: "Agent not found" };
  const { data: last } = await sb.from("agent_versions").select("version").eq("definition_id", def.id).order("version", { ascending: false }).limit(1);
  const version = ((last?.[0] as { version?: number } | undefined)?.version ?? 0) + 1;
  const { data, error } = await sb.from("agent_versions").insert({ tenant_id: tenantId, definition_id: def.id, version, effects: i.effects, tools: i.tools ?? [], max_cost_usd: i.max_cost_usd, model: i.model ?? null, prompt_ref: i.prompt_ref ?? null, notes: i.notes ?? null, created_by: actor }).select("id").single();
  return error ? fail(error) : { ok: true, value: { id: data.id, version } };
}

export async function promoteVersion(sb: Sb, tenantId: string, key: string, version: number, evidence: Record<string, unknown>, actor: { kind: "human" | "approver"; id: string }): Promise<WriteResult<{ id: string }>> {
  const def = await definitionId(sb, tenantId, key);
  if (!def) return { ok: false, status: 404, error: "Agent not found" };
  const { data: v } = await sb.from("agent_versions").select("id").eq("definition_id", def.id).eq("version", version).maybeSingle();
  if (!v) return { ok: false, status: 404, error: "Version not found" };
  if (!evidence || Object.keys(evidence).length === 0) return { ok: false, status: 400, error: "Promoting a version needs evidence: what showed it is ready (an evaluation run, a review)." };
  const { error } = await sb.rpc("agent_version_promote", { p_version: v.id, p_actor_kind: actor.kind, p_actor_id: actor.id, p_evidence: evidence });
  return error ? fail(error) : { ok: true, value: { id: v.id } };
}

export async function retireVersion(sb: Sb, tenantId: string, key: string, version: number, reason: string, actor: { kind: "human" | "approver"; id: string }): Promise<WriteResult<{ id: string }>> {
  const def = await definitionId(sb, tenantId, key);
  if (!def) return { ok: false, status: 404, error: "Agent not found" };
  const { data: v } = await sb.from("agent_versions").select("id").eq("definition_id", def.id).eq("version", version).maybeSingle();
  if (!v) return { ok: false, status: 404, error: "Version not found" };
  const { error } = await sb.from("agent_version_events").insert({ tenant_id: tenantId, version_id: v.id, event_type: "retired", reason, actor_kind: actor.kind, actor_id: actor.id });
  return error ? fail(error) : { ok: true, value: { id: v.id } };
}

export interface AssignInput { scope_kind: "all_companies" | "company" | "campaign"; scope_id?: string | null; allowed_effects: string[]; max_cost_usd: number; expires_at?: string | null; justification?: string | null }

export async function assign(sb: Sb, tenantId: string, key: string, i: AssignInput, actor: string): Promise<WriteResult<{ id: string }>> {
  const def = await definitionId(sb, tenantId, key);
  if (!def) return { ok: false, status: 404, error: "Agent not found" };
  if (i.scope_kind === "all_companies" && (i.justification ?? "").trim().length < 10) return { ok: false, status: 400, error: "Authority over every company has to be asked for in words: say why (10+ characters)." };
  if (i.scope_kind !== "all_companies" && !i.scope_id) return { ok: false, status: 400, error: "Say which company or campaign this assignment is for." };
  const { data, error } = await sb.from("agent_assignments").insert({
    tenant_id: tenantId, definition_id: def.id, scope_kind: i.scope_kind, scope_id: i.scope_kind === "all_companies" ? null : i.scope_id ?? null, allowed_effects: i.allowed_effects,
    max_cost_usd: i.max_cost_usd, expires_at: i.expires_at ?? null, justification: i.justification ?? null, assigned_by: actor,
  }).select("id").single();
  return error ? fail(error) : { ok: true, value: { id: data.id } };
}

export async function revokeAssignment(sb: Sb, tenantId: string, id: string, reason: string, actor: string): Promise<WriteResult<{ id: string }>> {
  const { data: row } = await sb.from("agent_assignments").select("id, revoked_at").eq("id", id).eq("tenant_id", tenantId).maybeSingle();
  if (!row) return { ok: false, status: 404, error: "Assignment not found" };
  if (row.revoked_at) return { ok: false, status: 409, error: "That assignment was already revoked." };
  const { error } = await sb.from("agent_assignments").update({ revoked_at: new Date().toISOString(), revoked_by: actor, revoke_reason: reason }).eq("id", id).eq("tenant_id", tenantId);
  return error ? fail(error) : { ok: true, value: { id } };
}

export async function retireDefinition(sb: Sb, tenantId: string, key: string, reason: string, actor: string): Promise<WriteResult<{ id: string }>> {
  const def = await definitionId(sb, tenantId, key);
  if (!def) return { ok: false, status: 404, error: "Agent not found" };
  const { error } = await sb.from("agent_definitions").update({ retired_at: new Date().toISOString(), retired_by: actor, retire_reason: reason }).eq("id", def.id);
  return error ? fail(error) : { ok: true, value: { id: def.id } };
}

/**
 * Installs the six standard agents into this tenant (version 1, promoted with the evidence "standard catalog").
 * Without assign they can do nothing until an administrator assigns them; with it each is assigned workspace-wide.
 */
export async function installStandardAgents(sb: Sb, tenantId: string, actor: string, assign: boolean): Promise<WriteResult<{ installed: string[]; skipped: string[]; assigned: boolean }>> {
  const { data, error } = await sb.rpc("agent_install_standard", { p_tenant: tenantId, p_actor: actor, p_assign: assign });
  if (error) return fail(error);
  return { ok: true, value: data as { installed: string[]; skipped: string[]; assigned: boolean } };
}
