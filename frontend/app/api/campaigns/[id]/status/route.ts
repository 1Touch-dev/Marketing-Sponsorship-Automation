import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";

export const runtime = "nodejs";

export async function PATCH(req: Request, ctx: { params: { id: string } }) {
  const body = await req.json().catch(() => ({}));
  const { status } = body as { status?: string };

  if (!status || !["approved", "rejected"].includes(status)) {
    return NextResponse.json({ error: "Invalid status" }, { status: 400 });
  }

  const sb = supabaseAdmin();
  const { data, error } = await sb
    .from("campaigns")
    .update({ status })
    .eq("id", ctx.params.id)
    .select("id, status")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ data });
}
