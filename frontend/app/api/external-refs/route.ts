import { NextResponse } from "next/server";
import { z } from "zod";
import { supabaseAdmin } from "@/lib/supabase/server";
import { resolveTenantId } from "@/lib/tenants/current";
import { requirePermission } from "@/lib/auth/server-permission";
import { recordAudit } from "@/lib/audit/log";
import { userActor } from "@/lib/identity/actor";
import { linkExternal, listExternal, resolveExternal } from "@/lib/sync/external-refs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/external-refs?entity_type=companies&entity_id=...      the outside IDs a record is linked to
 * GET /api/external-refs?system=pipedrive&entity_type=companies&external_id=...   what an outside ID points at here
 *   (with `deleted: true` when that record was deleted and not restored, so a sync does not recreate it)
 */
export async function GET(req: Request) {
  const u = new URL(req.url).searchParams;
  const sb = supabaseAdmin();
  const tenantId = await resolveTenantId();
  const type = u.get("entity_type") ?? "";
  if (u.get("system") && u.get("external_id")) {
    const r = await resolveExternal(sb, tenantId, u.get("system")!, type, u.get("external_id")!);
    return r.ok ? NextResponse.json({ link: r.value }) : NextResponse.json({ error: r.error }, { status: r.status });
  }
  if (!type || !u.get("entity_id")) return NextResponse.json({ error: "Give entity_type and entity_id, or system, entity_type and external_id." }, { status: 400 });
  const r = await listExternal(sb, tenantId, type, u.get("entity_id")!, u.get("include_unlinked") === "true");
  return r.ok ? NextResponse.json({ data: r.value }) : NextResponse.json({ error: r.error }, { status: r.status });
}

const schema = z.object({ entity_type: z.string().min(1).max(60), entity_id: z.string().uuid(), system: z.string().min(1).max(40), external_id: z.string().min(1).max(200) });

/** Link a record to its ID in an outside system. Safe to repeat; refuses to re-point an existing link. */
export async function POST(req: Request) {
  const auth = await requirePermission("manage_integrations");
  if ("error" in auth) return auth.error;
  const parsed = schema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: "Invalid payload", issues: parsed.error.issues }, { status: 400 });
  const d = parsed.data;
  const res = await linkExternal(supabaseAdmin(), auth.user.tenant_id, { entityType: d.entity_type, entityId: d.entity_id, system: d.system, externalId: d.external_id, actor: auth.user.email });
  if (!res.ok) return NextResponse.json({ error: res.error }, { status: res.status });
  if (res.value.created) await recordAudit({ actor: userActor(auth.user), entity_type: d.entity_type, entity_id: d.entity_id, action: "external_ref.linked", metadata: { system: d.system, external_id: d.external_id } });
  return NextResponse.json(res.value, { status: res.value.created ? 201 : 200 });
}
