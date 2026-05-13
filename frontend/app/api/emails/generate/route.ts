import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";
import { emailGenerateSchema } from "@/lib/validators";
import { invokeClaude } from "@/lib/bedrock/client";
import { outreachEmailPrompt } from "@/lib/bedrock/prompts";
import { recordAudit } from "@/lib/audit/log";
import { serverEnv } from "@/lib/env";

export const runtime = "nodejs";
export const maxDuration = 60;

interface EmailJson {
  subject: string;
  body_text: string;
  body_html?: string;
}

export async function POST(req: Request) {
  const env = serverEnv();
  const body = await req.json().catch(() => ({}));
  const parsed = emailGenerateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid payload", issues: parsed.error.issues }, { status: 400 });
  }

  const sb = supabaseAdmin();
  const { data: proposal, error: pErr } = await sb
    .from("proposals")
    .select("*, companies(*)")
    .eq("id", parsed.data.proposal_id)
    .single();
  if (pErr || !proposal) return NextResponse.json({ error: "Proposal not found" }, { status: 404 });
  if (proposal.status !== "approved") {
    return NextResponse.json({ error: "Proposal must be approved before generating outreach" }, { status: 400 });
  }

  const company = (proposal as any).companies;
  const content: any = proposal.content ?? {};
  const summary = content.executive_summary || content.campaign_rationale || proposal.title;

  const { system, user } = outreachEmailPrompt({
    company,
    proposalTitle: proposal.title,
    proposalSummary: summary,
    contactName: parsed.data.contact_name,
  });

  let claude;
  try {
    claude = await invokeClaude<EmailJson>({
      system,
      messages: [{ role: "user", content: user }],
      json: true,
      maxTokens: 800,
      temperature: 0.5,
    });
  } catch (err) {
    return NextResponse.json(
      { error: `Bedrock error: ${err instanceof Error ? err.message : "unknown"}` },
      { status: 502 },
    );
  }

  const email = claude.json;
  if (!email?.subject || !email?.body_text) {
    return NextResponse.json({ error: "Model did not return valid email", raw_text: claude.text }, { status: 502 });
  }

  const { data: row, error: insErr } = await sb
    .from("emails")
    .insert({
      proposal_id: proposal.id,
      recipient: parsed.data.recipient,
      subject: email.subject,
      body_text: email.body_text,
      body_html: email.body_html ?? `<p>${email.body_text.replace(/\n/g, "</p><p>")}</p>`,
      status: "pending_approval",
      generated_by: "bedrock-claude",
      sender: env.DEFAULT_FROM_EMAIL ?? null,
      metadata: { model_id: env.BEDROCK_MODEL_ID },
    })
    .select("*")
    .single();
  if (insErr || !row) return NextResponse.json({ error: insErr?.message ?? "Insert failed" }, { status: 500 });

  await recordAudit({
    entity_type: "email",
    entity_id: row.id,
    action: "email.generated",
    metadata: { proposal_id: proposal.id, recipient: parsed.data.recipient },
  });

  return NextResponse.json({ data: row });
}
