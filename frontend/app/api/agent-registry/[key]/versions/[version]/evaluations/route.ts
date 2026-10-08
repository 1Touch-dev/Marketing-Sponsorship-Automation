import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";
import { requirePermission } from "@/lib/auth/server-permission";
import { listRuns } from "@/lib/evals/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET /api/agent-registry/<key>/versions/<n>/evaluations: every evaluation of this version, newest first, with each gate's result. */
export async function GET(_req: Request, ctx: { params: { key: string; version: string } }) {
  const auth = await requirePermission("view_audit");
  if ("error" in auth) return auth.error;
  const sb = supabaseAdmin();
  const { data: def } = await sb.from("agent_definitions").select("id").eq("tenant_id", auth.user.tenant_id).eq("key", ctx.params.key).maybeSingle();
  if (!def) return NextResponse.json({ error: "Agent not found" }, { status: 404 });
  const { data: ver } = await sb.from("agent_versions").select("id").eq("definition_id", def.id).eq("version", Number(ctx.params.version)).maybeSingle();
  if (!ver) return NextResponse.json({ error: "Version not found" }, { status: 404 });
  const res = await listRuns(sb, auth.user.tenant_id, ver.id);
  if (!res.ok) return NextResponse.json({ error: res.error }, { status: res.status });
  return NextResponse.json({ total: res.value.length, data: res.value.map((r) => ({ ...r, gates: r.gates.map((g) => ({ gate: g.gate, passed: g.passed, cases: g.cases, failed: g.failed, summary: g.summary, failures: ((g.results ?? []) as Array<Record<string, any>>).filter((x) => !x.passed).map((x) => ({ id: x.id, detail: x.detail })) })) })) });
}
