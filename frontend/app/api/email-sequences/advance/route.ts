import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";
import { recordAudit } from "@/lib/audit/log";
import { serverEnv } from "@/lib/env";
import { requirePermission } from "@/lib/auth/server-permission";

export const runtime = "nodejs";
export const maxDuration = 120;
export const dynamic = "force-dynamic";

type SequenceStep = {
  step: number;
  flow_type: "intro" | "follow_up" | "negotiation" | "barter";
  template_id?: string | null;
  delay_days: number;
  // Phase 2 — tone control per step (master_report.md 7.2). Optional;
  // falls back to each prompt's own default tone when unset.
  tone?: "warm" | "formal" | "urgent" | null;
};

function parseSteps(raw: unknown): SequenceStep[] {
  if (Array.isArray(raw)) return raw as SequenceStep[];
  if (typeof raw === "string") {
    try {
      return JSON.parse(raw) as SequenceStep[];
    } catch {
      return [];
    }
  }
  return [];
}

/**
 * POST /api/email-sequences/advance
 * Body: { enrollment_id?: string, run_due?: boolean, limit?: number }
 *
 * Scheduler stub. Processes either one enrollment (enrollment_id) or all
 * enrollments whose next_run_at is due (run_due). For each, it generates the
 * current step's email draft (via /api/emails/generate, which keeps the draft +
 * Pipedrive-logging model), advances current_step and schedules next_run_at.
 *
 * This can be invoked by a cron/n8n webhook, or manually from the UI.
 */
export async function POST(req: Request) {
  const auth = await requirePermission("edit_company");
  if ("error" in auth) return auth.error;

  const sb = supabaseAdmin();
  const env = serverEnv();
  const appUrl = env.APP_URL ?? process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";

  const body = (await req.json().catch(() => ({}))) as {
    enrollment_id?: string;
    run_due?: boolean;
    limit?: number;
  };

  let query = sb.from("email_sequence_enrollments").select("*").eq("status", "active");
  if (body.enrollment_id) {
    query = query.eq("id", body.enrollment_id);
  } else if (body.run_due) {
    query = query.lte("next_run_at", new Date().toISOString());
  } else {
    return NextResponse.json({ error: "Provide enrollment_id or run_due:true" }, { status: 400 });
  }
  query = query.limit(body.limit ?? 25);

  const { data: enrollments, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const results: Array<Record<string, unknown>> = [];

  for (const enr of enrollments ?? []) {
    const e = enr as Record<string, unknown>;
    const { data: seq } = await sb
      .from("email_sequences")
      .select("steps")
      .eq("id", e.sequence_id as string)
      .maybeSingle();
    const steps = parseSteps((seq as Record<string, unknown> | null)?.steps);

    const currentStepIdx = (e.current_step as number) ?? 0; // 0-based index of next step to run
    const step = steps[currentStepIdx];

    if (!step) {
      await sb
        .from("email_sequence_enrollments")
        .update({ status: "completed", next_run_at: null } as never)
        .eq("id", e.id as string);
      results.push({ enrollment_id: e.id, action: "completed" });
      continue;
    }

    if (!e.proposal_id || !e.recipient) {
      results.push({ enrollment_id: e.id, action: "skipped", reason: "missing proposal_id or recipient" });
      continue;
    }

    // Generate the draft for this step's flow via the existing generate endpoint.
    let generated: { data?: { id?: string }; error?: string } = {};
    try {
      const res = await fetch(`${appUrl}/api/emails/generate`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          proposal_id: e.proposal_id,
          recipient: e.recipient,
          contact_name: e.contact_name ?? undefined,
          flow_type: step.flow_type,
          template_id: step.template_id ?? undefined,
          tone: step.tone ?? undefined,
        }),
      });
      generated = await res.json();
      if (!res.ok) throw new Error(generated.error ?? "generate failed");
    } catch (err) {
      results.push({
        enrollment_id: e.id,
        step: step.step,
        action: "error",
        error: err instanceof Error ? err.message : "generate failed",
      });
      continue;
    }

    // Advance: point to the next step and schedule its due time.
    const nextIdx = currentStepIdx + 1;
    const nextStep = steps[nextIdx];
    const isDone = !nextStep;
    const nextRunAt = nextStep
      ? new Date(Date.now() + (nextStep.delay_days ?? 0) * 86_400_000).toISOString()
      : null;

    await sb
      .from("email_sequence_enrollments")
      .update({
        current_step: nextIdx,
        status: isDone ? "completed" : "active",
        next_run_at: nextRunAt,
      } as never)
      .eq("id", e.id as string);

    results.push({
      enrollment_id: e.id,
      step: step.step,
      flow_type: step.flow_type,
      email_id: generated.data?.id ?? null,
      action: isDone ? "generated_and_completed" : "generated_and_scheduled",
      next_run_at: nextRunAt,
    });
  }

  await recordAudit({
    entity_type: "email_sequence",
    entity_id: body.enrollment_id ?? "batch",
    action: "email_sequence.advanced",
    metadata: { processed: results.length },
  });

  return NextResponse.json({ processed: results.length, results });
}
