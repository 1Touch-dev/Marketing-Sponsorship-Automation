import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";
import { resolveTenantId } from "@/lib/tenants/current";
import { listDateChanges } from "@/lib/schedule/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Every recorded date move, newest first, filterable by ?company_id and ?subject_id: what moved, why, by whom, and which owners were affected. */
export async function GET(req: Request) {
  const u = new URL(req.url).searchParams;
  const res = await listDateChanges(supabaseAdmin(), await resolveTenantId(), { companyId: u.get("company_id"), subjectId: u.get("subject_id"), limit: Number(u.get("limit")) || undefined });
  if (!res.ok) return NextResponse.json({ error: res.error }, { status: res.status });
  return NextResponse.json({ total: res.value.length, data: res.value });
}
