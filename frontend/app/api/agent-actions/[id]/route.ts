import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";
import { requirePermission } from "@/lib/auth/server-permission";
import { viewAction } from "@/lib/actions/queries";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** One plan with its full history: who requested it, who approved it, every state it passed through and why. */
export async function GET(_req: Request, ctx: { params: { id: string } }) {
  const auth = await requirePermission("view_audit");
  if ("error" in auth) return auth.error;
  const res = await viewAction(supabaseAdmin(), auth.user.tenant_id, ctx.params.id);
  if (!res.ok) return NextResponse.json({ error: res.error }, { status: res.status });
  return NextResponse.json(res.value);
}
