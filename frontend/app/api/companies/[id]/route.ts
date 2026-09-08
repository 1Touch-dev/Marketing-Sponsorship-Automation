import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";
import { recordAudit } from "@/lib/audit/log";
import { extractDomainFromWebsite } from "@/lib/intelligence/domain-resolution";
import { requirePermission } from "@/lib/auth/server-permission";

export const runtime = "nodejs";

export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const sb = supabaseAdmin();
  const { data, error } = await sb.from("companies").select("*").eq("id", params.id).single();
  if (error) return NextResponse.json({ error: error.message }, { status: 404 });
  return NextResponse.json({ data });
}

export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  const auth = await requirePermission("edit_company");
  if ("error" in auth) return auth.error;

  const sb = supabaseAdmin();
  const body = await req.json().catch(() => ({}));

  // Only allow known fields to be updated
  const allowed = [
    "company_name", "industry", "website", "country", "notes", "status",
    "segment", "company_size", "business_type", "pipeline_stage",
    "contact_name", "contact_email", "contact_phone",
    "sponsorship_history", "tags", "logo_url",
    "competitors", "full_intelligence", "intelligence_updated_at",
  ];

  const updates: Record<string, unknown> = {};
  for (const key of allowed) {
    if (key in body) updates[key] = body[key];
  }

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: "No valid fields to update" }, { status: 400 });
  }

  // Capture previous website before update (for re-enrich detection)
  const { data: existing } = await sb
    .from("companies")
    .select("website")
    .eq("id", params.id)
    .maybeSingle();

  const { data, error } = await sb
    .from("companies")
    .update(updates)
    .eq("id", params.id)
    .select("*")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  await recordAudit({
    entity_type: "company",
    entity_id: params.id,
    action: "company.updated",
    metadata: { fields: Object.keys(updates) },
  });

  // ── Re-enrich when website/domain changes ────────────────────────────────
  if ("website" in updates && updates.website !== existing?.website) {
    const oldDomain = extractDomainFromWebsite(existing?.website ?? "");
    const newDomain = extractDomainFromWebsite(updates.website as string ?? "");
    if (newDomain && newDomain !== oldDomain) {
      // Fire-and-forget: do not await — client gets response immediately
      void fetch(
        new URL(`/api/intelligence/enrich`, process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000").toString(),
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ company_id: params.id }),
          signal: AbortSignal.timeout(5_000),
        }
      ).catch(() => {
        // Non-fatal — enrichment will run next time user clicks Enrich
      });
    }
  }

  return NextResponse.json({ data, re_enriching: "website" in updates });
}

export async function DELETE(_req: Request, { params }: { params: { id: string } }) {
  const auth = await requirePermission("delete_company");
  if ("error" in auth) return auth.error;

  const sb = supabaseAdmin();

  await recordAudit({
    entity_type: "company",
    entity_id: params.id,
    action: "company.deleted",
    metadata: {},
  });

  const { error } = await sb.from("companies").delete().eq("id", params.id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ success: true });
}
