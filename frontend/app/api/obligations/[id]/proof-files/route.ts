import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";
import { resolveTenantId } from "@/lib/tenants/current";
import { requirePermission } from "@/lib/auth/server-permission";
import { recordAudit } from "@/lib/audit/log";
import { userActor } from "@/lib/identity/actor";
import { listProofFiles, saveProofFile } from "@/lib/delivery/proof";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

/** The files uploaded as proof for this obligation. */
export async function GET(_req: Request, ctx: { params: { id: string } }) {
  const tenantId = await resolveTenantId();
  const files = await listProofFiles(supabaseAdmin(), tenantId, [ctx.params.id]);
  return NextResponse.json({ data: (files.get(ctx.params.id) ?? []).map(({ storage_path: _p, storage_bucket: _b, ...f }) => f) });
}

/**
 * POST (multipart, field "file"): stores a file as proof for this obligation and returns its id. To use it as proof, send
 * that id as `evidence_ref` with `evidence_kind: "file"` to /api/obligations/<id>/events. A PDF, an image or an MP4, up to 15 MB.
 */
export async function POST(req: Request, ctx: { params: { id: string } }) {
  const auth = await requirePermission("manage_obligations");
  if ("error" in auth) return auth.error;
  const sb = supabaseAdmin();
  const { data: o } = await sb.from("obligations").select("id, company_id").eq("id", ctx.params.id).eq("tenant_id", auth.user.tenant_id).maybeSingle();
  if (!o) return NextResponse.json({ error: "Obligation not found" }, { status: 404 });
  const form = await req.formData().catch(() => null);
  const file = form?.get("file");
  if (!form || !(file instanceof File)) return NextResponse.json({ error: "Send the file as multipart/form-data in the field \"file\"." }, { status: 400 });
  const saved = await saveProofFile(sb, auth.user.tenant_id, o as { id: string; company_id: string }, { bytes: Buffer.from(await file.arrayBuffer()), fileName: file.name || "proof", uploadedBy: auth.user.email });
  if (!saved.ok) return NextResponse.json({ error: saved.error }, { status: saved.status });
  await recordAudit({ actor: userActor(auth.user), entity_type: "obligation", entity_id: ctx.params.id, action: "obligation.proof_file_uploaded", actor_email: auth.user.email, tenant_id: auth.user.tenant_id, metadata: { file_id: saved.value.id, sha256: saved.value.sha256, size_bytes: saved.value.size_bytes } });
  const { storage_path: _p, storage_bucket: _b, ...out } = saved.value;
  return NextResponse.json(out, { status: 201 });
}
