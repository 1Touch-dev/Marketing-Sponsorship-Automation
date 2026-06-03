import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";

export const runtime = "nodejs";

export async function PATCH(req: Request, ctx: { params: { id: string } }) {
  const body = await req.json().catch(() => ({})) as { status?: string };
  const validStatuses = ["draft", "under_review", "approved", "rejected", "sent", "revision_requested"];

  if (!body.status || !validStatuses.includes(body.status)) {
    return NextResponse.json({ error: "Invalid status" }, { status: 400 });
  }

  const sb = supabaseAdmin();
  const { data, error } = await sb
    .from("proposals")
    .update({ status: body.status, updated_at: new Date().toISOString() })
    .eq("id", ctx.params.id)
    .select("id, status")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}
