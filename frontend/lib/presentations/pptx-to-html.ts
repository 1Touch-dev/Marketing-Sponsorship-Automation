/**
 * Converts an uploaded .pptx file into the same HTML shape the existing
 * template pipeline already understands, so PowerPoint/Slides uploads
 * (17th_July.md item C, "phase 2") reuse the whole existing
 * placeholder-parsing/render/PDF-export path instead of a new one.
 *
 * A .pptx is a zip of OOXML parts. For each slide we pull the text runs
 * (`<a:t>`) grouped by paragraph — so a `[[TOKEN]]` typed as one continuous
 * run of text survives even when PowerPoint splits unrelated runs — and any
 * images referenced by that slide's relationship file, uploading each image
 * to Supabase Storage and rewriting a plain `<img>` tag to point at it.
 */
import JSZip from "jszip";
import { XMLParser } from "fast-xml-parser";
import { supabaseAdmin } from "@/lib/supabase/server";

const parser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: "@_" });

function collectText(node: unknown, out: string[]): void {
  if (node == null) return;
  if (Array.isArray(node)) {
    node.forEach((n) => collectText(n, out));
    return;
  }
  if (typeof node !== "object") return;
  const obj = node as Record<string, unknown>;
  if ("a:t" in obj) {
    const t = obj["a:t"];
    out.push(typeof t === "string" ? t : String(t ?? ""));
  }
  for (const key of Object.keys(obj)) {
    if (key === "a:t") continue;
    collectText(obj[key], out);
  }
}

/** Extracts paragraphs of text from a slide's parsed XML, one string per `<a:p>`. */
function extractParagraphs(slideXml: Record<string, unknown>): string[] {
  const paragraphs: string[] = [];
  function walk(node: unknown) {
    if (node == null) return;
    if (Array.isArray(node)) {
      node.forEach(walk);
      return;
    }
    if (typeof node !== "object") return;
    const obj = node as Record<string, unknown>;
    if ("a:p" in obj) {
      const ps = Array.isArray(obj["a:p"]) ? obj["a:p"] : [obj["a:p"]];
      for (const p of ps) {
        const texts: string[] = [];
        collectText(p, texts);
        const joined = texts.join("");
        if (joined.trim()) paragraphs.push(joined);
      }
    }
    for (const key of Object.keys(obj)) {
      if (key === "a:p") continue;
      walk(obj[key]);
    }
  }
  walk(slideXml);
  return paragraphs;
}

const IMAGE_EXT_TO_MIME: Record<string, string> = {
  png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg", gif: "image/gif", bmp: "image/bmp", emf: "image/x-emf",
};

export type PptxConversionResult = { html: string; slideCount: number; imageCount: number };

export async function convertPptxToHtml(
  buffer: Buffer,
  opts: { tenantId: string; storagePrefix: string },
): Promise<PptxConversionResult> {
  const zip = await JSZip.loadAsync(buffer);

  const slideFiles = Object.keys(zip.files)
    .filter((name) => /^ppt\/slides\/slide\d+\.xml$/.test(name))
    .sort((a, b) => {
      const na = parseInt(a.match(/slide(\d+)\.xml/)?.[1] ?? "0", 10);
      const nb = parseInt(b.match(/slide(\d+)\.xml/)?.[1] ?? "0", 10);
      return na - nb;
    });

  if (slideFiles.length === 0) {
    throw new Error("No slides found — is this a valid .pptx file?");
  }

  const sb = supabaseAdmin();
  const bucket = "proposal-assets";
  let imageCount = 0;
  const slidesHtml: string[] = [];

  for (const slideFile of slideFiles) {
    const xml = await zip.file(slideFile)!.async("string");
    const parsed = parser.parse(xml);
    const paragraphs = extractParagraphs(parsed);

    // Images referenced by this slide, via its .rels file
    const slideNum = slideFile.match(/slide(\d+)\.xml/)?.[1];
    const relsPath = `ppt/slides/_rels/slide${slideNum}.xml.rels`;
    const imgTags: string[] = [];
    const relsFile = zip.file(relsPath);
    if (relsFile) {
      const relsXml = await relsFile.async("string");
      const relsParsed = parser.parse(relsXml);
      const relationships = relsParsed?.Relationships?.Relationship;
      const relList = Array.isArray(relationships) ? relationships : relationships ? [relationships] : [];
      for (const rel of relList) {
        const target = rel?.["@_Target"] as string | undefined;
        if (!target || !/^\.\.\/media\//.test(target)) continue;
        const mediaPath = `ppt/media/${target.replace("../media/", "")}`;
        const mediaFile = zip.file(mediaPath);
        if (!mediaFile) continue;
        const ext = mediaPath.split(".").pop()?.toLowerCase() ?? "png";
        const mime = IMAGE_EXT_TO_MIME[ext];
        if (!mime) continue; // skip unsupported formats (e.g. embedded video)
        const data = await mediaFile.async("nodebuffer");
        const storagePath = `${opts.storagePrefix}/${mediaPath.replace(/\//g, "_")}`;
        await sb.storage.from(bucket).upload(storagePath, data, { contentType: mime, upsert: true });
        const url = sb.storage.from(bucket).getPublicUrl(storagePath).data.publicUrl;
        imgTags.push(`<img src="${url}" alt="" style="max-width:100%;" />`);
        imageCount++;
      }
    }

    const paraHtml = paragraphs.map((p) => `<p>${escapeHtml(p)}</p>`).join("\n");
    slidesHtml.push(`<section class="slide" style="page-break-after:always;padding:48px;min-height:540px;">\n${paraHtml}\n${imgTags.join("\n")}\n</section>`);
  }

  const html = `<!doctype html>
<html><head><meta charset="utf-8" />
<style>body{font-family:system-ui,sans-serif;margin:0;} .slide{border-bottom:1px solid #eee;}</style>
</head><body>
${slidesHtml.join("\n")}
</body></html>`;

  return { html, slideCount: slideFiles.length, imageCount };
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
