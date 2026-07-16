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

  const { data: proposal } = await sb
    .from("proposals")
    .select("id, company_id")
    .eq("id", id)
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

  // Also update companies.logo_url so the graphics panel and all mockup
  // generators use THIS logo. The most recently uploaded logo always wins:
  // uploading a new logo overrides the previous one everywhere.
  const companyId = (proposal as { company_id?: string | null }).company_id;
  if (companyId) {
    await sb.from("companies").update({ logo_url: url }).eq("id", companyId);
  }

  await recordAudit({
    entity_type: "proposal",
    entity_id: id,
    action: "proposal.asset_uploaded",
    metadata: { file_name: file.name, url },
  });

  return NextResponse.json({ url, path, name: file.name, company_logo_updated: !!(companyId) }, { status: 201 });
}

/**
 * DELETE /api/proposals/:id/upload-asset
 * Body: { path: string }
 * Removes an uploaded asset from storage + proposal content. If the deleted
 * asset was the company's active logo, logo_url is reset to the most recent
 * remaining asset (or cleared if none remain).
 */
export async function DELETE(req: Request, ctx: { params: { id: string } }) {
  const sb = supabaseAdmin();
  const { id } = ctx.params;

  let body: { path?: string };
  try {
    body = (await req.json()) as { path?: string };
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  const path = body.path?.trim();
  if (!path) return NextResponse.json({ error: "Asset path required" }, { status: 400 });

  const { data: proposal } = await sb
    .from("proposals")
    .select("id, company_id, content")
    .eq("id", id)
    .maybeSingle();
  if (!proposal) return NextResponse.json({ error: "Proposal not found" }, { status: 404 });

  // Only allow deleting assets that belong to this proposal.
  if (!path.startsWith(`proposals/${id}/`)) {
    return NextResponse.json({ error: "Asset does not belong to this proposal" }, { status: 403 });
  }

  const content = ((proposal as { content?: Record<string, unknown> }).content ?? {}) as Record<
    string,
    unknown
  >;
  const existingAssets =
    (content.uploaded_assets as Array<{ url: string; name: string; path: string }>) ?? [];
  const deleted = existingAssets.find((a) => a.path === path);
  const remaining = existingAssets.filter((a) => a.path !== path);

  await (sb as any).storage.from("proposal-assets").remove([path]);

  await sb
    .from("proposals")
    .update({ content: { ...content, uploaded_assets: remaining } })
    .eq("id", id);

  // If the deleted asset was the active company logo, promote the most recent
  // remaining asset (or clear the logo entirely).
  let newLogoUrl: string | null = null;
  const companyId = (proposal as { company_id?: string | null }).company_id;
  if (companyId) {
    const { data: company } = await sb
      .from("companies")
      .select("logo_url")
      .eq("id", companyId)
      .maybeSingle();
    if (deleted && company?.logo_url === deleted.url) {
      newLogoUrl = remaining.length ? remaining[remaining.length - 1].url : null;
      await sb.from("companies").update({ logo_url: newLogoUrl }).eq("id", companyId);
    } else {
      newLogoUrl = company?.logo_url ?? null;
    }
  }

  await recordAudit({
    entity_type: "proposal",
    entity_id: id,
    action: "proposal.asset_deleted",
    metadata: { path, url: deleted?.url ?? null },
  });

  return NextResponse.json({ deleted: true, logo_url: newLogoUrl }, { status: 200 });
}
