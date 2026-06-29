/**
 * POST /api/media/stadium-mockup
 * Composites sponsor logo onto real Couto Pereira stadium photos.
 * Supports 5 placement zones: LED boards, main stand facade, exterior facade, scoreboard.
 */

import { NextResponse } from "next/server";
import { compositeStadiumMockup } from "@/lib/media/stadium-composite";
import type { StadiumPlacementId } from "@/lib/media/stadium-placements";
import { getStadiumPlacement, STADIUM_BASES } from "@/lib/media/stadium-placements";
import { supabaseAdmin } from "@/lib/supabase/server";
import { recordAudit } from "@/lib/audit/log";
import { checkRateLimit, rateLimitHeaders } from "@/lib/rate-limit";

export const maxDuration = 60;

const STORAGE_BUCKET = "campaign-assets";

export async function POST(req: Request) {
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
  const rl = checkRateLimit({ key: `stadium-mockup:${ip}`, limit: 20, windowSec: 60 });
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
      placement: StadiumPlacementId;
      proposal_id?: string;
      company_id?: string;
      save_to_proposal?: boolean;
    };

    const sponsorName = body.sponsor_name?.trim();
    if (!sponsorName || sponsorName.length < 2) {
      return NextResponse.json({ error: "sponsor_name required (min 2 chars)" }, { status: 400 });
    }

    const placement = body.placement as StadiumPlacementId;
    const zone = getStadiumPlacement(placement);
    if (!zone?.enabled) {
      return NextResponse.json(
        { error: `Placement "${placement}" is not available` },
        { status: 400 }
      );
    }

    const startMs = Date.now();
    const result = await compositeStadiumMockup({
      sponsorName,
      sponsorLogoUrl: body.sponsor_logo_url,
      placement,
    });

    const sb = supabaseAdmin();
    const filename = `stadium-mockups/${body.proposal_id ?? "standalone"}_${placement}_${Date.now()}.jpg`;

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
    const baseInfo = STADIUM_BASES[result.basePhoto];
    const displayLabel = `Estádio — ${zone.labelPt}`;
    const promptNote = `Stadium mockup — ${sponsorName} on ${zone.labelPt} (${baseInfo.labelPt})`;

    let jobId: string | null = null;
    if (body.save_to_proposal !== false && body.proposal_id) {
      const { data: job, error: jobErr } = await (sb as ReturnType<typeof supabaseAdmin>)
        .from("image_generation_jobs" as "campaigns")
        .insert({
          proposal_id: body.proposal_id.trim(),
          company_id: body.company_id?.trim() || null,
          job_type: "stadium_mockup_official",
          status: "completed",
          prompt: promptNote,
          placement_zone: placement,
          inventory_label: "stadium_led_board",
          display_label: displayLabel,
          provider: "stadium_composite",
          model: "couto-pereira-photo-overlay",
          output_urls: [{ url: publicUrl, index: 0 }],
          selected_url: publicUrl,
          generation_ms: durationMs,
          triggered_by: "stadium_mockup_api",
          approved_at: new Date().toISOString(),
          approved_by: "system",
        } as unknown as Record<string, unknown>)
        .select("id")
        .single();

      if (!jobErr && job) jobId = (job as unknown as { id: string }).id;
    }

    await recordAudit({
      action: "stadium_mockup.generated",
      entity_type: "image_generation_job",
      entity_id: jobId ?? "standalone",
      metadata: {
        placement,
        base_photo: result.basePhoto,
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
      base_photo: result.basePhoto,
      used_logo: result.usedLogo,
      duration_ms: durationMs,
      job_id: jobId,
      provider: "stadium_composite",
      base_image: baseInfo.label,
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Stadium mockup failed" },
      { status: 500 }
    );
  }
}
