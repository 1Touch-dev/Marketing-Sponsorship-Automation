import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";
import { emailGenerateSchema } from "@/lib/validators";
import { invokeClaude } from "@/lib/bedrock/client";
import { outreachEmailPrompt, PROMPT_VERSION } from "@/lib/bedrock/prompts";
import { recordAudit } from "@/lib/audit/log";
import { serverEnv } from "@/lib/env";
import { checkRateLimit, getClientIp } from "@/lib/rate-limit";
import { startWorkflow, completeWorkflow, failWorkflow, retryWorkflow } from "@/lib/workflow-events";
import { emailOutputSchema, validateAiOutput, type EmailOutput } from "@/lib/ai/schemas";
import { guardColumns } from "@/lib/db/column-guard";

export const runtime = "nodejs";
export const maxDuration = 60;

const MAX_RETRIES = 2;

export async function POST(req: Request) {
  const env = serverEnv();
  const ip = getClientIp(req);
  const rl = checkRateLimit(`email-generate:${ip}`, { max: 15, windowMs: 60_000 });
  if (!rl.ok) return NextResponse.json({ error: rl.message }, { status: 429 });

  const body = await req.json().catch(() => ({}));
  const parsed = emailGenerateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid payload", issues: parsed.error.issues }, { status: 400 });
  }

  const sb = supabaseAdmin();
  const { data: proposal, error: pErr } = await sb
    .from("proposals")
    .select("id, title, status, content, company_id, companies(id, company_name, industry, website, country)")
    .eq("id", parsed.data.proposal_id)
    .single();
  if (pErr || !proposal) return NextResponse.json({ error: "Proposal not found" }, { status: 404 });
  if (proposal.status !== "approved") {
    return NextResponse.json({ error: "Proposal must be approved before generating outreach" }, { status: 400 });
  }

  const company = (proposal as unknown as { companies: Record<string, unknown> | null }).companies;
  if (!company) return NextResponse.json({ error: "Company not found for proposal" }, { status: 500 });

  const eventId = await startWorkflow({
    workflow_name: "email.generate",
    entity_type: "proposal",
    entity_id: proposal.id,
    metadata: { proposal_id: proposal.id },
  });

  const content = proposal.content as Record<string, string> | null;
  const summary =
    content?.executive_summary ||
    content?.campaign_rationale ||
    proposal.title;

  const { system, user } = outreachEmailPrompt({
    company: company as unknown as Parameters<typeof outreachEmailPrompt>[0]["company"],
    proposalTitle: proposal.title,
    proposalSummary: summary,
    contactName: parsed.data.contact_name,
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
        maxTokens: 800,
        temperature: 0.5,
      });

      const vr = validateAiOutput(emailOutputSchema, claude.json, {
        workflow: "email.generate",
        entity_type: "proposal",
        entity_id: proposal.id,
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
      entity_type: "email",
      action: "email.generate_failed",
      metadata: { proposal_id: proposal.id, error: lastError },
    });
    return NextResponse.json(
      { error: `AI generation failed after ${attempt} attempt(s): ${lastError}` },
      { status: 502 },
    );
  }

  // Fetch proposal images to embed in email
  const { data: imageJobs } = await sb
    .from("image_generation_jobs")
    .select("selected_url, output_urls, status, display_label")
    .eq("proposal_id", proposal.id)
    .in("status", ["completed", "approved"])
    .limit(3);

  const imageUrls: string[] = [];
  for (const job of imageJobs ?? []) {
    const url = (job as Record<string, unknown>).selected_url as string
      || ((job as Record<string, unknown>).output_urls as Array<{url: string}>)?.[0]?.url;
    if (url && !url.startsWith("data:")) imageUrls.push(url);
  }

  let bodyHtml = validated.body_html ?? `<p>${validated.body_text.replace(/\n/g, "</p><p>")}</p>`;
  if (imageUrls.length > 0) {
    const imgSection = `<br/><table width="100%" cellpadding="0" cellspacing="0" style="margin-top:16px"><tr>${imageUrls.slice(0, 2).map(u => `<td style="padding:4px"><img src="${u}" alt="Coritiba FC" style="max-width:100%;border-radius:8px" /></td>`).join("")}</tr></table>`;
    bodyHtml += imgSection;
  }

  const { data: row, error: insErr } = await sb
    .from("emails")
    .insert(
      guardColumns("emails", {
        proposal_id: proposal.id,
        recipient: parsed.data.recipient,
        subject: validated.subject,
        body_text: validated.body_text,
        body_html: bodyHtml,
        status: "pending_approval",
        generated_by: "bedrock-claude",
        sender: env.DEFAULT_FROM_EMAIL ?? null,
        prompt_version: PROMPT_VERSION,
        metadata: { model_id: env.BEDROCK_MODEL_ID },
      }),
    )
    .select("*")
    .single();

  if (insErr || !row) {
    if (eventId) await failWorkflow(eventId, insErr?.message ?? "Insert failed");
    return NextResponse.json({ error: insErr?.message ?? "Insert failed" }, { status: 500 });
  }

  if (eventId) await completeWorkflow(eventId, { email_id: row.id });
  await recordAudit({
    entity_type: "email",
    entity_id: row.id,
    action: "email.generated",
    metadata: { proposal_id: proposal.id, recipient: parsed.data.recipient, attempts: attempt },
  });

  return NextResponse.json({ data: row, attempts: attempt });
}
