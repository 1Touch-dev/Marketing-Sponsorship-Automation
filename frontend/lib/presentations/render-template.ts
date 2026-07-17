/**
 * Single-company render pipeline for HTML presentation templates.
 *
 * Given a template (with `[[TOKEN]]` / `[[IMG:KEY]]` placeholders + a
 * per-placeholder config) and a target company, this:
 *   1. Fills text tokens from the company + its most recent proposal content.
 *   2. Generates one image per image placeholder via the existing gpt-image-2
 *      composite pipelines (jersey / stadium / campaign), or resolves the
 *      company logo directly for `image_type: "logo"` placeholders.
 *   3. Substitutes everything into the raw HTML and stores the final render.
 *
 * Persists progress on `template_renders` so bulk runs can be polled.
 */
import { supabaseAdmin } from "@/lib/supabase/server";
import { renderTemplateHtml, type PlaceholderConfig } from "@/lib/presentations/placeholder-parser";
import { compositeJerseyMockup } from "@/lib/media/jersey-composite";
import { compositeStadiumMockup } from "@/lib/media/stadium-composite";
import { compositeCampaignCreative } from "@/lib/media/campaign-composite";
import { storeGeneratedPng } from "@/lib/media/media-storage";
import type { JerseyPlacementId } from "@/lib/media/jersey-placements";
import type { StadiumPlacementId } from "@/lib/media/stadium-placements";
import type { CampaignSceneType } from "@/lib/media/image-prompts";
import { logger } from "@/lib/monitoring/logger";

export type RenderTemplateInput = {
  templateId: string;
  companyId: string;
  batchId?: string | null;
  createdBy?: string | null;
};

export type RenderTemplateResult = {
  render_id: string;
  status: "completed" | "failed";
  rendered_url?: string;
  error?: string;
  image_results: Record<string, { url: string; error?: string }>;
};

type CompanyRow = {
  id: string;
  company_name: string;
  industry: string | null;
  logo_url: string | null;
};

async function resolveTextValues(companyId: string): Promise<Record<string, string>> {
  const sb = supabaseAdmin();
  const { data: company } = await sb
    .from("companies")
    .select("id, company_name, industry, website, country")
    .eq("id", companyId)
    .maybeSingle();

  const { data: proposal } = await sb
    .from("proposals")
    .select("title, content")
    .eq("company_id", companyId)
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  const content = (proposal?.content as Record<string, string> | null) ?? {};

  return {
    COMPANY_NAME: company?.company_name ?? "",
    INDUSTRY: company?.industry ?? "",
    WEBSITE: company?.website ?? "",
    COUNTRY: company?.country ?? "",
    PROPOSAL_TITLE: proposal?.title ?? "",
    EXEC_SUMMARY: content.executive_summary ?? "",
    CAMPAIGN_RATIONALE: content.campaign_rationale ?? "",
    CTA: content.cta ?? "",
  };
}

async function generateOnePlaceholderImage(
  placeholder: PlaceholderConfig,
  company: CompanyRow,
): Promise<{ url: string } | { error: string }> {
  try {
    if (placeholder.image_type === "logo") {
      if (!company.logo_url) return { error: "Company has no logo on file" };
      return { url: company.logo_url };
    }

    const sponsorLogoUrl = placeholder.use_company_logo !== false ? company.logo_url : null;
    if (!sponsorLogoUrl) return { error: "No sponsor logo available for this company" };

    if (placeholder.image_type === "jersey") {
      const result = await compositeJerseyMockup({
        sponsorName: company.company_name,
        sponsorLogoUrl,
        placement: (placeholder.placement as JerseyPlacementId) ?? "chest_sponsor",
        kitType: (placeholder.kit_type as "flat" | "home" | "training" | "goalkeeper") ?? "flat",
        customBaseUrl: placeholder.base_image_url ?? null,
        quality: "medium",
      });
      const path = `template-renders/${company.id}/${placeholder.token.replace(/[^a-z0-9]/gi, "_")}_${result.generationId}.png`;
      const url = await storeGeneratedPng(path, result.buffer);
      return { url };
    }

    if (placeholder.image_type === "stadium") {
      const result = await compositeStadiumMockup({
        sponsorName: company.company_name,
        sponsorLogoUrl,
        placement: (placeholder.placement as StadiumPlacementId) ?? "led_board_main",
        customBaseUrl: placeholder.base_image_url ?? null,
        quality: "medium",
      });
      const path = `template-renders/${company.id}/${placeholder.token.replace(/[^a-z0-9]/gi, "_")}_${result.generationId}.png`;
      const url = await storeGeneratedPng(path, result.buffer);
      return { url };
    }

    if (placeholder.image_type === "campaign") {
      const result = await compositeCampaignCreative({
        sponsorName: company.company_name,
        sponsorLogoUrl,
        scene: (placeholder.placement as CampaignSceneType) ?? "matchday_street",
        quality: "medium",
      });
      const path = `template-renders/${company.id}/${placeholder.token.replace(/[^a-z0-9]/gi, "_")}_${result.generationId}.png`;
      const url = await storeGeneratedPng(path, result.buffer);
      return { url };
    }

    return { error: `Unknown image_type "${placeholder.image_type}"` };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Image generation failed" };
  }
}

/**
 * Renders one template for one company. Creates + updates a `template_renders`
 * row throughout so progress is visible to a polling UI.
 */
export async function renderTemplateForCompany(
  input: RenderTemplateInput,
): Promise<RenderTemplateResult> {
  const sb = supabaseAdmin();

  const { data: template, error: templateErr } = await sb
    .from("proposal_templates")
    .select("id, html_url, html_storage_path, placeholder_config, source_type")
    .eq("id", input.templateId)
    .maybeSingle();

  if (templateErr || !template) {
    throw new Error(templateErr?.message ?? "Template not found");
  }
  if (template.source_type !== "html" || !template.html_storage_path) {
    throw new Error("Template has no uploaded HTML source");
  }

  const { data: company } = await sb
    .from("companies")
    .select("id, company_name, industry, logo_url")
    .eq("id", input.companyId)
    .maybeSingle();
  if (!company) throw new Error("Company not found");

  const { data: renderRow, error: renderErr } = await sb
    .from("template_renders" as "companies")
    .insert({
      template_id: input.templateId,
      company_id: input.companyId,
      batch_id: input.batchId ?? null,
      created_by: input.createdBy ?? null,
      status: "running",
    } as unknown as Record<string, unknown>)
    .select("id")
    .single() as unknown as { data: { id: string } | null; error: { message: string } | null };

  if (renderErr || !renderRow) throw new Error(renderErr?.message ?? "Failed to create render row");
  const renderId = renderRow.id;

  try {
    const { data: htmlFile } = await sb.storage
      .from("proposal-assets")
      .download(template.html_storage_path);
    if (!htmlFile) throw new Error("Could not download template HTML source");
    const html = await htmlFile.text();

    const placeholders = (template.placeholder_config as PlaceholderConfig[]) ?? [];
    const textPlaceholders = placeholders.filter((p) => p.kind === "text");
    const imagePlaceholders = placeholders.filter((p) => p.kind === "image");

    const resolvedText = await resolveTextValues(input.companyId);
    const textValues: Record<string, string> = {};
    for (const p of textPlaceholders) {
      textValues[p.token] = resolvedText[p.token] ?? "";
    }

    const imageResults: Record<string, { url: string; error?: string }> = {};
    const imageValues: Record<string, string> = {};

    for (const placeholder of imagePlaceholders) {
      const result = await generateOnePlaceholderImage(placeholder, company as CompanyRow);
      if ("url" in result) {
        imageValues[placeholder.token] = result.url;
        imageResults[placeholder.token] = { url: result.url };
      } else {
        imageResults[placeholder.token] = { url: "", error: result.error };
      }
    }

    const renderedHtml = renderTemplateHtml(html, { text: textValues, images: imageValues });

    const outPath = `template-renders/${input.companyId}/${renderId}.html`;
    await sb.storage.from("proposal-assets").upload(outPath, Buffer.from(renderedHtml, "utf-8"), {
      contentType: "text/html",
      upsert: true,
    });
    const renderedUrl = sb.storage.from("proposal-assets").getPublicUrl(outPath).data.publicUrl;

    const hasFailures = Object.values(imageResults).some((r) => !!r.error);

    await sb
      .from("template_renders" as "companies")
      .update({
        status: "completed",
        rendered_html: renderedHtml,
        rendered_url: renderedUrl,
        image_results: imageResults,
        error: hasFailures ? "Some image placeholders failed — see image_results" : null,
        updated_at: new Date().toISOString(),
      } as unknown as Record<string, unknown>)
      .eq("id", renderId);

    return {
      render_id: renderId,
      status: "completed",
      rendered_url: renderedUrl,
      image_results: imageResults,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Render failed";
    await sb
      .from("template_renders" as "companies")
      .update({ status: "failed", error: message, updated_at: new Date().toISOString() } as unknown as Record<string, unknown>)
      .eq("id", renderId);
    logger.apiError("renderTemplateForCompany", err instanceof Error ? err : new Error(message));
    return { render_id: renderId, status: "failed", error: message, image_results: {} };
  }
}
