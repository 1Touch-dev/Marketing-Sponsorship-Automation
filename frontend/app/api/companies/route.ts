import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";
import { companyCreateSchema } from "@/lib/validators";
import { recordAudit } from "@/lib/audit/log";

export const runtime = "nodejs";

export async function GET() {
  const sb = supabaseAdmin();
  const { data, error } = await sb.from("companies").select("*").order("created_at", { ascending: false });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ data });
}

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const parsed = companyCreateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid payload", issues: parsed.error.issues }, { status: 400 });
  }

  const sb = supabaseAdmin();
  const { data, error } = await sb
    .from("companies")
    .insert({
      company_name: parsed.data.company_name,
      industry: parsed.data.industry ?? null,
      website: parsed.data.website || null,
      country: parsed.data.country ?? "BR",
      notes: parsed.data.notes ?? null,
      status: parsed.data.status ?? "prospect",
    })
    .select("*")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  await recordAudit({
    entity_type: "company",
    entity_id: data.id,
    action: "company.created",
    metadata: { company_name: data.company_name },
  });

  return NextResponse.json({ data }, { status: 201 });
}
