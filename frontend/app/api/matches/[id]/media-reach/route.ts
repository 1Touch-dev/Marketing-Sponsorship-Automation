import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";
import { recordAudit } from "@/lib/audit/log";
import { requirePermission } from "@/lib/auth/server-permission";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * PUT /api/matches/[id]/media-reach
 * Upserts the editable expected/actual views breakdown for one match:
 * official / unofficial-fan / rival-account / media-TV-radio views.
 * Body: { official_views?, unofficial_fan_views?, rival_account_views?, media_tv_radio_views?, source_notes? }
 *
 * These exact numbers feed the sponsor-facing real-time ROI dashboard
 * (Phase 5, lib/proposals/roi.ts) — gated so an unprivileged account
 * can't show a real sponsor fabricated exposure figures.
 */
export async function PUT(req: Request, ctx: { params: { id: string } }) {
  const auth = await requirePermission("manage_matches");
  if ("error" in auth) return auth.error;

  const sb = supabaseAdmin();
  const { id: matchId } = ctx.params;
  const body = (await req.json().catch(() => ({}))) as {
    official_views?: number;
    unofficial_fan_views?: number;
    rival_account_views?: number;
    media_tv_radio_views?: number;
    source_notes?: string;
  };

  const nonNegative = (n: unknown) => (Number.isFinite(n) ? Math.max(0, Math.trunc(n as number)) : 0);

  const { data, error } = await sb
    .from("match_media_reach")
    .upsert(
      {
        match_id: matchId,
        official_views: nonNegative(body.official_views),
        unofficial_fan_views: nonNegative(body.unofficial_fan_views),
        rival_account_views: nonNegative(body.rival_account_views),
        media_tv_radio_views: nonNegative(body.media_tv_radio_views),
        source_notes: body.source_notes?.trim() || null,
      } as never,
      { onConflict: "match_id" },
    )
    .select("*")
    .single();

  if (error) {
    if (error.code === "42P01" || error.code === "PGRST205") {
      return NextResponse.json(
        { error: "Run migration 0042_matches_media_reach_warmup.sql first", migration_pending: true },
        { status: 422 },
      );
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  await recordAudit({
    entity_type: "match",
    entity_id: matchId,
    action: "match.media_reach_updated",
    metadata: { fields: Object.keys(body) },
  });

  return NextResponse.json({ data });
}
