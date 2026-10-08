import { SupabaseCheckpointSaver } from "./postgres-saver";
import type { RunnableGraph } from "./runtime";
import { buildOutreachGraph, OUTREACH_GRAPH } from "./outreach-graph";
import { liveDeps } from "./outreach-runner";
import { buildRenewalGraph, RENEWAL_GRAPH } from "./renewal-agent";
import { buildReportingGraph, REPORTING_GRAPH } from "./reporting-agent";
import { buildHygieneGraph, HYGIENE_GRAPH } from "./pipeline-hygiene-agent";
import { buildNegotiationGraph, NEGOTIATION_GRAPH } from "./negotiation-agent";

type Sb = any;

/** Every agent that runs as a saved, resumable graph, by the name its runs are recorded under. */
export const GRAPH_NAMES = [OUTREACH_GRAPH, RENEWAL_GRAPH, REPORTING_GRAPH, HYGIENE_GRAPH, NEGOTIATION_GRAPH] as const;

/** Rebuilds the graph a recorded run belongs to, so it can be inspected or carried on. */
export function graphFor(sb: Sb, tenantId: string, name: string): RunnableGraph | null {
  const saver = new SupabaseCheckpointSaver(sb, tenantId);
  switch (name) {
    case OUTREACH_GRAPH: return buildOutreachGraph(liveDeps(sb, () => undefined), saver) as unknown as RunnableGraph;
    case RENEWAL_GRAPH: return buildRenewalGraph(saver) as unknown as RunnableGraph;
    case REPORTING_GRAPH: return buildReportingGraph(saver) as unknown as RunnableGraph;
    case HYGIENE_GRAPH: return buildHygieneGraph(saver) as unknown as RunnableGraph;
    case NEGOTIATION_GRAPH: return buildNegotiationGraph(saver) as unknown as RunnableGraph;
    default: return null;
  }
}
