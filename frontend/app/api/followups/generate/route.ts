import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";
import { invokeClaude } from "@/lib/bedrock/client";
import { followupEmailPrompt } from "@/lib/bedrock/prompts";
import { recordAudit } from "@/lib/audit/log";
import { serverEnv } from "@/lib/env";
import { z } from "zod";

export const runtime = "nodejs";
export const maxDuration = 60;

const inputSchema = z.object({ email_id: z.string().uuid() });

interface EmailJson {
  subject: string;
  body_text: string;
  body_html?: string;
}

export async function POST(req: Request) {
  const env = serverEnv();
  const body = await req.json().catch(() => ({}));
  const parsed = inputSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Invalid payload" }, { status: 400 });

  const sb = supabaseAdmin();
  const { data: parentEmail, error: peErr } = await sb
    .from("emails")
    .select("*, proposals(*, companies(*))")
    .eq("id", parsed.data.email_id)
    .single();
  if (peErr || !parentEmail) return NextResponse.json({ error: "Email not found" }, { status: 404 });

  const proposal = (parentEmail as any).proposals;
  const company = proposal?.companies;
  if (!company) return NextResponse.json({ error: "Cannot resolve company for follow-up" }, { status: 400 });

  const sentAt = parentEmail.sent_at ? new Date(parentEmail.sent_at) : new Date(parentEmail.created_at);
  const daysSince = Math.max(1, Math.round((Date.now() - sentAt.getTime()) / (1000 * 60 * 60 * 24)));

  const { system, user } = followupEmailPrompt({
    company,
    previousSubject: parentEmail.subject,
    previousBody: parentEmail.body_text ?? "",
    daysSinceSent: daysSince,
  });

  const claude = await invokeClaude<EmailJson>({
    system,
    messages: [{ role: "user", content: user }],
    json: true,
    maxTokens: 700,
    temperature: 0.5,
  });

  const email = claude.json;
  if (!email?.subject || !email?.body_text) {
    return NextResponse.json({ error: "Model output invalid", raw_text: claude.text }, { status: 502 });
  }

  // Insert a new draft email row
  const { data: draft, error: insErr } = await sb
    .from("emails")
    .insert({
      proposal_id: parentEmail.proposal_id,
      thread_id: parentEmail.thread_id,
      gmail_thread_id: parentEmail.gmail_thread_id,
      recipient: parentEmail.recipient,
      sender: parentEmail.sender ?? env.DEFAULT_FROM_EMAIL ?? null,
      subject: email.subject,
      body_text: email.body_text,
      body_html: email.body_html ?? `<p>${email.body_text.replace(/\n/g, "</p><p>")}</p>`,
      status: "pending_approval",
      generated_by: "bedrock-claude-followup",
    })
    .select("*")
    .single();
  if (insErr || !draft) return NextResponse.json({ error: insErr?.message ?? "Insert failed" }, { status: 500 });

  const { data: followup, error: fErr } = await sb
    .from("followups")
    .insert({
      proposal_id: parentEmail.proposal_id,
      thread_id: parentEmail.thread_id,
      parent_email_id: parentEmail.id,
      draft_email_id: draft.id,
      suggested_body: email.body_text,
      reason: `Auto follow-up after ${daysSince} day(s)`,
      status: "suggested",
    })
    .select("*")
    .single();

  if (fErr) {
    return NextResponse.json({ error: fErr.message }, { status: 500 });
  }

  await recordAudit({
    entity_type: "followup",
    entity_id: followup?.id,
    action: "followup.suggested",
    metadata: { parent_email_id: parentEmail.id, draft_email_id: draft.id },
  });

  return NextResponse.json({ data: { followup, draft_email: draft } });
}
