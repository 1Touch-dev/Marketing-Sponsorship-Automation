import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";
import { recordAudit } from "@/lib/audit/log";
import { requirePermission } from "@/lib/auth/server-permission";
import type { ProposalContent } from "@/types/database";

export const runtime = "nodejs";
export const maxDuration = 30;

/**
 * Data-room-style document bundle (Task 9) — supporting documents (decks,
 * spec sheets, media kits, contracts-in-progress) attached to a proposal
 * and downloadable from the public share page. Separate from
 * upload-asset/route.ts, which is image-only and has logo-specific side
 * effects — documents here are broader file types and never touch
 * companies.logo_url.
 *
 * POST /api/proposals/:id/documents — multipart/form-data, field "file"
 * DELETE /api/proposals/:id/documents — body { path }
 */
const ALLOWED_TYPES = [
  "application/pdf",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation", // .pptx
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document", // .docx
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", // .xlsx
  "application/msword",
  "application/vnd.ms-powerpoint",
  "application/vnd.ms-excel",
  "application/zip",
];
const MAX_BYTES = 25 * 1024 * 1024;

export async function POST(req: Request, ctx: { params: { id: string } }) {
  const auth = await requirePermission("edit_proposal");
  if ("error" in auth) return auth.error;

  const sb = supabaseAdmin();
  const { id } = ctx.params;

  const { data: proposal } = await sb
    .from("proposals")
    .select("id, content")
    .eq("id", id)
    .eq("tenant_id", auth.user.tenant_id)
    .maybeSingle();
  if (!proposal) return NextResponse.json({ error: "Proposal not found" }, { status: 404 });

  let formData: FormData;
  try {
    formData = await req.formData();
  } catch {
    return NextResponse.json({ error: "Invalid multipart form data" }, { status: 400 });
  }

  const file = formData.get("file") as File | null;
  if (!file) return NextResponse.json({ error: "No file provided" }, { status: 400 });
  if (file.size > MAX_BYTES) return NextResponse.json({ error: "File too large (max 25 MB)" }, { status: 413 });
  if (!ALLOWED_TYPES.includes(file.type)) {
    return NextResponse.json({ error: "Invalid file type. PDF, PPTX, DOCX, XLSX, or ZIP only." }, { status: 415 });
  }

  const safeName = file.name.replace(/[^a-z0-9._-]/gi, "_");
  const path = `proposals/${id}/documents/${Date.now()}_${safeName}`;

  const buffer = Buffer.from(await file.arrayBuffer());
  const bucket = (sb as any).storage.from("proposal-assets");
  let { error: uploadError } = await bucket.upload(path, buffer, { contentType: file.type, upsert: true });
  if (uploadError && /not found|does not exist/i.test(uploadError.message ?? "")) {
    await (sb as any).storage.createBucket("proposal-assets", { public: true });
    ({ error: uploadError } = await bucket.upload(path, buffer, { contentType: file.type, upsert: true }));
  }
  if (uploadError) return NextResponse.json({ error: uploadError.message }, { status: 500 });

  const { data: publicUrl } = bucket.getPublicUrl(path);
  const url = publicUrl?.publicUrl ?? "";

  const content = (proposal.content as ProposalContent) ?? {};
  const bundle = content.document_bundle ?? [];
  const entry = { url, path, name: file.name, size: file.size, uploaded_at: new Date().toISOString() };
  bundle.push(entry);
  await sb.from("proposals").update({ content: { ...content, document_bundle: bundle } }).eq("id", id);

  await recordAudit({
    entity_type: "proposal",
    entity_id: id,
    action: "proposal.document_uploaded",
    metadata: { file_name: file.name, size: file.size },
  });

  return NextResponse.json({ document: entry }, { status: 201 });
}

export async function DELETE(req: Request, ctx: { params: { id: string } }) {
  const auth = await requirePermission("edit_proposal");
  if ("error" in auth) return auth.error;

  const sb = supabaseAdmin();
  const { id } = ctx.params;

  let body: { path?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  const path = body.path?.trim();
  if (!path) return NextResponse.json({ error: "Document path required" }, { status: 400 });
  if (!path.startsWith(`proposals/${id}/documents/`)) {
    return NextResponse.json({ error: "Document does not belong to this proposal" }, { status: 403 });
  }

  const { data: proposal } = await sb
    .from("proposals")
    .select("content")
    .eq("id", id)
    .eq("tenant_id", auth.user.tenant_id)
    .maybeSingle();
  if (!proposal) return NextResponse.json({ error: "Proposal not found" }, { status: 404 });

  const content = (proposal.content as ProposalContent) ?? {};
  const remaining = (content.document_bundle ?? []).filter((d) => d.path !== path);

  await (sb as any).storage.from("proposal-assets").remove([path]);
  await sb.from("proposals").update({ content: { ...content, document_bundle: remaining } }).eq("id", id);

  await recordAudit({
    entity_type: "proposal",
    entity_id: id,
    action: "proposal.document_deleted",
    metadata: { path },
  });

  return NextResponse.json({ deleted: true });
}
