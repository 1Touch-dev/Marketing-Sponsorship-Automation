import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";
import { invokeClaude } from "@/lib/bedrock/client";
import { followupEmailPrompt, PROMPT_VERSION } from "@/lib/bedrock/prompts";
import { recordAudit } from "@/lib/audit/log";
import { serverEnv } from "@/lib/env";
import { checkRateLimit, getClientIp } from "@/lib/rate-limit";
import { startWorkflow, completeWorkflow, failWorkflow, retryWorkflow } from "@/lib/workflow-events";
import { emailOutputSchema, validateAiOutput, type EmailOutput } from "@/lib/ai/schemas";
import { guardColumns } from "@/lib/db/column-guard";
import { z } from "zod";

export const runtime = "nodejs";
export const maxDuration = 60;

const MAX_RETRIES = 2;

const inputSchema = z.object({
  email_id: z.string().uuid(),
  // Phase 5 — gone-cold nudges (see app/api/proposals/detect-cold/route.ts)
  // use this same generator but with a reason reflecting engagement
  // signal rather than elapsed time since send.
  reason: z.string().max(300).optional(),
});

type EmailRow = {
  id: string;
  sent_at: string | null;
  created_at: string;
  subject: string;
  body_text: string | null;
  recipient: string;
  sender: string | null;
  proposal_id: string | null;
  thread_id: string | null;
  gmail_thread_id: string | null;
  proposals: {
    id: string;
    companies: {
      id: string;
      company_name: string;
      industry: string | null;
      website: string | null;
      country: string | null;
    } | null;
  } | null;
};

export async function POST(req: Request) {
  const env = serverEnv();
  const ip = getClientIp(req);
  const rl = checkRateLimit(`followup-generate:${ip}`, { max: 15, windowMs: 60_000 });
  if (!rl.ok) return NextResponse.json({ error: rl.message }, { status: 429 });

  const body = await req.json().catch(() => ({}));
  const parsed = inputSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Invalid payload" }, { status: 400 });

  const sb = supabaseAdmin();
  const { data: parentEmail, error: peErr } = await sb
    .from("emails")
    .select("id, sent_at, created_at, subject, body_text, recipient, sender, proposal_id, thread_id, gmail_thread_id, proposals(id, companies(id, company_name, industry, website, country))")
    .eq("id", parsed.data.email_id)
    .single();

  if (peErr || !parentEmail) return NextResponse.json({ error: "Email not found" }, { status: 404 });

  const typedEmail = parentEmail as unknown as EmailRow;
  const company = typedEmail.proposals?.companies;
  if (!company) return NextResponse.json({ error: "Cannot resolve company for follow-up" }, { status: 400 });

  const sentAt = typedEmail.sent_at ? new Date(typedEmail.sent_at) : new Date(typedEmail.created_at);
  const daysSince = Math.max(1, Math.round((Date.now() - sentAt.getTime()) / 86_400_000));

  const eventId = await startWorkflow({
    workflow_name: "followup.generate",
    entity_type: "email",
    entity_id: typedEmail.id,
    metadata: { parent_email_id: typedEmail.id },
  });

  const { system, user } = followupEmailPrompt({
    company,
    previousSubject: typedEmail.subject,
    previousBody: typedEmail.body_text ?? "",
    daysSinceSent: daysSince,
  });

  let validated: EmailOutput | null = null;
  let lastError = "";
  let attempt = 0;

  while (attempt < MAX_RETRIES) {
    attempt++;
    try {
      const claude = await invokeClaude<unknown>({
        system,
        messages: [{ role: "user", content: user }],
        json: true,
        maxTokens: 700,
        temperature: 0.5,
      });

      const vr = validateAiOutput(emailOutputSchema, claude.json, {
        workflow: "followup.generate",
        entity_type: "email",
        entity_id: typedEmail.id,
      });

      if (vr.ok && vr.data) {
        validated = vr.data;
        break;
      }
      lastError = vr.error ?? "Validation failed";
      if (attempt < MAX_RETRIES && eventId) await retryWorkflow(eventId, attempt + 1, { last_error: lastError });
    } catch (err) {
      lastError = err instanceof Error ? err.message : "Bedrock invocation failed";
      if (attempt < MAX_RETRIES && eventId) await retryWorkflow(eventId, attempt + 1, { last_error: lastError });
    }
  }

  if (!validated) {
    if (eventId) await failWorkflow(eventId, lastError);
    await recordAudit({
      entity_type: "followup",
      action: "followup.generate_failed",
      metadata: { parent_email_id: typedEmail.id, error: lastError },
    });
    return NextResponse.json(
      { error: `AI generation failed after ${attempt} attempt(s): ${lastError}` },
      { status: 502 },
    );
  }

  const { data: draft, error: insErr } = await sb
    .from("emails")
    .insert(
      guardColumns("emails", {
        proposal_id: typedEmail.proposal_id,
        thread_id: typedEmail.thread_id,
        gmail_thread_id: typedEmail.gmail_thread_id,
        recipient: typedEmail.recipient,
        sender: typedEmail.sender ?? env.DEFAULT_FROM_EMAIL ?? null,
        subject: validated.subject,
        body_text: validated.body_text,
        body_html: validated.body_html ?? `<p>${validated.body_text.replace(/\n/g, "</p><p>")}</p>`,
        status: "pending_approval",
        generated_by: "bedrock-claude-followup",
        prompt_version: PROMPT_VERSION,
      }),
    )
    .select("*")
    .single();

  if (insErr || !draft) {
    if (eventId) await failWorkflow(eventId, insErr?.message ?? "Insert failed");
    return NextResponse.json({ error: insErr?.message ?? "Insert failed" }, { status: 500 });
  }

  const { data: followup, error: fErr } = await sb
    .from("followups")
    .insert({
      proposal_id: typedEmail.proposal_id,
      thread_id: typedEmail.thread_id,
      parent_email_id: typedEmail.id,
      draft_email_id: draft.id,
      suggested_body: validated.body_text,
      reason: parsed.data.reason ?? `Auto follow-up after ${daysSince} day(s)`,
      status: "suggested",
    })
    .select("*")
    .single();

  if (fErr) {
    if (eventId) await failWorkflow(eventId, fErr.message);
    return NextResponse.json({ error: fErr.message }, { status: 500 });
  }

  if (eventId) await completeWorkflow(eventId, { followup_id: followup?.id, draft_email_id: draft.id });
  await recordAudit({
    entity_type: "followup",
    entity_id: followup?.id,
    action: "followup.suggested",
    metadata: { parent_email_id: typedEmail.id, draft_email_id: draft.id, attempts: attempt },
  });

  return NextResponse.json({ data: { followup, draft_email: draft }, attempts: attempt });
}
