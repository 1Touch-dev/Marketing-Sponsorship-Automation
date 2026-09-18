/**
 * POST /api/proposal-templates/upload-html
 * Accepts multipart/form-data with an HTML or .pptx file. A .pptx is
 * converted to HTML first (lib/presentations/pptx-to-html.ts) — from there
 * both formats share one path: scan for `[[TOKEN]]` / `[[IMG:KEY]]`
 * placeholders, store the (possibly converted) HTML in Supabase Storage,
 * and create/update a `proposal_templates` row with `source_type = 'html'`.
 *
 * Body (multipart): file, name, industry?, description?, template_id? (to re-upload/replace)
 */
import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";
import { recordAudit } from "@/lib/audit/log";
import { buildPlaceholderConfig, type PlaceholderConfig } from "@/lib/presentations/placeholder-parser";
import { convertPptxToHtml } from "@/lib/presentations/pptx-to-html";
import { requirePermission } from "@/lib/auth/server-permission";

export const runtime = "nodejs";
export const maxDuration = 30;

const BUCKET = "proposal-assets";

export async function POST(req: Request) {
  const auth = await requirePermission("manage_templates");
  if ("error" in auth) return auth.error;

  const sb = supabaseAdmin();

  let formData: FormData;
  try {
    formData = await req.formData();
  } catch {
    return NextResponse.json({ error: "Invalid multipart form data" }, { status: 400 });
  }

  const file = formData.get("file") as File | null;
  const name = (formData.get("name") as string | null)?.trim();
  const industry = (formData.get("industry") as string | null)?.trim() || null;
  const description = (formData.get("description") as string | null)?.trim() || null;
  const templateId = (formData.get("template_id") as string | null)?.trim() || null;

  if (!file) return NextResponse.json({ error: "No file provided" }, { status: 400 });
  if (!name && !templateId) return NextResponse.json({ error: "name is required" }, { status: 400 });

  const lowerName = file.name.toLowerCase();
  const isPptx = lowerName.endsWith(".pptx") || file.type === "application/vnd.openxmlformats-officedocument.presentationml.presentation";
  const isHtml = lowerName.endsWith(".html") || lowerName.endsWith(".htm") || file.type === "text/html";
  if (!isPptx && !isHtml) {
    return NextResponse.json({ error: "Only .html/.htm or .pptx files are accepted" }, { status: 415 });
  }

  // PowerPoint files carry embedded images, so they need more headroom than
  // a plain HTML template.
  const maxBytes = isPptx ? 25 * 1024 * 1024 : 5 * 1024 * 1024;
  if (file.size > maxBytes) {
    return NextResponse.json({ error: `File too large (max ${isPptx ? 25 : 5} MB)` }, { status: 413 });
  }

  let html: string;
  if (isPptx) {
    try {
      const pptxBuffer = Buffer.from(await file.arrayBuffer());
      const converted = await convertPptxToHtml(pptxBuffer, {
        tenantId: auth.user.tenant_id,
        storagePrefix: `templates/pptx-media/${templateId ?? "new"}_${Date.now()}`,
      });
      html = converted.html;
    } catch (err) {
      return NextResponse.json({ error: err instanceof Error ? err.message : "Could not read this .pptx file" }, { status: 400 });
    }
  } else {
    html = await file.text();
  }
  if (!html.trim()) return NextResponse.json({ error: "Uploaded file is empty" }, { status: 400 });

  // Preserve existing placeholder config (prompts/types already set) when re-uploading.
  let existingConfig: PlaceholderConfig[] = [];
  if (templateId) {
    const { data: existing } = await sb
      .from("proposal_templates")
      .select("placeholder_config")
      .eq("id", templateId)
      .eq("tenant_id", auth.user.tenant_id)
      .maybeSingle();
    existingConfig = ((existing as { placeholder_config?: PlaceholderConfig[] } | null)?.placeholder_config) ?? [];
  }

  const placeholderConfig = buildPlaceholderConfig(html, existingConfig);

  // Stored as HTML regardless of source format — a converted .pptx becomes a
  // normal HTML template from here on, reusing the whole render/PDF pipeline.
  const safeName = file.name.replace(/\.(pptx?|html?)$/i, "").replace(/[^a-z0-9._-]/gi, "_").toLowerCase();
  const storagePath = `templates/${templateId ?? "new"}_${Date.now()}_${safeName}.html`;

  const buffer = Buffer.from(html, "utf-8");
  const { error: uploadError } = await sb.storage.from(BUCKET).upload(storagePath, buffer, {
    contentType: "text/html",
    upsert: true,
  });
  if (uploadError) {
    if (/not found|does not exist/i.test(uploadError.message)) {
      await sb.storage.createBucket(BUCKET, { public: true }).catch(() => {});
      const { error: retryErr } = await sb.storage.from(BUCKET).upload(storagePath, buffer, {
        contentType: "text/html",
        upsert: true,
      });
      if (retryErr) return NextResponse.json({ error: retryErr.message }, { status: 500 });
    } else {
      return NextResponse.json({ error: uploadError.message }, { status: 500 });
    }
  }

  const htmlUrl = sb.storage.from(BUCKET).getPublicUrl(storagePath).data.publicUrl;

  const upsertPayload: Record<string, unknown> = {
    source_type: "html",
    html_storage_path: storagePath,
    html_url: htmlUrl,
    placeholder_config: placeholderConfig,
  };
  if (name) upsertPayload.name = name;
  if (industry) upsertPayload.industry = industry;
  if (description) upsertPayload.description = description;

  let data;
  let error;
  if (templateId) {
    ({ data, error } = await sb
      .from("proposal_templates")
      .update(upsertPayload as never)
      .eq("id", templateId)
      .eq("tenant_id", auth.user.tenant_id)
      .select("*")
      .single());
  } else {
    ({ data, error } = await sb
      .from("proposal_templates")
      .insert({
        ...upsertPayload,
        content: JSON.stringify({ sections: [], default_content: {}, image_placeholders: [] }),
        variables: JSON.stringify([]),
        tenant_id: auth.user.tenant_id,
      } as never)
      .select("*")
      .single());
  }

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  await recordAudit({
    entity_type: "proposal_template",
    entity_id: (data as { id: string }).id,
    action: templateId ? "proposal_template.html_replaced" : "proposal_template.html_uploaded",
    metadata: { name, industry, placeholders: placeholderConfig.length, file_name: file.name },
  });

  return NextResponse.json({ data }, { status: templateId ? 200 : 201 });
}
