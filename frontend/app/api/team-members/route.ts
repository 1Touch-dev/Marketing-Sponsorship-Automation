import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";
import { recordAudit } from "@/lib/audit/log";

export const runtime = "nodejs";

export async function GET() {
  const sb = supabaseAdmin();
  const { data, error } = await sb
    .from("team_members")
    .select("*")
    .order("default_sender", { ascending: false })
    .order("full_name");

  if (error?.code === "42P01" || error?.code === "PGRST205") return NextResponse.json({ data: [], migration_pending: true });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ data: data ?? [] });
}

export async function POST(req: Request) {
  const sb = supabaseAdmin();
  const body = await req.json().catch(() => ({})) as {
    full_name: string;
    title?: string;
    email: string;
    phone?: string;
    bio?: string;
    signature?: string;
    default_sender?: boolean;
    active?: boolean;
  };

  if (!body.full_name || !body.email) {
    return NextResponse.json({ error: "full_name and email are required" }, { status: 400 });
  }

  // Enforce single default sender
  if (body.default_sender) {
    await sb.from("team_members").update({ default_sender: false } as never).eq("default_sender", true as never);
  }

  const { data, error } = await sb
    .from("team_members")
    .insert({
      full_name: body.full_name,
      title: body.title ?? null,
      email: body.email,
      phone: body.phone ?? null,
      bio: body.bio ?? null,
      signature: body.signature ?? null,
      default_sender: body.default_sender ?? false,
      active: body.active ?? true,
    })
    .select("*")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  await recordAudit({
    entity_type: "team_member",
    entity_id: data.id,
    action: "team_member.created",
    metadata: { name: body.full_name, email: body.email },
  });

  return NextResponse.json({ data }, { status: 201 });
}
