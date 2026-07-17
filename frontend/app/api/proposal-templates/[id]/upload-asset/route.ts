/**
 * POST /api/proposal-templates/[id]/upload-asset
 * Uploads a base image or logo override for one placeholder on this template.
 * Body (multipart): file
 * Returns { url } to be saved into that placeholder's base_image_url via
 * PATCH /api/proposal-templates/[id]/placeholders.
 */
import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const maxDuration = 30;

const BUCKET = "proposal-assets";

export async function POST(req: Request, ctx: { params: { id: string } }) {
  const sb = supabaseAdmin();

  let formData: FormData;
  try {
    formData = await req.formData();
  } catch {
    return NextResponse.json({ error: "Invalid multipart form data" }, { status: 400 });
  }

  const file = formData.get("file") as File | null;
  if (!file) return NextResponse.json({ error: "No file provided" }, { status: 400 });

  const maxBytes = 10 * 1024 * 1024;
  if (file.size > maxBytes) return NextResponse.json({ error: "File too large (max 10 MB)" }, { status: 413 });

  const allowedTypes = ["image/png", "image/jpeg", "image/webp"];
  if (!allowedTypes.includes(file.type)) {
    return NextResponse.json({ error: "Invalid file type. Only PNG, JPEG, WEBP allowed." }, { status: 415 });
  }

  const safeName = file.name.replace(/[^a-z0-9._-]/gi, "_").toLowerCase();
  const path = `templates/${ctx.params.id}/${Date.now()}_${safeName}`;
  const buffer = Buffer.from(await file.arrayBuffer());

  const { error: uploadError } = await sb.storage.from(BUCKET).upload(path, buffer, {
    contentType: file.type,
    upsert: true,
  });
  if (uploadError) return NextResponse.json({ error: uploadError.message }, { status: 500 });

  const url = sb.storage.from(BUCKET).getPublicUrl(path).data.publicUrl;
  return NextResponse.json({ url, path }, { status: 201 });
}
