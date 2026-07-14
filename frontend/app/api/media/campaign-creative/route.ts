/**
 * POST /api/media/campaign-creative
 * Generates editorial/lifestyle AI campaign images using gpt-image-2.
 *
 * Three scene types (confirmed by James 13 July 2026):
 *   matchday_street   — supporter walking toward Couto Pereira on matchday
 *   training_ground   — player at training session, sponsor backdrop
 *   fan_lifestyle     — fan in Coritiba kit in everyday Curitiba life
 *
 * Style target: "Curitiba é Coritiba" 2026 campaign — editorial, not product shot.
 */

import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";
import { recordAudit } from "@/lib/audit/log";
import { checkRateLimit, rateLimitHeaders } from "@/lib/rate-limit";

export const maxDuration = 90;

const STORAGE_BUCKET = "campaign-assets";

export type SceneType = "matchday_street" | "training_ground" | "fan_lifestyle";

const SCENE_LABELS: Record<SceneType, { label: string; labelPt: string }> = {
  matchday_street: { label: "Matchday Street", labelPt: "Dia de Jogo — Rua" },
  training_ground: { label: "Training Ground", labelPt: "Centro de Treinamento" },
  fan_lifestyle: { label: "Fan Lifestyle", labelPt: "Lifestyle do Torcedor" },
};

function buildPrompt(scene: SceneType, sponsorName: string): string {
  const s = sponsorName.trim();

  switch (scene) {
    case "matchday_street":
      return (
        `Editorial sports photography, cinematic natural light. A passionate Coritiba FC supporter ` +
        `walking through the streets of Curitiba toward Estádio Couto Pereira on matchday. ` +
        `The supporter is wearing the authentic 2026 Coritiba green and white jersey — the jersey ` +
        `clearly visible with the CFC badge. In the background, a large billboard or street banner ` +
        `features "${s}" branding prominently — clean logo on a white or green background. ` +
        `Authentic Brazilian street scene, real crowd energy building, stadium visible in distance. ` +
        `Photorealistic editorial photography, NOT a studio product shot. High resolution. ` +
        `Style reference: "Curitiba é Coritiba" 2026 campaign — raw, emotional, real.`
      );

    case "training_ground":
      return (
        `Editorial sports photography, golden hour natural light. A Coritiba FC player at ` +
        `an outdoor training session wearing the 2026 Coritiba training kit — dark jersey with CFC badge. ` +
        `The player is in an athletic action pose — passing, heading, or focused expression. ` +
        `Behind the player, a professional training facility backdrop with a sponsor banner ` +
        `showing "${s}" branding in clean white and green colors. ` +
        `Authentic football training atmosphere, Curitiba pine trees visible in background. ` +
        `Photorealistic editorial sports photography, magazine quality. NOT AI-generated looking. ` +
        `Style: authentic 2026 Coritiba FC campaign photography.`
      );

    case "fan_lifestyle":
      return (
        `Lifestyle photography, warm natural daylight. A young Coritiba FC fan in their 20s ` +
        `wearing the authentic 2026 Coritiba green and white jersey in everyday Curitiba city life — ` +
        `at a café, in a park, or on a vibrant Curitiba street. ` +
        `Candid, relaxed expression. The "${s}" brand appears naturally in the scene — ` +
        `on a coffee cup, on a storefront sign, or as a subtle branded item the person is holding. ` +
        `Warm, authentic Brazilian lifestyle feel. Curitiba city architecture subtly visible. ` +
        `Photorealistic, candid street photography style. ` +
        `Style reference: "Curitiba é Coritiba" 2026 campaign — real people, real city, real emotion.`
      );
  }
}

export async function POST(req: Request) {
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
  const rl = checkRateLimit({ key: `campaign-creative:${ip}`, limit: 10, windowSec: 60 });
  if (!rl.allowed) {
    return NextResponse.json(
      { error: "Rate limit exceeded. Try again in 60 seconds." },
      { status: 429, headers: rateLimitHeaders(rl) }
    );
  }

  try {
    const body = (await req.json()) as {
      sponsor_name: string;
      scene_type: SceneType;
      proposal_id?: string;
      company_id?: string;
      save_to_proposal?: boolean;
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
        { status: 400 }
      );
    }

    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      return NextResponse.json({ error: "OpenAI API key not configured" }, { status: 500 });
    }

    const prompt = buildPrompt(scene, sponsorName);
    const startMs = Date.now();

    const openaiRes = await fetch("https://api.openai.com/v1/images/generations", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "gpt-image-2",
        prompt,
        n: 1,
        size: "1024x1024",
        quality: "low",
      }),
    });

    if (!openaiRes.ok) {
      const errBody = await openaiRes.json().catch(() => ({}));
      const msg = (errBody as { error?: { message?: string } }).error?.message ?? `OpenAI error ${openaiRes.status}`;
      return NextResponse.json({ error: msg }, { status: 502 });
    }

    const openaiData = (await openaiRes.json()) as {
      data: Array<{ url?: string; b64_json?: string }>;
    };

    const firstResult = openaiData.data?.[0];
    if (!firstResult) {
      return NextResponse.json({ error: "OpenAI returned empty result" }, { status: 502 });
    }

    const durationMs = Date.now() - startMs;

    let publicUrl: string;
    const sb = supabaseAdmin();

    if (firstResult.b64_json) {
      const imgBuffer = Buffer.from(firstResult.b64_json, "base64");
      const filename = `campaign-creatives/${body.proposal_id ?? "standalone"}_${scene}_${Date.now()}.png`;
      const { data: uploadData, error: uploadErr } = await sb.storage
        .from(STORAGE_BUCKET)
        .upload(filename, imgBuffer, { contentType: "image/png", upsert: true });

      if (uploadErr) {
        publicUrl = `data:image/png;base64,${firstResult.b64_json}`;
      } else {
        const { data: urlData } = sb.storage.from(STORAGE_BUCKET).getPublicUrl(uploadData.path);
        publicUrl = urlData.publicUrl;
      }
    } else if (firstResult.url) {
      const imgRes = await fetch(firstResult.url);
      const imgBuffer = Buffer.from(await imgRes.arrayBuffer());
      const filename = `campaign-creatives/${body.proposal_id ?? "standalone"}_${scene}_${Date.now()}.jpg`;
      const { data: uploadData, error: uploadErr } = await sb.storage
        .from(STORAGE_BUCKET)
        .upload(filename, imgBuffer, { contentType: "image/jpeg", upsert: true });

      if (uploadErr) {
        publicUrl = firstResult.url;
      } else {
        const { data: urlData } = sb.storage.from(STORAGE_BUCKET).getPublicUrl(uploadData.path);
        publicUrl = urlData.publicUrl;
      }
    } else {
      return NextResponse.json({ error: "No image data in OpenAI response" }, { status: 502 });
    }

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
          prompt,
          placement_zone: scene,
          inventory_label: "campaign_creative",
          display_label: `Campanha — ${sceneLabel.labelPt}`,
          provider: "openai",
          model: "gpt-image-2",
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
        model: "gpt-image-2",
      },
    });

    return NextResponse.json({
      success: true,
      url: publicUrl,
      scene_type: scene,
      scene_label: sceneLabel,
      duration_ms: durationMs,
      job_id: jobId,
      provider: "openai",
      model: "gpt-image-2",
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Campaign creative generation failed" },
      { status: 500 }
    );
  }
}
