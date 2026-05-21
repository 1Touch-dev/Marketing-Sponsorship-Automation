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
      segment: parsed.data.segment ?? "local",
      company_size: parsed.data.company_size ?? "medium",
      business_type: parsed.data.business_type ?? "B2C",
      pipeline_stage: parsed.data.pipeline_stage ?? "prospect",
      contact_name: parsed.data.contact_name ?? null,
      contact_email: parsed.data.contact_email || null,
      contact_phone: parsed.data.contact_phone ?? null,
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

  // ── Fire-and-forget: auto-trigger competitor discovery in background ────────
  // We kick this off without awaiting so the response returns immediately.
  // The discovery runs async and populates competitors + differentiators.
  const appUrl = process.env.APP_URL ?? "http://localhost:3000";
  fetch(`${appUrl}/api/companies/${data.id}/discover`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
  }).catch(() => {
    // Silently fail — discovery is non-blocking, can be retried from the UI
  });

  // ── Fire-and-forget: sync to Pipedrive as Organization ───────────────────
  fetch(`${appUrl}/api/crm`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      entity_type: "company",
      entity_id: data.id,
      operation: "create",
      payload: {
        company_name: data.company_name,
        website: data.website,
        industry: data.industry,
        segment: data.segment,
        city: null,
      },
    }),
  }).catch(() => {});

  return NextResponse.json({ data, discovery_triggered: true }, { status: 201 });
}
