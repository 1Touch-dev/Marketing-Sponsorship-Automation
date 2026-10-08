import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";
import { requirePermission } from "@/lib/auth/server-permission";
import { listBlocks } from "@/lib/approvals/recovery";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Approvals that cannot go ahead (the reviewer has left, nobody holds the role, or it has waited too long), with why and who they escalate to. ?status=open|resolved|all */
export async function GET(req: Request) {
  const auth = await requirePermission("view_audit");
  if ("error" in auth) return auth.error;
  const s = new URL(req.url).searchParams.get("status");
  const res = await listBlocks(supabaseAdmin(), auth.user.tenant_id, s === "resolved" || s === "all" ? s : "open");
  if (!res.ok) return NextResponse.json({ error: res.error }, { status: res.status });
  return NextResponse.json({ total: res.value.length, data: res.value });
}
