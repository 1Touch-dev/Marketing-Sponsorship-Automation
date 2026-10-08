import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";
import { requirePermission } from "@/lib/auth/server-permission";
import { getThread, inspectRun } from "@/lib/agents/langgraph/runtime";
import { graphFor } from "@/lib/agents/langgraph/registry";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET /api/agent-graphs/threads/<id>: one run, the step it is on and what it has saved so far. */
export async function GET(_req: Request, ctx: { params: { id: string } }) {
  const auth = await requirePermission("view_audit");
  if ("error" in auth) return auth.error;
  const sb = supabaseAdmin();
  const id = decodeURIComponent(ctx.params.id);
  const got = await getThread(sb, auth.user.tenant_id, id);
  if (!got.ok) return NextResponse.json({ error: got.error }, { status: got.status });
  const graph = graphFor(sb, auth.user.tenant_id, got.value.graph);
  if (!graph) return NextResponse.json({ thread: got.value, next: [], values: null });
  const insp = await inspectRun(sb, graph, auth.user.tenant_id, id);
  if (!insp.ok) return NextResponse.json({ error: insp.error }, { status: insp.status });
  return NextResponse.json(insp.value);
}
