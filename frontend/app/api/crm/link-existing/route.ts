import { NextResponse } from "next/server";
import { z } from "zod";
import { supabaseAdmin } from "@/lib/supabase/server";
import { requirePermission } from "@/lib/auth/server-permission";
import { recordAudit } from "@/lib/audit/log";
import { userActor } from "@/lib/identity/actor";
import { pushContext, person } from "@/lib/pipedrive/context";
import { linkExisting } from "@/lib/pipedrive/link-existing";

export const runtime = "nodejs";
export const maxDuration = 120;

const schema = z.object({
  apply: z.boolean().optional(),
  suggest: z.boolean().optional(),
  link: z.array(z.object({ company_id: z.string().uuid(), pipedrive_org_id: z.number().int().positive() })).max(100).optional(),
});

/**
 * POST /api/crm/link-existing   { apply?, suggest?, link?: [{ company_id, pipedrive_org_id }] }
 * Checks the Pipedrive IDs this platform already holds against Pipedrive, and (with apply) links the ones that exist. Without
 * `apply` it only reports. With `suggest` it also lists companies that have no ID but whose exact name is already an
 * organization in Pipedrive; those are never linked on their own: a person confirms each pair in `link`. Reads from
 * Pipedrive only. See lib/pipedrive/link-existing.ts for why this is not done in the migration.
 */
export async function POST(req: Request) {
  const auth = await requirePermission("manage_integrations");
  if ("error" in auth) return auth.error;
  const parsed = schema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: "Invalid payload", issues: parsed.error.issues }, { status: 400 });
  const sb = supabaseAdmin();
  const report = await linkExisting(pushContext(sb, auth.user.tenant_id, person(auth.user.email), "backfill"), parsed.data);
  if (!report.dry_run) {
    await recordAudit({ actor: userActor(auth.user), entity_type: "integration", action: "pipedrive.links_added", metadata: { deals: report.deals.linked, organizations: report.organizations.linked, confirmed: report.confirmed.filter((c) => c.linked).length } });
  }
  return NextResponse.json(report);
}
