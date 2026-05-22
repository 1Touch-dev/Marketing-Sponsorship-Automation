import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";
import type { UserRole } from "@/lib/auth/roles";

export const runtime = "nodejs";

// GET /api/users — list all platform users
export async function GET() {
  const sb = supabaseAdmin();
  const { data, error } = await sb
    .from("platform_users" as "companies")
    .select("*")
    .order("created_at" as "id", { ascending: true });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ users: data ?? [] });
}

// POST /api/users — invite a new user
export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  if (!body?.email || !body?.full_name || !body?.role) {
    return NextResponse.json({ error: "email, full_name and role are required" }, { status: 400 });
  }

  const validRoles: UserRole[] = ["admin", "sales_rep", "approver", "viewer"];
  if (!validRoles.includes(body.role)) {
    return NextResponse.json({ error: `role must be one of: ${validRoles.join(", ")}` }, { status: 400 });
  }

  const sb = supabaseAdmin();

  const { data: existing } = await sb
    .from("platform_users" as "companies")
    .select("id")
    .eq("email" as "id", body.email)
    .maybeSingle();

  if (existing) {
    return NextResponse.json({ error: "A user with this email already exists" }, { status: 409 });
  }

  const { data, error } = await sb
    .from("platform_users" as "companies")
    .insert({
      email: body.email.trim().toLowerCase(),
      full_name: body.full_name.trim(),
      role: body.role,
      invited_by: body.invited_by ?? "admin",
    } as unknown as Record<string, unknown>)
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ user: data }, { status: 201 });
}
