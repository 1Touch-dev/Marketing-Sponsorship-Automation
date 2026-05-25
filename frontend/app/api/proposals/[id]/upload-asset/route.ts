import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";
import { recordAudit } from "@/lib/audit/log";

export const runtime = "nodejs";
export const maxDuration = 30;

/**
 * POST /api/proposals/:id/upload-asset
 * Accepts multipart/form-data with a file field named "file"
 * Uploads to Supabase Storage bucket "proposal-assets"
 * Returns { url, path, name }
 */
export async function POST(req: Request, ctx: { params: { id: string } }) {
  const sb = supabaseAdmin();
  const { id } = ctx.params;

  const { data: proposal } = await sb.from("proposals").select("id").eq("id", id).maybeSingle();
  if (!proposal) return NextResponse.json({ error: "Proposal not found" }, { status: 404 });

  let formData: FormData;
  try {
    formData = await req.formData();
  } catch {
    return NextResponse.json({ error: "Invalid multipart form data" }, { status: 400 });
  }

  const file = formData.get("file") as File | null;
  if (!file) return NextResponse.json({ error: "No file provided" }, { status: 400 });

  const maxBytes = 10 * 1024 * 1024; // 10 MB
  if (file.size > maxBytes) return NextResponse.json({ error: "File too large (max 10 MB)" }, { status: 413 });

  const allowedTypes = ["image/png", "image/jpeg", "image/webp", "image/svg+xml", "image/gif"];
  if (!allowedTypes.includes(file.type)) {
    return NextResponse.json({ error: "Invalid file type. Only PNG, JPEG, WEBP, SVG, GIF allowed." }, { status: 415 });
  }

  const safeName = file.name.replace(/[^a-z0-9._-]/gi, "_").toLowerCase();
  const path = `proposals/${id}/${Date.now()}_${safeName}`;

  const arrayBuffer = await file.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);

  const { error: uploadError } = await (sb as any).storage
    .from("proposal-assets")
    .upload(path, buffer, {
      contentType: file.type,
      upsert: true,
    });

  if (uploadError) {
    // Try creating the bucket first if it doesn't exist
    if (uploadError.message?.includes("not found") || uploadError.message?.includes("does not exist")) {
      await (sb as any).storage.createBucket("proposal-assets", { public: true });
      const { error: retry } = await (sb as any).storage
        .from("proposal-assets")
        .upload(path, buffer, { contentType: file.type, upsert: true });
      if (retry) return NextResponse.json({ error: retry.message }, { status: 500 });
    } else {
      return NextResponse.json({ error: uploadError.message }, { status: 500 });
    }
  }

  const { data: publicUrl } = (sb as any).storage.from("proposal-assets").getPublicUrl(path);
  const url = publicUrl?.publicUrl ?? "";

  // Store asset URL in proposal content JSONB
  const { data: currentProposal } = await sb.from("proposals").select("content").eq("id", id).single();
  const content = (currentProposal?.content as Record<string, unknown>) ?? {};
  const existingAssets = (content.uploaded_assets as Array<{ url: string; name: string; path: string }>) ?? [];
  existingAssets.push({ url, name: file.name, path });
  await sb.from("proposals").update({ content: { ...content, uploaded_assets: existingAssets } }).eq("id", id);

  await recordAudit({
    entity_type: "proposal",
    entity_id: id,
    action: "proposal.asset_uploaded",
    metadata: { file_name: file.name, url },
  });

  return NextResponse.json({ url, path, name: file.name }, { status: 201 });
}
