import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";
import { recordAudit } from "@/lib/audit/log";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type SequenceStep = {
  step: number;
  flow_type: string;
  template_id?: string | null;
  delay_days: number;
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
 * POST /api/email-sequences/enroll
 * Body: { sequence_id, company_id?, proposal_id?, recipient?, contact_name? }
 *
 * Assigns a company/proposal to a sequence. Records the enrollment with the
 * first step due immediately (next_run_at = now). If a company_id is given, the
 * sequence name is also stored on companies.default_email_flow.
 */
export async function POST(req: Request) {
  const sb = supabaseAdmin();
  const body = (await req.json().catch(() => ({}))) as {
    sequence_id?: string;
    company_id?: string;
    proposal_id?: string;
    recipient?: string;
    contact_name?: string;
  };

  if (!body.sequence_id) {
    return NextResponse.json({ error: "sequence_id is required" }, { status: 400 });
  }

  const { data: seq, error: seqErr } = await sb
    .from("email_sequences")
    .select("*")
    .eq("id", body.sequence_id)
    .maybeSingle();
  if (seqErr) return NextResponse.json({ error: seqErr.message }, { status: 500 });
  if (!seq) return NextResponse.json({ error: "Sequence not found" }, { status: 404 });

  const steps = parseSteps((seq as Record<string, unknown>).steps);
  const firstStep = steps[0];
  const nextRunAt = new Date(Date.now() + (firstStep?.delay_days ?? 0) * 86_400_000).toISOString();

  const { data: enrollment, error: enrErr } = await sb
    .from("email_sequence_enrollments")
    .insert({
      sequence_id: body.sequence_id,
      company_id: body.company_id ?? null,
      proposal_id: body.proposal_id ?? null,
      recipient: body.recipient ?? null,
      contact_name: body.contact_name ?? null,
      current_step: 0,
      status: "active",
      next_run_at: nextRunAt,
    } as never)
    .select("*")
    .single();

  if (enrErr) return NextResponse.json({ error: enrErr.message }, { status: 500 });

  // Store the assigned flow name on the company for quick reference.
  if (body.company_id) {
    await sb
      .from("companies")
      .update({ default_email_flow: (seq as { name: string }).name } as never)
      .eq("id", body.company_id);
  }

  await recordAudit({
    entity_type: "email_sequence",
    entity_id: body.sequence_id,
    action: "email_sequence.enrolled",
    metadata: { company_id: body.company_id ?? null, proposal_id: body.proposal_id ?? null },
  });

  return NextResponse.json(
    { data: enrollment, total_steps: steps.length, next_step: firstStep ?? null },
    { status: 201 },
  );
}
