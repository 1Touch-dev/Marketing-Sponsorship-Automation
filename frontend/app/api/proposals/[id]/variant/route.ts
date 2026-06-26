import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const sb = supabaseAdmin();
  const { data: variants } = await sb
    .from("proposal_variants")
    .select("*")
    .eq("proposal_id", params.id);
  return NextResponse.json(variants ?? []);
}

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const sb = supabaseAdmin();
  const body = await req.json();
  const { data, error } = await sb
    .from("proposal_variants")
    .insert({ ...body, proposal_id: params.id })
    .select()
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data, { status: 201 });
}
