import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";
import { resolveTenantId } from "@/lib/tenants/current";
import { previewObligationMove } from "@/lib/schedule/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Preview moving an obligation's date (?new_due_date=YYYY-MM-DD): the work that waits on it, the work it
 * waits on, who owns each, and every conflict the move would leave. Changes nothing.
 */
export async function GET(req: Request, ctx: { params: { id: string } }) {
  const res = await previewObligationMove(supabaseAdmin(), await resolveTenantId(), ctx.params.id, new URL(req.url).searchParams.get("new_due_date"));
  if (!res.ok) return NextResponse.json({ error: res.error }, { status: res.status });
  return NextResponse.json(res.value);
}
