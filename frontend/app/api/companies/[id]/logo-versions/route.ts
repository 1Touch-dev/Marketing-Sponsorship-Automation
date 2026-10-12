import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";
import { resolveTenantId } from "@/lib/tenants/current";
import { requirePermission } from "@/lib/auth/server-permission";
import { recordAudit } from "@/lib/audit/log";
import { userActor } from "@/lib/identity/actor";
import { archivePendingLogos, imageLogoStatus, listLogoVersions } from "@/lib/delivery/logo-versions";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** Every version of this sponsor's logo (newest first), and which generated images were made from a logo that has since been replaced. */
export async function GET(_req: Request, ctx: { params: { id: string } }) {
  const tenantId = await resolveTenantId();
  const sb = supabaseAdmin();
  const { data: company } = await sb.from("companies").select("id").eq("id", ctx.params.id).eq("tenant_id", tenantId).maybeSingle();
  if (!company) return NextResponse.json({ error: "Company not found" }, { status: 404 });
  const images = await imageLogoStatus(sb, tenantId, ctx.params.id);
  if (!images.ok) return NextResponse.json({ error: images.error }, { status: images.status });
  return NextResponse.json({ versions: await listLogoVersions(sb, tenantId, ctx.params.id), images: images.value });
}

/** Copies any version of the logo that has not been copied into storage yet (the address alone can stop working). */
export async function POST(_req: Request, ctx: { params: { id: string } }) {
  const auth = await requirePermission("run_intelligence");
  if ("error" in auth) return auth.error;
  const sb = supabaseAdmin();
  const { data: company } = await sb.from("companies").select("id").eq("id", ctx.params.id).eq("tenant_id", auth.user.tenant_id).maybeSingle();
  if (!company) return NextResponse.json({ error: "Company not found" }, { status: 404 });
  const out = await archivePendingLogos(sb, auth.user.tenant_id, ctx.params.id);
  await recordAudit({ actor: userActor(auth.user), entity_type: "company", entity_id: ctx.params.id, action: "company.logo_versions_archived", metadata: out });
  return NextResponse.json(out);
}
