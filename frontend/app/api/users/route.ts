import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";
import type { UserRole } from "@/lib/auth/roles";
import { requirePermission } from "@/lib/auth/server-permission";
import { resolveTenantId } from "@/lib/tenants/current";

export const runtime = "nodejs";

// GET /api/users — list all platform users (scoped to the caller's own tenant)
export async function GET() {
  const sb = supabaseAdmin();
  const tenantId = await resolveTenantId();
  const { data, error } = await sb
    .from("platform_users" as "companies")
    .select("*")
    .eq("tenant_id" as "id", tenantId)
    .order("created_at" as "id", { ascending: true });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ users: data ?? [] });
}

// POST /api/users — invite a new user
export async function POST(req: Request) {
  const auth = await requirePermission("manage_users");
  if ("error" in auth) return auth.error;

  const body = await req.json().catch(() => null);
  if (!body?.email || !body?.full_name || !body?.role) {
    return NextResponse.json({ error: "email, full_name and role are required" }, { status: 400 });
  }

  const validRoles: UserRole[] = ["admin", "sales_rep", "approver", "viewer"];
  if (!validRoles.includes(body.role)) {
    return NextResponse.json({ error: `role must be one of: ${validRoles.join(", ")}` }, { status: 400 });
  }

  const sb = supabaseAdmin();

  // Scoped to this tenant — the same email could legitimately belong to a
  // different tenant's platform_users row (two unrelated clubs, same
  // person's email), so uniqueness is checked per-tenant, not globally.
  const { data: existing } = await sb
    .from("platform_users" as "companies")
    .select("id")
    .eq("email" as "id", body.email)
    .eq("tenant_id" as "id", auth.user.tenant_id)
    .maybeSingle();

  if (existing) {
    return NextResponse.json({ error: "A user with this email already exists" }, { status: 409 });
  }

  const { data, error } = await sb
    .from("platform_users" as "companies")
    .insert({
      tenant_id: auth.user.tenant_id,
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
