import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";
import { recordAudit } from "@/lib/audit/log";
import { requirePermission } from "@/lib/auth/server-permission";

export const runtime = "nodejs";

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
 * POST /api/warmup-enrollments/[id]/advance
 * Marks the enrollment's current step done and moves to the next one — these
 * are real-world touchpoints (invite, dinner, call) a rep marks complete
 * manually, not auto-generated content like the email-sequence scheduler.
 */
export async function POST(_req: Request, ctx: { params: { id: string } }) {
  const auth = await requirePermission("edit_company");
  if ("error" in auth) return auth.error;

  const sb = supabaseAdmin();
  const { id } = ctx.params;

  const { data: enr, error: enrErr } = await sb.from("warmup_enrollments").select("*").eq("id", id).maybeSingle();
  if (enrErr) return NextResponse.json({ error: enrErr.message }, { status: 500 });
  if (!enr) return NextResponse.json({ error: "Enrollment not found" }, { status: 404 });

  const e = enr as Record<string, unknown>;
  const { data: seq } = await sb.from("warmup_sequences").select("steps").eq("id", e.sequence_id as string).maybeSingle();
  const steps = parseSteps((seq as Record<string, unknown> | null)?.steps);

  const nextIdx = ((e.current_step as number) ?? 0) + 1;
  const nextStep = steps[nextIdx];
  const isDone = !nextStep;
  const nextActionAt = nextStep ? new Date(Date.now() + (nextStep.delay_days ?? 0) * 86_400_000).toISOString() : null;

  const { data, error } = await sb
    .from("warmup_enrollments")
    .update({
      current_step: nextIdx,
      status: isDone ? "completed" : "active",
      next_action_at: nextActionAt,
    } as never)
    .eq("id", id)
    .select("*")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  await recordAudit({
    entity_type: "warmup_enrollment",
    entity_id: id,
    action: "warmup_enrollment.advanced",
    metadata: { current_step: nextIdx, status: isDone ? "completed" : "active" },
  });

  return NextResponse.json({ data, done: isDone });
}
