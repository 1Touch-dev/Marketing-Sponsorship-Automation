import type { WriteResult } from "../accounts/store";
import { promptVersionFor } from "./targets";
import { isMissingMigration } from "../proposals/revision-store";
import { getRun } from "./store";

type Sb = any;

/**
 * Puts a version live. Needs either a passing evaluation run of THIS version made with the prompts as they are now, or a
 * person's written override. The database enforces the same rule (agent_version_events_guard); this is the clear answer
 * before it gets there, and the place that checks the prompt has not changed since the evaluation.
 */
export async function promoteWithGate(
  sb: Sb, tenantId: string, key: string, version: number,
  how: { evalRunId?: string | null; overrideReason?: string | null }, actor: { kind: "human" | "approver"; id: string },
  promptVersion: string = promptVersionFor(key),
): Promise<WriteResult<{ id: string; basis: "evaluation" | "override" }>> {
  const { data: def } = await sb.from("agent_definitions").select("id").eq("tenant_id", tenantId).eq("key", key).maybeSingle();
  if (!def) return { ok: false, status: 404, error: "Agent not found" };
  const { data: v } = await sb.from("agent_versions").select("id").eq("definition_id", def.id).eq("version", version).maybeSingle();
  if (!v) return { ok: false, status: 404, error: "Version not found" };

  let evidence: Record<string, unknown>;
  let basis: "evaluation" | "override";
  if (how.evalRunId) {
    const run = await getRun(sb, tenantId, how.evalRunId);
    if (!run.ok) return run;
    if (run.value.version_id !== v.id) return { ok: false, status: 409, error: "That evaluation is of a different version." };
    if (run.value.status !== "passed") return { ok: false, status: 409, error: "That evaluation did not pass, so the version cannot go live on it. Fix what failed and run it again, or override with a written reason." };
    if (run.value.prompt_version && run.value.prompt_version !== promptVersion) return { ok: false, status: 409, error: `The prompts have changed since this evaluation (${run.value.prompt_version}, now ${promptVersion}). Run the evaluation again.` };
    evidence = { eval_run_id: run.value.id, prompt_version: run.value.prompt_version, cost_usd: Number(run.value.cost_usd), cases: run.value.case_count, gates: run.value.gates.map((g) => ({ gate: g.gate, passed: g.passed, cases: g.cases })) };
    basis = "evaluation";
  } else if (how.overrideReason && how.overrideReason.trim().length >= 10) {
    evidence = { gate_override: how.overrideReason.trim() };
    basis = "override";
  } else {
    return { ok: false, status: 400, error: "A version goes live on a passing evaluation (run it first), or on a written override of at least 10 characters saying why the checks were skipped." };
  }
  const { error } = await sb.rpc("agent_version_promote", { p_version: v.id, p_actor_kind: actor.kind, p_actor_id: actor.id, p_evidence: evidence });
  if (error) {
    if (isMissingMigration(error)) return { ok: false, status: 503, error: "Agent governance is not set up yet (migration 0070)." };
    const gate = /GATE:/.test(error.message);
    return { ok: false, status: gate ? 409 : /cannot|already|another|retired/i.test(error.message) ? 409 : 500, error: error.message.replace(/^.*?GATE:\s*/, "") };
  }
  return { ok: true, value: { id: v.id, basis } };
}
