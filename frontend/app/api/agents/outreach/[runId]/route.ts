/**
 * GET  /api/agents/outreach/[runId]  — fetch run status + steps
 * DELETE /api/agents/outreach/[runId] — cancel a running agent
 */

import { NextResponse } from "next/server";
import { supabaseAdmin, supabaseServer } from "@/lib/supabase/server";
import { requirePermission } from "@/lib/auth/server-permission";

export const runtime = "nodejs";

export async function GET(
  _req: Request,
  ctx: { params: { runId: string } }
) {
  const { data: { user } } = await supabaseServer().auth.getUser().catch(() => ({ data: { user: null } }));
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const sb = supabaseAdmin();
  const { data: run } = await sb
    .from("agent_runs" as "companies")
    .select("*")
    .eq("id", ctx.params.runId)
    .maybeSingle() as unknown as { data: Record<string, unknown> | null };

  if (!run) return NextResponse.json({ error: "Run not found" }, { status: 404 });

  return NextResponse.json({ run });
}

export async function DELETE(
  _req: Request,
  ctx: { params: { runId: string } }
) {
  const auth = await requirePermission("create_proposal");
  if ("error" in auth) return auth.error;

  const sb = supabaseAdmin();
  await sb
    .from("agent_runs" as "companies")
    .update({ status: "cancelled", updated_at: new Date().toISOString() } as unknown as Record<string, unknown>)
    .eq("id", ctx.params.runId);

  return NextResponse.json({ success: true });
}
