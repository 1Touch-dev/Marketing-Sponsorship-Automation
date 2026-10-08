import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";
import { recordAudit } from "@/lib/audit/log";
import { extractDomainFromWebsite } from "@/lib/intelligence/domain-resolution";
import { requirePermission } from "@/lib/auth/server-permission";
import { resolveTenantId } from "@/lib/tenants/current";
import { loadStage, recordQualification } from "@/lib/accounts/store";
import { QUALIFYING_PIPELINE_STAGES } from "@/lib/accounts/stage";
import { userActor } from "@/lib/identity/actor";
import { deleteRecord, readDeleteOptions } from "@/lib/records/tombstones";

export const runtime = "nodejs";

export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const sb = supabaseAdmin();
  const tenantId = await resolveTenantId();
  const { data, error } = await sb.from("companies").select("*").eq("id", params.id).eq("tenant_id", tenantId).single();
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
    .eq("tenant_id", auth.user.tenant_id)
    .maybeSingle();

  const { data, error } = await sb
    .from("companies")
    .update(updates)
    .eq("id", params.id)
    .eq("tenant_id", auth.user.tenant_id)
    .select("*")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // A person moving a card into a "real opportunity" column is a human decision, so it is
  // recorded as a qualification (once). Moving it back does not undo it: revoke explicitly.
  if (typeof updates.pipeline_stage === "string" && (QUALIFYING_PIPELINE_STAGES as readonly string[]).includes(updates.pipeline_stage)) {
    const stage = await loadStage(sb, auth.user.tenant_id, params.id);
    if (stage.ok && stage.value.stage !== "qualified") {
      await recordQualification(sb, auth.user.tenant_id, params.id, {
        decision: "qualified",
        reason: `Moved to "${updates.pipeline_stage}" in the pipeline by ${auth.user.email}`,
        actorEmail: auth.user.email,
        actorUserId: auth.user.id,
      });
    }
  }

  await recordAudit({ actor: userActor(auth.user),
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

/**
 * DELETE /api/companies/[id]?reason=...&confirm=true
 * The delete is kept as a tombstone and can be undone. A company with contracts in force, delivery work, cash lines
 * or issued recaps is refused until the caller confirms and says why.
 */
export async function DELETE(req: Request, { params }: { params: { id: string } }) {
  const auth = await requirePermission("delete_company");
  if ("error" in auth) return auth.error;

  const sb = supabaseAdmin();
  const opts = await readDeleteOptions(req);
  const res = await deleteRecord(sb, { table: "companies", id: params.id, tenantId: auth.user.tenant_id, actor: userActor(auth.user), ...opts });
  if (!res.ok) return NextResponse.json({ error: res.error, blockers: res.blockers ?? [], dependents: res.dependents ?? {} }, { status: res.status });

  await recordAudit({ actor: userActor(auth.user),
    entity_type: "company",
    entity_id: params.id,
    action: "company.deleted",
    metadata: { reason: opts.reason, dependents: res.dependents, confirmed: opts.confirm },
  });

  return NextResponse.json({ success: true, dependents: res.dependents });
}
