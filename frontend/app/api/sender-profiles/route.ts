import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";

export async function GET() {
  const sb = supabaseAdmin();
  let data: unknown[] = [];
  try {
    const res = await sb.from("sender_profiles").select("*").order("is_default", { ascending: false }).order("full_name");
    data = res.data ?? [];
  } catch { data = []; }
  return NextResponse.json(data);
}

export async function POST(req: NextRequest) {
  const sb = supabaseAdmin();
  const body = await req.json();
  let data: unknown = null;
  try {
    const res = await sb.from("sender_profiles").insert(body).select().single();
    data = res.data;
    if (res.error) return NextResponse.json({ error: res.error.message }, { status: 500 });
  } catch (e: unknown) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
  return NextResponse.json(data, { status: 201 });
}
