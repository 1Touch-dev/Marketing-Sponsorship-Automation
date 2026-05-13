import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";
import { campaignGenerateSchema } from "@/lib/validators";
import { invokeClaude } from "@/lib/bedrock/client";
import { campaignIdeasPrompt, PROMPT_VERSION } from "@/lib/bedrock/prompts";
import { recordAudit } from "@/lib/audit/log";
import { serverEnv } from "@/lib/env";
import { checkRateLimit, getClientIp } from "@/lib/rate-limit";
import { startWorkflow, completeWorkflow, failWorkflow, retryWorkflow } from "@/lib/workflow-events";
import {
  campaignIdeasResponseSchema,
  validateAiOutput,
  type CampaignIdeaResponse,
} from "@/lib/ai/schemas";

export const runtime = "nodejs";
export const maxDuration = 60;

const MAX_RETRIES = 2;

export async function POST(req: Request) {
  const env = serverEnv();
  const ip = getClientIp(req);
  const rl = checkRateLimit(`campaign-generate:${ip}`, { max: 10, windowMs: 60_000 });
  if (!rl.ok) return NextResponse.json({ error: rl.message }, { status: 429 });

  const body = await req.json().catch(() => ({}));
  const parsed = campaignGenerateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid payload", issues: parsed.error.issues }, { status: 400 });
  }

  const sb = supabaseAdmin();
  const { data: company, error: companyErr } = await sb
    .from("companies")
    .select("id, company_name, industry, website, country, notes")
    .eq("id", parsed.data.company_id)
    .single();
  if (companyErr || !company) {
    return NextResponse.json({ error: "Company not found" }, { status: 404 });
  }

  const eventId = await startWorkflow({
    workflow_name: "campaign.generate",
    entity_type: "company",
    entity_id: company.id,
    metadata: { company_id: company.id, objective: parsed.data.objective },
  });

  const { system, user } = campaignIdeasPrompt({
    company,
    objective: parsed.data.objective,
    maxIdeas: parsed.data.max_ideas ?? env.MAX_CAMPAIGN_IDEAS,
  });

  let validated: CampaignIdeaResponse | null = null;
  let lastError = "";
  let attempt = 0;

  while (attempt < MAX_RETRIES) {
    attempt++;
    try {
      const claude = await invokeClaude<unknown>({
        system,
        messages: [{ role: "user", content: user }],
        json: true,
        maxTokens: 2500,
        temperature: 0.6,
      });

      const vr = validateAiOutput(campaignIdeasResponseSchema, claude.json, {
        workflow: "campaign.generate",
        entity_type: "company",
        entity_id: company.id,
      });

      if (vr.ok && vr.data) {
        validated = vr.data;
        break;
      }

      lastError = vr.error ?? "Validation failed";
      if (attempt < MAX_RETRIES && eventId) {
        await retryWorkflow(eventId, attempt + 1, { last_error: lastError });
      }
    } catch (err) {
      lastError = err instanceof Error ? err.message : "Bedrock invocation failed";
      if (attempt < MAX_RETRIES && eventId) {
        await retryWorkflow(eventId, attempt + 1, { last_error: lastError });
      }
    }
  }

  if (!validated) {
    if (eventId) await failWorkflow(eventId, lastError);
    await recordAudit({
      entity_type: "campaign",
      action: "campaign.generate_failed",
      metadata: { company_id: company.id, error: lastError, attempts: attempt },
    });
    return NextResponse.json(
      { error: `AI generation failed after ${attempt} attempt(s): ${lastError}` },
      { status: 502 },
    );
  }

  const rows = validated.ideas.map((i) => ({
    company_id: company.id,
    title: i.title.slice(0, 200),
    summary: i.summary ?? null,
    activation: i.activation ?? null,
    cta: i.cta ?? null,
    description: i.partnership_angle ?? null,
    objective: parsed.data.objective ?? null,
    raw_output: i as unknown,
    generated_by: "bedrock-claude",
    model_id: env.BEDROCK_MODEL_ID,
    prompt_version: PROMPT_VERSION,
    status: "draft" as const,
  }));

  const { data: inserted, error: insertErr } = await sb.from("campaigns").insert(rows).select("*");
  if (insertErr) {
    if (eventId) await failWorkflow(eventId, insertErr.message);
    return NextResponse.json({ error: insertErr.message }, { status: 500 });
  }

  if (eventId) {
    await completeWorkflow(eventId, { count: inserted?.length ?? 0 });
  }
  await recordAudit({
    entity_type: "campaign",
    action: "campaigns.generated",
    metadata: { company_id: company.id, count: inserted?.length ?? 0, attempts: attempt },
  });

  return NextResponse.json({ data: inserted, attempts: attempt });
}
