import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";
import { recordAudit } from "@/lib/audit/log";

export const runtime = "nodejs";

export async function GET() {
  const sb = supabaseAdmin();
  const { data, error } = await sb
    .from("email_templates")
    .select("*")
    .eq("active", true)
    .order("is_default", { ascending: false })
    .order("name");

  if (error?.code === "42P01") return NextResponse.json({ data: [], migration_pending: true });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ data: data ?? [] });
}

export async function POST(req: Request) {
  const sb = supabaseAdmin();
  const body = await req.json().catch(() => ({})) as {
    name: string;
    description?: string;
    subject: string;
    body_html: string;
    body_text?: string;
    variables?: string[];
    is_default?: boolean;
  };

  if (!body.name || !body.subject || !body.body_html) {
    return NextResponse.json({ error: "name, subject, and body_html are required" }, { status: 400 });
  }

  if (body.is_default) {
    await sb.from("email_templates").update({ is_default: false } as never).eq("is_default", true as never);
  }

  const { data, error } = await sb
    .from("email_templates")
    .insert({
      name: body.name,
      description: body.description ?? null,
      subject: body.subject,
      body_html: body.body_html,
      body_text: body.body_text ?? null,
      variables: JSON.stringify(body.variables ?? []),
      is_default: body.is_default ?? false,
    } as never)
    .select("*")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  await recordAudit({
    entity_type: "email_template",
    entity_id: (data as { id: string }).id,
    action: "email_template.created",
    metadata: { name: body.name },
  });

  return NextResponse.json({ data }, { status: 201 });
}
