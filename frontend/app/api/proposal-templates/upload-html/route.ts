/**
 * POST /api/proposal-templates/upload-html
 * Accepts multipart/form-data with an HTML file, scans it for `[[TOKEN]]` /
 * `[[IMG:KEY]]` placeholders, stores the raw file in Supabase Storage, and
 * creates (or updates) a `proposal_templates` row with `source_type = 'html'`.
 *
 * Body (multipart): file, name, industry?, description?, template_id? (to re-upload/replace)
 */
import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";
import { recordAudit } from "@/lib/audit/log";
import { buildPlaceholderConfig, type PlaceholderConfig } from "@/lib/presentations/placeholder-parser";

export const runtime = "nodejs";
export const maxDuration = 30;

const BUCKET = "proposal-assets";

export async function POST(req: Request) {
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

  const maxBytes = 5 * 1024 * 1024; // 5 MB — HTML templates should be small
  if (file.size > maxBytes) return NextResponse.json({ error: "File too large (max 5 MB)" }, { status: 413 });

  const lowerName = file.name.toLowerCase();
  if (!lowerName.endsWith(".html") && !lowerName.endsWith(".htm") && file.type !== "text/html") {
    return NextResponse.json({ error: "Only .html/.htm files are accepted (PPT/Slides coming later)" }, { status: 415 });
  }

  const html = await file.text();
  if (!html.trim()) return NextResponse.json({ error: "Uploaded file is empty" }, { status: 400 });

  // Preserve existing placeholder config (prompts/types already set) when re-uploading.
  let existingConfig: PlaceholderConfig[] = [];
  if (templateId) {
    const { data: existing } = await sb
      .from("proposal_templates")
      .select("placeholder_config")
      .eq("id", templateId)
      .maybeSingle();
    existingConfig = ((existing as { placeholder_config?: PlaceholderConfig[] } | null)?.placeholder_config) ?? [];
  }

  const placeholderConfig = buildPlaceholderConfig(html, existingConfig);

  const safeName = file.name.replace(/[^a-z0-9._-]/gi, "_").toLowerCase();
  const storagePath = `templates/${templateId ?? "new"}_${Date.now()}_${safeName}`;

  const buffer = Buffer.from(await file.arrayBuffer());
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
      .select("*")
      .single());
  } else {
    ({ data, error } = await sb
      .from("proposal_templates")
      .insert({
        ...upsertPayload,
        content: JSON.stringify({ sections: [], default_content: {}, image_placeholders: [] }),
        variables: JSON.stringify([]),
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
