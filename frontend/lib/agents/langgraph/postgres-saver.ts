import type { RunnableConfig } from "@langchain/core/runnables";
import {
  BaseCheckpointSaver, TASKS, WRITES_IDX_MAP, copyCheckpoint, getCheckpointId, maxChannelVersion,
  type ChannelVersions, type Checkpoint, type CheckpointListOptions, type CheckpointMetadata, type CheckpointPendingWrite, type CheckpointTuple, type PendingWrite,
  type SerializerProtocol,
} from "@langchain/langgraph-checkpoint";

type Sb = any;

/**
 * LangGraph's checkpointer, backed by our own Postgres tables (migration 0072) instead of a third-party service.
 *
 * Bound to ONE tenant when it is made, never read from the request: every query filters on that tenant, and a thread
 * id must start with it. Whatever a caller puts in `configurable`, it cannot read or write another club's runs.
 *
 * Checkpointing makes a run resumable. It does NOT make an external effect safe to repeat, so graphs never send from a
 * step: a send is planned and approved through the action broker.
 */
export class SupabaseCheckpointSaver extends BaseCheckpointSaver {
  constructor(private readonly sb: Sb, readonly tenantId: string, serde?: SerializerProtocol) {
    super(serde);
    if (!/^[0-9a-f-]{36}$/i.test(tenantId)) throw new Error("A checkpointer needs the tenant it works for.");
  }

  /** Thread ids are `<tenant>:<graph>:<subject>`; this is the one place that makes them. */
  static threadId(tenantId: string, graph: string, subject: string): string {
    return `${tenantId}:${graph}:${subject}`;
  }

  private assertThread(threadId: unknown): string {
    if (typeof threadId !== "string" || threadId.length === 0) {
      throw new Error('Failed to use the checkpointer: the config needs a "thread_id" in "configurable".');
    }
    if (!threadId.startsWith(`${this.tenantId}:`)) throw new Error("That run belongs to another club.");
    return threadId;
  }

  private async dump(value: unknown): Promise<{ type: string; data: string }> {
    const [type, bytes] = await this.serde.dumpsTyped(value);
    return { type, data: Buffer.from(bytes).toString("base64") };
  }

  private async load<T>(type: string, data: string): Promise<T> {
    return (await this.serde.loadsTyped(type, new Uint8Array(Buffer.from(data, "base64")))) as T;
  }

  private failure(op: string, error: { message: string }): never {
    throw new Error(`Saving or reading the run state failed (${op}): ${error.message}`);
  }

  private async writesFor(threadId: string, ns: string, checkpointId: string): Promise<CheckpointPendingWrite[]> {
    const { data, error } = await this.sb.from("langgraph_writes").select("task_id, idx, channel, value_type, value")
      .eq("tenant_id", this.tenantId).eq("thread_id", threadId).eq("checkpoint_ns", ns).eq("checkpoint_id", checkpointId).order("task_id", { ascending: true }).order("idx", { ascending: true });
    if (error) this.failure("read writes", error);
    return Promise.all(((data ?? []) as Array<{ task_id: string; channel: string; value_type: string; value: string }>).map(async (w) => [w.task_id, w.channel, await this.load(w.value_type, w.value)] as CheckpointPendingWrite));
  }

  /** Runs saved before checkpoint version 4 kept pending sends in the parent's writes. */
  private async migratePendingSends(checkpoint: Checkpoint, threadId: string, ns: string, parentId: string): Promise<void> {
    const parent = await this.writesFor(threadId, ns, parentId);
    const sends = parent.filter(([, channel]) => channel === TASKS).map(([, , value]) => value);
    checkpoint.channel_values ??= {};
    checkpoint.channel_values[TASKS] = sends;
    checkpoint.channel_versions ??= {};
    checkpoint.channel_versions[TASKS] = Object.keys(checkpoint.channel_versions).length > 0 ? maxChannelVersion(...Object.values(checkpoint.channel_versions)) : this.getNextVersion(undefined);
  }

  private async tupleFromRow(row: Row, threadId: string, ns: string, withConfig?: RunnableConfig): Promise<CheckpointTuple> {
    const checkpoint = await this.load<Checkpoint>(row.checkpoint_type, row.checkpoint);
    if (checkpoint.v < 4 && row.parent_checkpoint_id) await this.migratePendingSends(checkpoint, threadId, ns, row.parent_checkpoint_id);
    const tuple: CheckpointTuple = {
      config: withConfig ?? { configurable: { thread_id: threadId, checkpoint_ns: ns, checkpoint_id: row.checkpoint_id } },
      checkpoint,
      metadata: await this.load<CheckpointMetadata>(row.metadata_type, row.metadata),
      pendingWrites: await this.writesFor(threadId, ns, row.checkpoint_id),
    };
    if (row.parent_checkpoint_id) tuple.parentConfig = { configurable: { thread_id: threadId, checkpoint_ns: ns, checkpoint_id: row.parent_checkpoint_id } };
    return tuple;
  }

  async getTuple(config: RunnableConfig): Promise<CheckpointTuple | undefined> {
    const threadId = this.assertThread(config.configurable?.thread_id);
    const ns = (config.configurable?.checkpoint_ns as string | undefined) ?? "";
    const checkpointId = getCheckpointId(config);
    let q = this.sb.from("langgraph_checkpoints").select("*").eq("tenant_id", this.tenantId).eq("thread_id", threadId).eq("checkpoint_ns", ns);
    q = checkpointId ? q.eq("checkpoint_id", checkpointId) : q.order("checkpoint_id", { ascending: false }).limit(1);
    const { data, error } = await q;
    if (error) this.failure("read checkpoint", error);
    const row = ((data ?? []) as Row[])[0];
    if (!row) return undefined;
    return this.tupleFromRow(row, threadId, ns, checkpointId ? config : undefined);
  }

  async *list(config: RunnableConfig, options?: CheckpointListOptions): AsyncGenerator<CheckpointTuple> {
    let { before, limit, filter } = options ?? {};
    const requested = config.configurable?.thread_id as string | undefined;
    if (requested !== undefined) this.assertThread(requested);
    let q = this.sb.from("langgraph_checkpoints").select("*").eq("tenant_id", this.tenantId).order("checkpoint_id", { ascending: false });
    if (requested !== undefined) q = q.eq("thread_id", requested);
    const ns = config.configurable?.checkpoint_ns as string | undefined;
    if (ns !== undefined) q = q.eq("checkpoint_ns", ns);
    const cid = config.configurable?.checkpoint_id as string | undefined;
    if (cid) q = q.eq("checkpoint_id", cid);
    const beforeId = before?.configurable?.checkpoint_id as string | undefined;
    if (beforeId) q = q.lt("checkpoint_id", beforeId);
    const { data, error } = await q;
    if (error) this.failure("list checkpoints", error);
    for (const row of (data ?? []) as Row[]) {
      const tuple = await this.tupleFromRow(row, row.thread_id, row.checkpoint_ns);
      if (filter && !Object.entries(filter).every(([k, v]) => (tuple.metadata as Record<string, unknown> | undefined)?.[k] === v)) continue;
      if (limit !== undefined) {
        if (limit <= 0) break;
        limit -= 1;
      }
      yield tuple;
    }
  }

  async put(config: RunnableConfig, checkpoint: Checkpoint, metadata: CheckpointMetadata, _newVersions?: ChannelVersions): Promise<RunnableConfig> {
    const threadId = this.assertThread(config.configurable?.thread_id);
    const ns = (config.configurable?.checkpoint_ns as string | undefined) ?? "";
    const prepared = copyCheckpoint(checkpoint);
    const [cp, meta] = await Promise.all([this.dump(prepared), this.dump(metadata)]);
    const { error } = await this.sb.from("langgraph_checkpoints").upsert({
      thread_id: threadId, checkpoint_ns: ns, checkpoint_id: checkpoint.id, parent_checkpoint_id: (config.configurable?.checkpoint_id as string | undefined) ?? null,
      tenant_id: this.tenantId, checkpoint_type: cp.type, checkpoint: cp.data, metadata_type: meta.type, metadata: meta.data,
    }, { onConflict: "thread_id,checkpoint_ns,checkpoint_id" });
    if (error) this.failure("save checkpoint", error);
    return { configurable: { thread_id: threadId, checkpoint_ns: ns, checkpoint_id: checkpoint.id } };
  }

  async putWrites(config: RunnableConfig, writes: PendingWrite[], taskId: string): Promise<void> {
    const threadId = this.assertThread(config.configurable?.thread_id);
    const ns = (config.configurable?.checkpoint_ns as string | undefined) ?? "";
    const checkpointId = config.configurable?.checkpoint_id as string | undefined;
    if (!checkpointId) throw new Error('Failed to save step results: the config needs a "checkpoint_id".');
    const rows = await Promise.all(writes.map(async ([channel, value], i) => {
      const v = await this.dump(value);
      return { thread_id: threadId, checkpoint_ns: ns, checkpoint_id: checkpointId, task_id: taskId, idx: WRITES_IDX_MAP[channel as keyof typeof WRITES_IDX_MAP] ?? i, tenant_id: this.tenantId, channel, value_type: v.type, value: v.data };
    }));
    // ordinary results are written once; special ones (errors, interrupts, resumes) are replaced when they happen again
    const once = rows.filter((r) => r.idx >= 0);
    const again = rows.filter((r) => r.idx < 0);
    if (once.length > 0) {
      const { error } = await this.sb.from("langgraph_writes").upsert(once, { onConflict: "thread_id,checkpoint_ns,checkpoint_id,task_id,idx", ignoreDuplicates: true });
      if (error) this.failure("save step results", error);
    }
    if (again.length > 0) {
      const { error } = await this.sb.from("langgraph_writes").upsert(again, { onConflict: "thread_id,checkpoint_ns,checkpoint_id,task_id,idx" });
      if (error) this.failure("save step results", error);
    }
  }

  async deleteThread(threadId: string): Promise<void> {
    this.assertThread(threadId);
    for (const table of ["langgraph_writes", "langgraph_checkpoints"]) {
      const { error } = await this.sb.from(table).delete().eq("tenant_id", this.tenantId).eq("thread_id", threadId);
      if (error) this.failure("delete run state", error);
    }
  }
}

interface Row {
  thread_id: string; checkpoint_ns: string; checkpoint_id: string; parent_checkpoint_id: string | null;
  checkpoint_type: string; checkpoint: string; metadata_type: string; metadata: string;
}
