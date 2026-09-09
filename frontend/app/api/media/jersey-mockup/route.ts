/**
 * POST /api/media/jersey-mockup — Official jersey mockup with fixed crest + sponsor overlay.
 *
 * Uses real Coritiba kit photo; composes sponsor on the correct zone only.
 */

import { NextResponse } from "next/server";
import { compositeJerseyMockup } from "@/lib/media/jersey-composite";
import type { JerseyPlacementId } from "@/lib/media/jersey-placements";
import {
  getPlacement,
  isPlacementAvailable,
  isPlacementVisibleForKit,
} from "@/lib/media/jersey-placements";
import { supabaseAdmin } from "@/lib/supabase/server";
import { recordAudit } from "@/lib/audit/log";
import { checkRateLimit, rateLimitHeaders } from "@/lib/rate-limit";
import { persistImageDebugArtifacts, storeGeneratedPng } from "@/lib/media/media-storage";
import { checkDailySpendCap, recordSpend, IMAGE_COST_ESTIMATES_USD } from "@/lib/monitoring/spend-guard";
import { requirePermission } from "@/lib/auth/server-permission";

export const maxDuration = 300;

export async function POST(req: Request) {
  const auth = await requirePermission("generate_images");
  if ("error" in auth) return auth.error;

  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
  const rl = checkRateLimit({ key: `jersey-mockup:${ip}`, limit: 20, windowSec: 60 });
  if (!rl.allowed) {
    return NextResponse.json(
      { error: "Rate limit exceeded. Try again in 60 seconds." },
      { status: 429, headers: rateLimitHeaders(rl) },
    );
  }

  // Hard spend-cap kill switch (Pattern 5) — independent of the rate limiter
  // above, which only throttles request count, not dollar cost. A sustained,
  // rate-limit-compliant loop could otherwise run indefinitely.
  const capCheck = await checkDailySpendCap();
  if (!capCheck.ok) {
    return NextResponse.json(
      { error: `Daily AI spend cap reached ($${capCheck.todaySpendUsd.toFixed(2)} / $${capCheck.capUsd.toFixed(2)}). Image generation is paused until tomorrow (UTC) or the cap is raised.` },
      { status: 503 },
    );
  }

  try {
    const body = (await req.json()) as {
      sponsor_name: string;
      sponsor_logo_url?: string | null;
      placement?: JerseyPlacementId;
      kit_type?: "flat" | "home" | "training" | "goalkeeper";
      custom_base_url?: string | null;
      proposal_id?: string;
      company_id?: string;
      save_to_proposal?: boolean;
      debug?: boolean;
    };

    const sponsorName = body.sponsor_name?.trim();
    if (!sponsorName || sponsorName.length < 2) {
      return NextResponse.json({ error: "sponsor_name required (min 2 chars)" }, { status: 400 });
    }

    const placement = (body.placement ?? "chest_sponsor") as JerseyPlacementId;
    const kitType = body.kit_type ?? "flat";
    if (!isPlacementAvailable(placement)) {
      return NextResponse.json(
        { error: `Placement "${placement}" is not available yet (awaiting kit photos / retrain)` },
        { status: 400 },
      );
    }
    if (!isPlacementVisibleForKit(placement, kitType) && !body.custom_base_url) {
      return NextResponse.json(
        {
          error: `Placement "${placement}" is not visible in the ${kitType} source photograph`,
        },
        { status: 400 },
      );
    }

    const startMs = Date.now();
    const result = await compositeJerseyMockup({
      sponsorName,
      sponsorLogoUrl: body.sponsor_logo_url,
      placement,
      kitType,
      customBaseUrl: body.custom_base_url,
    });

    const sb = supabaseAdmin();
    const filename = `jersey-mockups/${body.proposal_id ?? "standalone"}_${placement}_${result.generationId}.png`;
    const publicUrl = await storeGeneratedPng(filename, result.buffer);
    const debugPath = await persistImageDebugArtifacts({
      category: "jersey",
      debug: result.debug,
      width: result.width,
      height: result.height,
      generationMs: result.generationMs,
      force: body.debug === true,
    });

    const durationMs = Date.now() - startMs;
    const placementMeta = getPlacement(placement);
    const displayLabel = placementMeta
      ? `Camisa — ${placementMeta.labelPt}`
      : `Camisa — ${placement}`;
    const promptNote = `Official kit mockup — ${sponsorName} on ${placement}. Crest unchanged (wearer's left).`;

    let jobId: string | null = null;
    if (body.save_to_proposal !== false && body.proposal_id) {
      const { data: job, error: jobErr } = await (sb as any)
        .from("image_generation_jobs")
        .insert({
          proposal_id: body.proposal_id.trim(),
          company_id: body.company_id?.trim() || null,
          job_type: "jersey_mockup_official",
          status: "completed",
          prompt: promptNote,
          placement_zone: placement,
          inventory_label: placement.startsWith("chest")
            ? "jersey_chest"
            : placement.includes("sleeve")
              ? "jersey_sleeve"
              : "jersey_chest",
          display_label: displayLabel,
          provider: "openai",
          model: result.model,
          output_urls: [{ url: publicUrl, index: 0 }],
          selected_url: publicUrl,
          generation_ms: durationMs,
          triggered_by: "jersey_mockup_api",
          approved_at: new Date().toISOString(),
          approved_by: "system",
        })
        .select("id")
        .single();

      if (!jobErr && job) jobId = (job as { id: string }).id;
    }

    await recordAudit({
      action: "jersey_mockup.generated",
      entity_type: "image_generation_job",
      entity_id: jobId ?? "standalone",
      metadata: {
        placement,
        sponsor_name: sponsorName,
        used_logo: result.usedLogo,
        model: result.model,
        quality: result.quality,
        generation_id: result.generationId,
        debug_path: debugPath,
        proposal_id: body.proposal_id ?? null,
        duration_ms: durationMs,
      },
    });

    await recordSpend({
      category: "openai_image_jersey",
      provider: "openai",
      amountUsd: IMAGE_COST_ESTIMATES_USD[result.quality] ?? IMAGE_COST_ESTIMATES_USD.medium,
      entityType: "image_generation_job",
      entityId: jobId,
      metadata: { placement, quality: result.quality, generation_id: result.generationId },
    });

    return NextResponse.json({
      success: true,
      url: publicUrl,
      placement,
      kit_type: result.kitType,
      used_logo: result.usedLogo,
      duration_ms: durationMs,
      job_id: jobId,
      provider: "openai",
      model: result.model,
      quality: result.quality,
      generation_id: result.generationId,
      debug_path: debugPath,
      resolution: { width: result.width, height: result.height },
      logo_preprocessing: result.logo,
      crest_rule: "Club crest baked into official photo — never modified",
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Jersey mockup failed" },
      { status: 500 },
    );
  }
}
