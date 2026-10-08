/**
 * Agent Orchestrator — the Outreach Agent's entry point.
 *
 * The agent runs as a LangGraph graph whose progress is saved in our database after every step
 * (lib/agents/langgraph/outreach-graph.ts), so a run survives a restart and can wait days for a person. Until the
 * run-state tables exist (migration 0072) it falls back to the earlier loop in orchestrator-legacy.ts.
 */
import type { AgentResult, SSEEvent } from "@/lib/agents/types";
import { runLegacyOrchestrator, type OrchestratorInput, type SSEEmitter } from "@/lib/agents/orchestrator-legacy";
import { startOutreachGraph } from "@/lib/agents/langgraph/outreach-runner";

export type { OrchestratorInput, SSEEmitter };

export async function runAgentOrchestrator(input: OrchestratorInput, emit: (event: SSEEvent) => void): Promise<AgentResult> {
  const started = await startOutreachGraph(input, emit);
  if (started.used) return started.result;
  return runLegacyOrchestrator(input, emit);
}
