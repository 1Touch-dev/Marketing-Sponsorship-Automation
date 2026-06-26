import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const sb = supabaseAdmin();
  const body = await req.json() as { expires_at?: string | null };

  const { error } = await sb
    .from("proposals")
    .update({ expires_at: body.expires_at ?? null } as Record<string, unknown>)
    .eq("id", params.id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
