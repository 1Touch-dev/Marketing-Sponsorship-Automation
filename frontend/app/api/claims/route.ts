import { NextResponse } from "next/server";
import { z } from "zod";
import { supabaseAdmin } from "@/lib/supabase/server";
import { resolveTenantId } from "@/lib/tenants/current";
import { requirePermission } from "@/lib/auth/server-permission";
import { recordAudit } from "@/lib/audit/log";
import { createClaim, loadRegistry } from "@/lib/claims/store";
import { SOURCE_KINDS } from "@/lib/claims/status";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** The registry with each claim's derived state, so a reviewer sees what is blocking it. */
export async function GET() {
  const tenantId = await resolveTenantId();
  const res = await loadRegistry(supabaseAdmin(), tenantId);
  if (!res.ok) {
    if (res.reason === "migration_missing") return NextResponse.json({ data: [], migration_needed: true });
    return NextResponse.json({ error: res.error }, { status: 500 });
  }

  const byState: Record<string, number> = {};
  for (const e of res.entries) byState[e.evaluation.state] = (byState[e.evaluation.state] ?? 0) + 1;

  return NextResponse.json({
    as_of: new Date().toISOString(),
    summary: { total: res.entries.length, usable: res.entries.filter((e) => e.evaluation.usable).length, by_state: byState },
    data: res.entries.map((e) => ({
      id: e.id,
      key: e.key,
      category: e.category,
      label: e.label,
      retired_at: e.retired_at,
      version_count: e.versionCount,
      current: e.current,
      state: e.evaluation.state,
      usable: e.evaluation.usable,
      reasons: e.evaluation.reasons,
      days_to_expiry: e.evaluation.daysToExpiry,
      reviews: e.reviews,
    })),
  });
}

const versionFields = {
  value: z.string().min(1).max(300),
  unit: z.string().max(60).nullish(),
  description: z.string().max(1000).nullish(),
  source_kind: z.enum(SOURCE_KINDS),
  source_ref: z.string().max(500).nullish(),
  source_url: z.string().max(1000).nullish(),
  effective_date: z.string().nullish(),
  expires_at: z.string().nullish(),
  owner: z.string().max(200).nullish(),
};

const createSchema = z.object({
  key: z.string().min(1).max(120),
  category: z.string().max(60).default("general"),
  label: z.string().min(1).max(200),
  ...versionFields,
});

export async function POST(req: Request) {
  const auth = await requirePermission("edit_claim");
  if ("error" in auth) return auth.error;

  const parsed = createSchema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: "Invalid payload", issues: parsed.error.issues }, { status: 400 });
  const { key, category, label, ...version } = parsed.data;

  const res = await createClaim(supabaseAdmin(), auth.user.tenant_id, { key, category, label, version, createdByEmail: auth.user.email });
  if (!res.ok) return NextResponse.json({ error: res.error }, { status: res.status });

  await recordAudit({ entity_type: "claim", entity_id: res.value.claimId, action: "claim.created", actor_email: auth.user.email, tenant_id: auth.user.tenant_id, metadata: { key, actor_user_id: auth.user.id } });
  return NextResponse.json({ claim_id: res.value.claimId, version_id: res.value.versionId }, { status: 201 });
}
