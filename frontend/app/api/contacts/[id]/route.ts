import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";
import { requirePermission } from "@/lib/auth/server-permission";

export const runtime = "nodejs";

export async function DELETE(
  _req: Request,
  { params }: { params: { id: string } }
) {
  const auth = await requirePermission("edit_company");
  if ("error" in auth) return auth.error;

  const sb = supabaseAdmin();
  const { error } = await sb.from("contacts").delete().eq("id", params.id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true });
}

export async function PATCH(
  req: Request,
  { params }: { params: { id: string } }
) {
  const auth = await requirePermission("edit_company");
  if ("error" in auth) return auth.error;

  const sb = supabaseAdmin();
  const body = await req.json().catch(() => ({}));
  const { data, error } = await sb
    .from("contacts")
    .update(body)
    .eq("id", params.id)
    .select("*")
    .maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}
