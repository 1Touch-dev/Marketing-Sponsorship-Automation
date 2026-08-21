import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";
import { recordAudit } from "@/lib/audit/log";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function migrationPending(error: { code?: string; message?: string } | null): boolean {
  if (!error) return false;
  return (
    error.code === "42P01" ||
    error.code === "PGRST205" ||
    /does not exist|could not find|not find/i.test(error.message ?? "")
  );
}

/**
 * GET /api/matches — list matches, most recent first, with their media reach row joined.
 */
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const limit = Math.min(parseInt(searchParams.get("limit") ?? "50", 10), 200);

  const sb = supabaseAdmin();
  const { data, error } = await sb
    .from("matches")
    .select("*, match_media_reach(*)")
    .order("match_date", { ascending: false })
    .limit(limit);

  if (migrationPending(error)) return NextResponse.json({ data: [], migration_pending: true });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ data: data ?? [] });
}

/**
 * POST /api/matches — create a match.
 * Body: { match_date, opponent, competition?, home_away?, notes? }
 */
export async function POST(req: Request) {
  const sb = supabaseAdmin();
  const body = (await req.json().catch(() => ({}))) as {
    match_date?: string;
    opponent?: string;
    competition?: string;
    home_away?: "home" | "away";
    notes?: string;
  };

  if (!body.match_date || !body.opponent?.trim()) {
    return NextResponse.json({ error: "match_date and opponent are required" }, { status: 400 });
  }

  const { data, error } = await sb
    .from("matches")
    .insert({
      match_date: body.match_date,
      opponent: body.opponent.trim(),
      competition: body.competition?.trim() || null,
      home_away: body.home_away === "away" ? "away" : "home",
      notes: body.notes?.trim() || null,
    } as never)
    .select("*")
    .single();

  if (migrationPending(error)) {
    return NextResponse.json(
      { error: "Run migration 0042_matches_media_reach_warmup.sql first", migration_pending: true },
      { status: 422 },
    );
  }
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  await recordAudit({
    entity_type: "match",
    entity_id: (data as { id: string }).id,
    action: "match.created",
    metadata: { opponent: body.opponent, match_date: body.match_date },
  });

  return NextResponse.json({ data }, { status: 201 });
}
