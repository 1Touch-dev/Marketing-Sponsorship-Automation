import { randomUUID } from "crypto";
import { supabaseAdmin } from "@/lib/supabase/server";
import { SupabaseCheckpointSaver } from "./postgres-saver";
import { notSetUp, startRun, type RunnableGraph } from "./runtime";

type Sb = any;

/**
 * Runs a graph with its progress saved in our database, so a run that dies carries on from its last finished step
 * (POST /api/agent-graphs/threads/<id>/resume) instead of starting over. Before the run-state tables exist
 * (migration 0072) it runs the graph without saving, as it always did.
 */
export async function runCheckpointed<V extends Record<string, any>>(i: {
  tenantId: string; graph: string; build: (checkpointer?: unknown) => unknown; initial: Partial<V>;
  subjectId?: string; subjectType?: string; startedBy?: string | null; sb?: Sb;
}): Promise<V> {
  const sb = i.sb ?? supabaseAdmin();
  const graph = i.build(new SupabaseCheckpointSaver(sb, i.tenantId)) as RunnableGraph;
  const out = await startRun(sb, graph, {
    tenantId: i.tenantId, graph: i.graph, subjectType: i.subjectType ?? "run", subjectId: i.subjectId ?? randomUUID(), startedBy: i.startedBy ?? null, initial: i.initial,
  });
  if (!out.ok) {
    if (out.status === 503 || out.error === notSetUp) {
      const plain = i.build() as { invoke(input: unknown): Promise<V> };
      return plain.invoke(i.initial);
    }
    throw new Error(out.error);
  }
  if (out.result.status === "failed") throw new Error(out.result.error);
  return out.result.values as V;
}
