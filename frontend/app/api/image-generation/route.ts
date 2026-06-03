import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";
import { recordAudit } from "@/lib/audit/log";
import { checkRateLimit, rateLimitHeaders } from "@/lib/rate-limit";

export const maxDuration = 90;

const OPENAI_API_URL = "https://api.openai.com/v1/images/generations";
const STORAGE_BUCKET = "campaign-assets";

/**
 * GET /api/image-generation?proposal_id=xxx — list jobs
 */
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const proposalId = searchParams.get("proposal_id");
  const companyId = searchParams.get("company_id");
  const status = searchParams.get("status");

  const sb = supabaseAdmin();
  // query builder
  let query: any = sb.from("image_generation_jobs" as "companies")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(50);

  if (proposalId) query = query.eq("proposal_id", proposalId);
  if (companyId)  query = query.eq("company_id", companyId);
  if (status)     query = query.eq("status", status);

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ jobs: data ?? [] });
}

/**
 * POST /api/image-generation — Create a new job (pending_approval)
 */
export async function POST(req: Request) {
  // Rate limit: 5 image generation requests per minute per IP
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
  const rl = checkRateLimit({ key: `img-gen:${ip}`, limit: 5, windowSec: 60 });
  if (!rl.allowed) {
    return NextResponse.json(
      { error: "Rate limit exceeded for image generation. Try again in 60 seconds." },
      { status: 429, headers: rateLimitHeaders(rl) }
    );
  }

  try {
    const body = await req.json() as {
      proposal_id?: string;
      company_id?: string;
      mockup_id?: string;
      job_type: string;
      prompt: string;
      negative_prompt?: string;
      style_notes?: string;
      provider?: string;
      size?: string;
      quality?: string;
      n_images?: number;
      triggered_by?: string;
      strategy_variant_id?: string;
      strategy_label?: string;
      placement_zone?: string;
      inventory_label?: string;
      display_label?: string;
    };

    if (!body.prompt || body.prompt.length < 10) {
      return NextResponse.json({ error: "Prompt required (min 10 chars)" }, { status: 400 });
    }

    const sb = supabaseAdmin();
    const { data: job, error } = await (sb as any)
      .from("image_generation_jobs")
      .insert({
        proposal_id:     body.proposal_id?.trim() || null,
        company_id:      body.company_id?.trim() || null,
        mockup_id:       body.mockup_id?.trim() || null,
        job_type:        body.job_type ?? "custom",
        status:          "pending_approval",
        prompt:          body.prompt,
        negative_prompt: body.negative_prompt ?? null,
        style_notes:     body.style_notes ?? null,
        provider:        body.provider ?? "gpt-image-1",
        model:           body.provider ?? "gpt-image-1",
        size:            body.size ?? "1024x1024",
        quality:         body.quality ?? "standard",
        n_images:        body.n_images ?? 1,
        triggered_by:    body.triggered_by ?? "manual",
        strategy_variant_id: body.strategy_variant_id?.trim() || null,
        strategy_label: body.strategy_label?.trim() || null,
        placement_zone: body.placement_zone?.trim() || null,
        inventory_label: body.inventory_label?.trim() || null,
        display_label: body.display_label?.trim() || null,
      })
      .select()
      .single();

    if (error) throw new Error(error.message);

    await recordAudit({
      action: "image_job.created",
      entity_type: "image_generation_job",
      entity_id: (job as Record<string, string>).id,
      metadata: { job_type: body.job_type, provider: body.provider ?? "gpt-image-1" },
    });

    return NextResponse.json({ job, message: "Job created — approve to generate image" });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Failed" }, { status: 500 });
  }
}

/**
 * PATCH /api/image-generation — Approve / reject / generate / select
 */
export async function PATCH(req: Request) {
  try {
    const body = await req.json() as {
      job_id: string;
      action:
        | "approve"
        | "reject"
        | "generate"
        | "select_image"
        | "link_proposal"
        | "update_metadata"
        | "bulk_approve"
        | "reset_stuck"
        | "cleanup_dead";
      approved_by?: string;
      rejection_reason?: string;
      selected_url?: string;
      proposal_id?: string;
      strategy_variant_id?: string | null;
      strategy_label?: string | null;
      placement_zone?: string | null;
      inventory_label?: string | null;
      display_label?: string | null;
      job_ids?: string[];
    };

    const sb = supabaseAdmin();

    // ── Bulk actions that don't need a single job lookup ─────────────
    if (body.action === "bulk_approve") {
      const ids = body.job_ids ?? [];
      if (ids.length === 0) {
        return NextResponse.json({ error: "job_ids required" }, { status: 400 });
      }
      await sb.from("image_generation_jobs" as "companies")
        .update({
          status: "completed",
          approved_by: body.approved_by ?? "admin",
          approved_at: new Date().toISOString(),
        } as unknown as Record<string, unknown>)
        .in("id", ids);
      return NextResponse.json({ success: true, count: ids.length });
    }

    if (body.action === "cleanup_dead") {
      const ids = body.job_ids ?? [];
      if (ids.length === 0) {
        return NextResponse.json({ error: "job_ids required" }, { status: 400 });
      }
      await sb.from("image_generation_jobs" as "companies")
        .update({ status: "failed", rejection_reason: "Cleaned up — no image generated" } as unknown as Record<string, unknown>)
        .in("id", ids);
      return NextResponse.json({ success: true, count: ids.length });
    }

    const { data: job } = await sb
      .from("image_generation_jobs" as "companies")
      .select("*")
      .eq("id", body.job_id)
      .maybeSingle();

    if (!job) return NextResponse.json({ error: "Job not found" }, { status: 404 });
    const j = job as Record<string, unknown>;

    // ── Link to Proposal ──────────────────────────────────────────────
    if (body.action === "link_proposal") {
      const proposalId = body.proposal_id?.trim() || null;
      if (!proposalId) return NextResponse.json({ error: "proposal_id required" }, { status: 400 });
      await sb.from("image_generation_jobs" as "companies")
        .update({ proposal_id: proposalId } as unknown as Record<string, unknown>)
        .eq("id", body.job_id);
      return NextResponse.json({ success: true, proposal_id: proposalId });
    }

    // ── Reject ────────────────────────────────────────────────────────
    if (body.action === "reject") {
      await sb.from("image_generation_jobs" as "companies")
        .update({ status: "rejected", rejection_reason: body.rejection_reason ?? "Rejected" } as unknown as Record<string, unknown>)
        .eq("id", body.job_id);
      return NextResponse.json({ success: true, status: "rejected" });
    }

    // ── Approve ───────────────────────────────────────────────────────
    if (body.action === "approve") {
      await sb.from("image_generation_jobs" as "companies")
        .update({
          status: "approved",
          approved_by: body.approved_by ?? "admin",
          approved_at: new Date().toISOString(),
        } as unknown as Record<string, unknown>)
        .eq("id", body.job_id);
      return NextResponse.json({ success: true, status: "approved" });
    }

    // ── Update metadata (strategy / inventory links) ─────────────────
    if (body.action === "update_metadata") {
      const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
      if (body.strategy_variant_id !== undefined) patch.strategy_variant_id = body.strategy_variant_id;
      if (body.strategy_label !== undefined) patch.strategy_label = body.strategy_label;
      if (body.placement_zone !== undefined) patch.placement_zone = body.placement_zone;
      if (body.inventory_label !== undefined) patch.inventory_label = body.inventory_label;
      if (body.display_label !== undefined) patch.display_label = body.display_label;
      await sb.from("image_generation_jobs" as "companies")
        .update(patch as unknown as Record<string, unknown>)
        .eq("id", body.job_id);
      return NextResponse.json({ success: true });
    }

    // ── Reset stuck generating job ──────────────────────────────────────
    if (body.action === "reset_stuck") {
      await sb.from("image_generation_jobs" as "companies")
        .update({ status: "pending_approval" } as unknown as Record<string, unknown>)
        .eq("id", body.job_id);
      return NextResponse.json({ success: true });
    }

    // ── Select image ──────────────────────────────────────────────────
    if (body.action === "select_image") {
      await sb.from("image_generation_jobs" as "companies")
        .update({ selected_url: body.selected_url } as unknown as Record<string, unknown>)
        .eq("id", body.job_id);
      if (j.mockup_id && body.selected_url) {
        await sb.from("visual_mockups" as "companies")
          .update({ output_url: body.selected_url, status: "generated" } as unknown as Record<string, unknown>)
          .eq("id", j.mockup_id as string);
      }
      return NextResponse.json({ success: true, selected_url: body.selected_url });
    }

    // ── Generate ──────────────────────────────────────────────────────
    if (body.action === "generate") {
      if (j.status !== "approved" && j.status !== "pending_approval") {
        return NextResponse.json({ error: "Job must be in approved or pending_approval status to generate" }, { status: 400 });
      }

      const apiKey = process.env.OPENAI_API_KEY;
      if (!apiKey) return NextResponse.json({ error: "OPENAI_API_KEY not configured" }, { status: 500 });

      await sb.from("image_generation_jobs" as "companies")
        .update({ status: "generating" } as unknown as Record<string, unknown>)
        .eq("id", body.job_id);

      const startMs = Date.now();

      // ── Call OpenAI gpt-image-1 ───────────────────────────────────
      // gpt-image-1 always returns b64_json (not url). We upload to Supabase Storage.
      const openaiRes = await fetch(OPENAI_API_URL, {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model:   j.model ?? "gpt-image-1",
          prompt:  j.prompt as string,
          n:       Math.min(Number(j.n_images ?? 1), 4),
          size:    validateSize(j.size as string),
          quality: mapQuality(j.quality as string),
        }),
      });

      const generationMs = Date.now() - startMs;

      if (!openaiRes.ok) {
        const errBody = await openaiRes.json() as { error?: { message?: string } };
        const errMsg = errBody?.error?.message ?? `OpenAI error ${openaiRes.status}`;
        await sb.from("image_generation_jobs" as "companies")
          .update({ status: "failed", error_message: errMsg } as unknown as Record<string, unknown>)
          .eq("id", body.job_id);
        return NextResponse.json({ error: errMsg }, { status: 500 });
      }

      const openaiData = await openaiRes.json() as {
        data: Array<{ b64_json?: string; url?: string; revised_prompt?: string }>;
      };

      if (!openaiData.data || openaiData.data.length === 0) {
        await sb.from("image_generation_jobs" as "companies")
          .update({ status: "failed", error_message: "OpenAI returned no images" } as unknown as Record<string, unknown>)
          .eq("id", body.job_id);
        return NextResponse.json({ error: "OpenAI returned no images" }, { status: 500 });
      }

      // ── Upload b64 images to Supabase Storage ──────────────────────
      const outputUrls: Array<{ url: string; revised_prompt?: string; index: number }> = [];

      for (let i = 0; i < openaiData.data.length; i++) {
        const img = openaiData.data[i];
        const b64 = img.b64_json;
        const directUrl = img.url; // some models return url

        if (directUrl) {
          outputUrls.push({ url: directUrl, revised_prompt: img.revised_prompt, index: i });
          continue;
        }

        // Neither b64 nor url — shouldn't happen but guard it
        if (!b64 && !directUrl) {
          console.error("[image-generation] Image", i, "has neither b64_json nor url. Keys:", Object.keys(img));
          continue;
        }

        if (b64) {
          const imageBuffer = Buffer.from(b64, "base64");
          const filename = `generated/${body.job_id}_${i}_${Date.now()}.png`;

          const { data: uploadData, error: uploadErr } = await sb.storage
            .from(STORAGE_BUCKET)
            .upload(filename, imageBuffer, {
              contentType: "image/png",
              upsert: true,
            });

          if (uploadErr) {
            // Log the upload error for debugging
            console.error("[image-generation] Storage upload failed:", uploadErr.message, "| filename:", filename);
            // Fall back to data URL if storage upload fails (will be large but functional)
            const dataUrl = `data:image/png;base64,${b64}`;
            outputUrls.push({ url: dataUrl, revised_prompt: img.revised_prompt, index: i });
          } else if (uploadData) {
            const { data: publicUrl } = sb.storage.from(STORAGE_BUCKET).getPublicUrl(uploadData.path ?? filename);
            const finalUrl = publicUrl.publicUrl;
            console.log("[image-generation] Uploaded to storage:", finalUrl);
            outputUrls.push({ url: finalUrl, revised_prompt: img.revised_prompt, index: i });
          } else {
            console.error("[image-generation] Upload returned no data or error");
            const dataUrl = `data:image/png;base64,${b64}`;
            outputUrls.push({ url: dataUrl, revised_prompt: img.revised_prompt, index: i });
          }
        }
      }

      if (outputUrls.length === 0) {
        await sb.from("image_generation_jobs" as "companies")
          .update({ status: "failed", error_message: "No images could be processed" } as unknown as Record<string, unknown>)
          .eq("id", body.job_id);
        return NextResponse.json({ error: "No images could be processed" }, { status: 500 });
      }

      // ── Persist results — set pending_approval so images go to bulk approve ──
      await sb.from("image_generation_jobs" as "companies")
        .update({
          status: "pending_approval",
          output_urls: outputUrls,
          selected_url: outputUrls[0]?.url ?? null,
          generation_ms: generationMs,
        } as unknown as Record<string, unknown>)
        .eq("id", body.job_id);

      if (j.mockup_id && outputUrls[0]?.url) {
        await sb.from("visual_mockups" as "companies")
          .update({ output_url: outputUrls[0].url, status: "generated" } as unknown as Record<string, unknown>)
          .eq("id", j.mockup_id as string);
      }

      await recordAudit({
        action: "image_job.generated",
        entity_type: "image_generation_job",
        entity_id: body.job_id,
        metadata: { images_count: outputUrls.length, generation_ms: generationMs },
      });

      return NextResponse.json({
        success: true,
        output_urls: outputUrls,
        selected_url: outputUrls[0]?.url,
        generation_ms: generationMs,
      });
    }

    return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Failed" }, { status: 500 });
  }
}

// ── Helpers ───────────────────────────────────────────────────────────────────
/** gpt-image-1 only supports specific sizes */
function validateSize(size: string | undefined): string {
  const valid = ["1024x1024", "1024x1536", "1536x1024", "auto"];
  return valid.includes(size ?? "") ? (size as string) : "1024x1024";
}

/** Map quality label to OpenAI values */
function mapQuality(q: string | undefined): "low" | "medium" | "high" {
  if (q === "hd" || q === "high") return "high";
  if (q === "low" || q === "draft") return "low";
  return "medium";
}
