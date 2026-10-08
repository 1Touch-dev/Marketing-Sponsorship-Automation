import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";
import { requirePermission } from "@/lib/auth/server-permission";
import { listThreads, type ThreadStatus } from "@/lib/agents/langgraph/runtime";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const STATUSES = ["running", "interrupted", "completed", "failed", "cancelled"];

/**
 * GET /api/agent-graphs/threads?status=failed&graph=outreach-agent&subject_id=<run id>
 * Every saved agent run: which agent, for what, and whether it is running, waiting for a person, finished, failed or
 * cancelled, with the reason it failed or what it is waiting for.
 */
export async function GET(req: Request) {
  const auth = await requirePermission("view_audit");
  if ("error" in auth) return auth.error;
  const q = new URL(req.url).searchParams;
  const status = q.get("status");
  if (status && !STATUSES.includes(status)) return NextResponse.json({ error: `status must be one of ${STATUSES.join(", ")}` }, { status: 400 });
  const res = await listThreads(supabaseAdmin(), auth.user.tenant_id, { status: status as ThreadStatus | null, graph: q.get("graph"), subjectId: q.get("subject_id"), limit: Number(q.get("limit")) || 50 });
  if (!res.ok) return NextResponse.json({ error: res.error }, { status: res.status });
  return NextResponse.json({ total: res.value.length, data: res.value });
}
