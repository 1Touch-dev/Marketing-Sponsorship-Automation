import { recordAudit } from "@/lib/audit/log";
import { agentActor, type UserLike } from "@/lib/identity/actor";

export interface AgentOutput { entity_type: string; entity_id?: string | null; action: string; metadata?: Record<string, unknown> }

/**
 * Writes what a team agent produced to the audit log as the agent, naming the person who ran it. The
 * person's own entry (they pressed the button) is separate and stays; these say what the agent did.
 */
export async function auditAgentOutputs(agent: string, user: UserLike & { tenant_id: string }, outputs: AgentOutput[]): Promise<void> {
  const actor = agentActor(agent, { onBehalfOf: user.email });
  for (const o of outputs) await recordAudit({ actor, tenant_id: user.tenant_id, entity_type: o.entity_type, entity_id: o.entity_id ?? null, action: o.action, metadata: o.metadata });
}
