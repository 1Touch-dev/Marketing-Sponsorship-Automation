import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";
import { companyCreateSchema } from "@/lib/validators";
import { recordAudit } from "@/lib/audit/log";
import { enqueueCrmSync } from "@/lib/pipedrive/sync";

export const runtime = "nodejs";

export async function GET(req: Request) {
  const sb = supabaseAdmin();
  const { searchParams } = new URL(req.url);
  const q = searchParams.get("q")?.trim() ?? "";
  const industry = searchParams.get("industry")?.trim() ?? "";
  const limit = Math.min(parseInt(searchParams.get("limit") ?? "500", 10), 500);

  let query = sb
    .from("companies")
    .select("id, company_name, industry, website, country, status, contact_email, contact_name, logo_url, created_at")
    .order("company_name", { ascending: true })
    .limit(limit);

  if (industry) {
    query = query.ilike("industry", `%${industry}%`);
  }
  if (q) {
    query = query.ilike("company_name", `%${q}%`);
  }

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data ?? []);
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
  void enqueueCrmSync({
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
  }).catch(err => console.error("[CRM] company sync failed", err));

  return NextResponse.json({ data, discovery_triggered: true }, { status: 201 });
}
