import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";
import { recordAudit } from "@/lib/audit/log";
import { checkRateLimit, rateLimitHeaders } from "@/lib/rate-limit";
import { compositeCampaignCreative } from "@/lib/media/campaign-composite";
import type { CampaignSceneType } from "@/lib/media/image-prompts";
import { persistImageDebugArtifacts, storeGeneratedPng } from "@/lib/media/media-storage";
import { checkDailySpendCap, recordSpend, IMAGE_COST_ESTIMATES_USD } from "@/lib/monitoring/spend-guard";

export const maxDuration = 300;
export type SceneType = CampaignSceneType;

const SCENE_LABELS: Record<SceneType, { label: string; labelPt: string }> = {
  matchday_street: { label: "Matchday Street", labelPt: "Dia de Jogo — Rua" },
  training_ground: { label: "Training Ground", labelPt: "Centro de Treinamento" },
  fan_lifestyle: { label: "Fan Lifestyle", labelPt: "Lifestyle do Torcedor" },
};

export async function POST(req: Request) {
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
  const rl = checkRateLimit({ key: `campaign-creative:${ip}`, limit: 10, windowSec: 60 });
  if (!rl.allowed) {
    return NextResponse.json(
      { error: "Rate limit exceeded. Try again in 60 seconds." },
      { status: 429, headers: rateLimitHeaders(rl) },
    );
  }

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
      scene_type: SceneType;
      proposal_id?: string;
      company_id?: string;
      save_to_proposal?: boolean;
      debug?: boolean;
    };

    const sponsorName = body.sponsor_name?.trim();
    if (!sponsorName || sponsorName.length < 2) {
      return NextResponse.json({ error: "sponsor_name required (min 2 chars)" }, { status: 400 });
    }

    const validScenes: SceneType[] = ["matchday_street", "training_ground", "fan_lifestyle"];
    const scene = body.scene_type as SceneType;
    if (!validScenes.includes(scene)) {
      return NextResponse.json(
        { error: `scene_type must be one of: ${validScenes.join(", ")}` },
        { status: 400 },
      );
    }

    const startMs = Date.now();
    const result = await compositeCampaignCreative({
      sponsorName,
      sponsorLogoUrl: body.sponsor_logo_url,
      scene,
      quality: "high",
    });
    const sb = supabaseAdmin();
    const filename = `campaign-creatives/${body.proposal_id ?? "standalone"}_${scene}_${result.generationId}.png`;
    const publicUrl = await storeGeneratedPng(filename, result.buffer);
    const debugPath = await persistImageDebugArtifacts({
      category: "campaign",
      debug: result.debug,
      width: result.width,
      height: result.height,
      generationMs: result.generationMs,
      force: body.debug === true,
    });
    const durationMs = Date.now() - startMs;

    const sceneLabel = SCENE_LABELS[scene];
    let jobId: string | null = null;

    if (body.save_to_proposal !== false && body.proposal_id) {
      const { data: job, error: jobErr } = await (sb as any)
        .from("image_generation_jobs")
        .insert({
          proposal_id: body.proposal_id.trim(),
          company_id: body.company_id?.trim() || null,
          job_type: "campaign_creative",
          status: "completed",
          prompt: result.debug.prompt,
          placement_zone: scene,
          inventory_label: "campaign_creative",
          display_label: `Campanha — ${sceneLabel.labelPt}`,
          provider: "openai",
          model: result.model,
          output_urls: [{ url: publicUrl, index: 0 }],
          selected_url: publicUrl,
          generation_ms: durationMs,
          triggered_by: "campaign_creative_api",
          approved_at: new Date().toISOString(),
          approved_by: "system",
        })
        .select("id")
        .single();

      if (!jobErr && job) jobId = (job as { id: string }).id;
    }

    await recordAudit({
      action: "campaign_creative.generated",
      entity_type: "image_generation_job",
      entity_id: jobId ?? "standalone",
      metadata: {
        scene_type: scene,
        sponsor_name: sponsorName,
        proposal_id: body.proposal_id ?? null,
        duration_ms: durationMs,
        model: result.model,
        quality: result.quality,
        generation_id: result.generationId,
        debug_path: debugPath,
        source_filename: result.sourceFilename,
      },
    });

    await recordSpend({
      category: "openai_image_campaign",
      provider: "openai",
      amountUsd: IMAGE_COST_ESTIMATES_USD[result.quality] ?? IMAGE_COST_ESTIMATES_USD.high,
      entityType: "image_generation_job",
      entityId: jobId,
      metadata: { scene_type: scene, quality: result.quality, generation_id: result.generationId },
    });

    return NextResponse.json({
      success: true,
      url: publicUrl,
      scene_type: scene,
      scene_label: sceneLabel,
      duration_ms: durationMs,
      job_id: jobId,
      provider: "openai",
      model: result.model,
      quality: result.quality,
      generation_id: result.generationId,
      debug_path: debugPath,
      resolution: { width: result.width, height: result.height },
      logo_preprocessing: result.logo,
      source_filename: result.sourceFilename,
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Campaign creative generation failed" },
      { status: 500 },
    );
  }
}
