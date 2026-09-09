import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";
import { recordAudit } from "@/lib/audit/log";
import { requirePermission } from "@/lib/auth/server-permission";

export const runtime = "nodejs";

export async function GET(req: Request) {
  const sb = supabaseAdmin();
  const url = new URL(req.url);
  const proposalId = url.searchParams.get("proposal_id");
  const companyId = url.searchParams.get("company_id");

  let query = (sb as ReturnType<typeof supabaseAdmin>)
    .from("visual_mockups" as "companies")
    .select("*")
    .order("created_at", { ascending: false });

  if (proposalId) query = query.eq("proposal_id", proposalId) as typeof query;
  if (companyId) query = query.eq("company_id", companyId) as typeof query;

  const { data, error } = await query;
  if (error?.message?.includes("not find") || error?.message?.includes("does not exist")) {
    return NextResponse.json({ data: [], migration_needed: true });
  }
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ data });
}

export async function POST(req: Request) {
  const auth = await requirePermission("generate_images");
  if ("error" in auth) return auth.error;

  const sb = supabaseAdmin();
  const body = await req.json().catch(() => ({}));

  if (!body.name || !body.mockup_type) {
    return NextResponse.json({ error: "name and mockup_type are required" }, { status: 400 });
  }

  const { data, error } = await (sb as ReturnType<typeof supabaseAdmin>)
    .from("visual_mockups" as "companies")
    .insert({ ...body, status: "pending" } as never)
    .select("*")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  await recordAudit({
    entity_type: "visual_mockup",
    entity_id: null,
    action: "mockup.created",
    metadata: { name: body.name, type: body.mockup_type, provider: body.ai_provider },
  });

  return NextResponse.json({ data }, { status: 201 });
}
