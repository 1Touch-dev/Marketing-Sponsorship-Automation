import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";
import { recordAudit } from "@/lib/audit/log";
import { requirePermission } from "@/lib/auth/server-permission";

export const runtime = "nodejs";

export async function GET(req: Request) {
  const sb = supabaseAdmin();
  const url = new URL(req.url);
  const status = url.searchParams.get("status");

  let query = (sb as ReturnType<typeof supabaseAdmin>)
    .from("social_projects" as "companies")
    .select("*")
    .order("created_at", { ascending: false });

  if (status) query = query.eq("status", status) as typeof query;

  const { data, error } = await query;
  if (error?.message?.includes("not find") || error?.message?.includes("does not exist")) {
    return NextResponse.json({ data: [], migration_needed: true });
  }
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ data });
}

export async function POST(req: Request) {
  const auth = await requirePermission("create_campaign");
  if ("error" in auth) return auth.error;

  const sb = supabaseAdmin();
  const body = await req.json().catch(() => ({}));

  if (!body.name || !body.project_type) {
    return NextResponse.json({ error: "name and project_type are required" }, { status: 400 });
  }

  const { data, error } = await (sb as ReturnType<typeof supabaseAdmin>)
    .from("social_projects" as "companies")
    .insert(body as never)
    .select("*")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  await recordAudit({
    entity_type: "social_project",
    entity_id: null,
    action: "social_project.created",
    metadata: { name: body.name, lei_type: body.lei_type },
  });

  return NextResponse.json({ data }, { status: 201 });
}
