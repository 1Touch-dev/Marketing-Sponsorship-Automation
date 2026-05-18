import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";
import { recordAudit } from "@/lib/audit/log";

export const runtime = "nodejs";

export async function GET(req: Request) {
  const sb = supabaseAdmin();
  const url = new URL(req.url);
  const stage = url.searchParams.get("stage");
  const companyId = url.searchParams.get("company_id");

  let query = (sb as ReturnType<typeof supabaseAdmin>)
    .from("pipeline_leads" as "companies")
    .select("*")
    .eq("status", "active")
    .order("created_at", { ascending: false });

  if (stage) query = query.eq("stage", stage) as typeof query;
  if (companyId) query = query.eq("company_id", companyId) as typeof query;

  const { data, error } = await query;
  if (error?.message?.includes("not find") || error?.message?.includes("does not exist")) {
    return NextResponse.json({ data: [], migration_needed: true });
  }
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ data });
}

export async function POST(req: Request) {
  const sb = supabaseAdmin();
  const body = await req.json().catch(() => ({}));

  if (!body.title) {
    return NextResponse.json({ error: "title is required" }, { status: 400 });
  }

  const { data, error } = await (sb as ReturnType<typeof supabaseAdmin>)
    .from("pipeline_leads" as "companies")
    .insert(body as never)
    .select("*")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  await recordAudit({
    entity_type: "pipeline",
    entity_id: null,
    action: "pipeline.lead_created",
    metadata: { title: body.title, stage: body.stage },
  });

  return NextResponse.json({ data }, { status: 201 });
}
