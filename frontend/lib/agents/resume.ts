/**
 * Resume an Outreach Agent run after the proposal is approved: the graph carries on to the drafted email and the send
 * plan, and waits there for a person. Runs that were paused before the graph existed (or while its tables are not
 * set up) use the earlier path in resume-legacy.ts.
 */
import { resumeLegacyAfterProposalApproval, type ResumeAfterProposalResult } from "@/lib/agents/resume-legacy";
import { resumeOutreachGraph } from "@/lib/agents/langgraph/outreach-runner";
import type { SSEEvent } from "@/lib/agents/types";

export type { ResumeAfterProposalResult };

export async function resumeAgentAfterProposalApproval(runId: string, emit?: (event: SSEEvent) => void): Promise<ResumeAfterProposalResult> {
  const viaGraph = await resumeOutreachGraph(runId, emit);
  if (viaGraph.used) return { success: viaGraph.success, agentResult: viaGraph.agentResult, steps: viaGraph.steps, error: viaGraph.error, refused: viaGraph.refused };
  return resumeLegacyAfterProposalApproval(runId, emit);
}
