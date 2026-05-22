import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";
import type { UserRole } from "@/lib/auth/roles";

export const runtime = "nodejs";

// PATCH /api/users/[id] — update role or active status
export async function PATCH(
  req: Request,
  ctx: { params: { id: string } }
) {
  const id = ctx.params.id;
  const body = await req.json().catch(() => null);
  if (!body) return NextResponse.json({ error: "Invalid body" }, { status: 400 });

  const validRoles: UserRole[] = ["admin", "sales_rep", "approver", "viewer"];
  if (body.role && !validRoles.includes(body.role)) {
    return NextResponse.json({ error: `Invalid role` }, { status: 400 });
  }

  const update: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (body.role !== undefined) update.role = body.role;
  if (body.is_active !== undefined) update.is_active = body.is_active;
  if (body.full_name !== undefined) update.full_name = body.full_name.trim();

  const sb = supabaseAdmin();
  const { data, error } = await sb
    .from("platform_users" as "companies")
    .update(update as unknown as Record<string, unknown>)
    .eq("id" as "id", id)
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ user: data });
}

// DELETE /api/users/[id] — deactivate (soft delete)
export async function DELETE(
  _req: Request,
  ctx: { params: { id: string } }
) {
  const id = ctx.params.id;
  const sb = supabaseAdmin();
  const { error } = await sb
    .from("platform_users" as "companies")
    .update({ is_active: false, updated_at: new Date().toISOString() } as unknown as Record<string, unknown>)
    .eq("id" as "id", id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true });
}
