/**
 * POST /api/media/jersey-mockup — Official jersey mockup with fixed crest + sponsor overlay.
 *
 * Uses real Coritiba kit photo; composes sponsor on the correct zone only.
 */

import { NextResponse } from "next/server";
import { compositeJerseyMockup } from "@/lib/media/jersey-composite";
import type { JerseyPlacementId } from "@/lib/media/jersey-placements";
import { getPlacement, isPlacementAvailable } from "@/lib/media/jersey-placements";
import { supabaseAdmin } from "@/lib/supabase/server";
import { recordAudit } from "@/lib/audit/log";
import { checkRateLimit, rateLimitHeaders } from "@/lib/rate-limit";

export const maxDuration = 60;

const STORAGE_BUCKET = "campaign-assets";

export async function POST(req: Request) {
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
  const rl = checkRateLimit({ key: `jersey-mockup:${ip}`, limit: 20, windowSec: 60 });
  if (!rl.allowed) {
    return NextResponse.json(
      { error: "Rate limit exceeded. Try again in 60 seconds." },
      { status: 429, headers: rateLimitHeaders(rl) }
    );
  }

  try {
    const body = (await req.json()) as {
      sponsor_name: string;
      sponsor_logo_url?: string | null;
      placement?: JerseyPlacementId;
      kit_type?: "flat" | "home" | "training" | "goalkeeper";
      proposal_id?: string;
      company_id?: string;
      save_to_proposal?: boolean;
    };

    const sponsorName = body.sponsor_name?.trim();
    if (!sponsorName || sponsorName.length < 2) {
      return NextResponse.json({ error: "sponsor_name required (min 2 chars)" }, { status: 400 });
    }

    const placement = (body.placement ?? "chest_sponsor") as JerseyPlacementId;
    if (!isPlacementAvailable(placement)) {
      return NextResponse.json(
        { error: `Placement "${placement}" is not available yet (awaiting kit photos / retrain)` },
        { status: 400 }
      );
    }

    const startMs = Date.now();
    const result = await compositeJerseyMockup({
      sponsorName,
      sponsorLogoUrl: body.sponsor_logo_url,
      placement,
      kitType: body.kit_type ?? "flat",
    });

    const sb = supabaseAdmin();
    const filename = `jersey-mockups/${body.proposal_id ?? "standalone"}_${placement}_${Date.now()}.jpg`;

    const { data: uploadData, error: uploadErr } = await sb.storage
      .from(STORAGE_BUCKET)
      .upload(filename, result.buffer, {
        contentType: "image/jpeg",
        upsert: true,
      });

    let publicUrl: string;
    if (uploadErr) {
      publicUrl = `data:image/jpeg;base64,${result.buffer.toString("base64")}`;
    } else {
      const pathKey = uploadData?.path ?? filename;
      const { data: urlData } = sb.storage.from(STORAGE_BUCKET).getPublicUrl(pathKey);
      publicUrl = urlData.publicUrl;
    }

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
          inventory_label: placement.startsWith("chest") ? "jersey_chest" : placement.includes("sleeve") ? "jersey_sleeve" : "jersey_chest",
          display_label: displayLabel,
          provider: "jersey_composite",
          model: "official-kit-overlay",
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
        proposal_id: body.proposal_id ?? null,
        duration_ms: durationMs,
      },
    });

    return NextResponse.json({
      success: true,
      url: publicUrl,
      placement,
      kit_type: result.kitType,
      used_logo: result.usedLogo,
      duration_ms: durationMs,
      job_id: jobId,
      provider: "jersey_composite",
      crest_rule: "Club crest baked into official photo — never modified",
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Jersey mockup failed" },
      { status: 500 }
    );
  }
}
