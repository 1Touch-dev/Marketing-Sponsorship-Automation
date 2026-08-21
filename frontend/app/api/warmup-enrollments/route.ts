import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";
import { recordAudit } from "@/lib/audit/log";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type WarmupStep = { step: number; type: string; label: string; delay_days: number };

function parseSteps(raw: unknown): WarmupStep[] {
  if (Array.isArray(raw)) return raw as WarmupStep[];
  if (typeof raw === "string") {
    try {
      return JSON.parse(raw) as WarmupStep[];
    } catch {
      return [];
    }
  }
  return [];
}

/**
 * GET /api/warmup-enrollments?company_id=... — active/paused enrollments for a company.
 */
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const companyId = searchParams.get("company_id");
  if (!companyId) return NextResponse.json({ error: "company_id is required" }, { status: 400 });

  const sb = supabaseAdmin();
  const { data, error } = await sb
    .from("warmup_enrollments")
    .select("*, warmup_sequences(name, steps), matches(opponent, match_date)")
    .eq("company_id", companyId)
    .order("created_at", { ascending: false });

  if (error) {
    if (error.code === "42P01" || error.code === "PGRST205") {
      return NextResponse.json({ data: [], migration_pending: true });
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ data: data ?? [] });
}

/**
 * POST /api/warmup-enrollments
 * Body: { sequence_id, company_id, contact_name?, match_id? }
 * Enrolls a company in a warm-up sequence, with its first step due immediately.
 */
export async function POST(req: Request) {
  const sb = supabaseAdmin();
  const body = (await req.json().catch(() => ({}))) as {
    sequence_id?: string;
    company_id?: string;
    contact_name?: string;
    match_id?: string | null;
  };

  if (!body.sequence_id || !body.company_id) {
    return NextResponse.json({ error: "sequence_id and company_id are required" }, { status: 400 });
  }

  const { data: seq, error: seqErr } = await sb
    .from("warmup_sequences")
    .select("*")
    .eq("id", body.sequence_id)
    .maybeSingle();
  if (seqErr) return NextResponse.json({ error: seqErr.message }, { status: 500 });
  if (!seq) return NextResponse.json({ error: "Sequence not found" }, { status: 404 });

  const steps = parseSteps((seq as Record<string, unknown>).steps);
  const firstStep = steps[0];
  const nextActionAt = new Date(Date.now() + (firstStep?.delay_days ?? 0) * 86_400_000).toISOString();

  const { data: enrollment, error: enrErr } = await sb
    .from("warmup_enrollments")
    .insert({
      sequence_id: body.sequence_id,
      company_id: body.company_id,
      contact_name: body.contact_name?.trim() || null,
      match_id: body.match_id || null,
      current_step: 0,
      status: "active",
      next_action_at: nextActionAt,
    } as never)
    .select("*")
    .single();

  if (enrErr) {
    if (enrErr.code === "42P01" || enrErr.code === "PGRST205") {
      return NextResponse.json(
        { error: "Run migration 0042_matches_media_reach_warmup.sql first", migration_pending: true },
        { status: 422 },
      );
    }
    return NextResponse.json({ error: enrErr.message }, { status: 500 });
  }

  await recordAudit({
    entity_type: "warmup_enrollment",
    entity_id: (enrollment as { id: string }).id,
    action: "warmup_enrollment.created",
    metadata: { company_id: body.company_id, sequence_id: body.sequence_id },
  });

  return NextResponse.json({ data: enrollment, total_steps: steps.length, next_step: firstStep ?? null }, { status: 201 });
}
