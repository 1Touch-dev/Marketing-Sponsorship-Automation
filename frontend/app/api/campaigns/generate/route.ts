import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";
import { campaignGenerateSchema } from "@/lib/validators";
import { invokeClaude } from "@/lib/bedrock/client";
import { campaignIdeasPrompt } from "@/lib/bedrock/prompts";
import { recordAudit } from "@/lib/audit/log";
import { serverEnv } from "@/lib/env";

export const runtime = "nodejs";
export const maxDuration = 60;

interface IdeaJson {
  ideas: Array<{
    title: string;
    summary?: string;
    activation?: string;
    partnership_angle?: string;
    cta?: string;
  }>;
}

export async function POST(req: Request) {
  const env = serverEnv();
  const body = await req.json().catch(() => ({}));
  const parsed = campaignGenerateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid payload", issues: parsed.error.issues }, { status: 400 });
  }

  const sb = supabaseAdmin();
  const { data: company, error: companyErr } = await sb
    .from("companies")
    .select("*")
    .eq("id", parsed.data.company_id)
    .single();
  if (companyErr || !company) {
    return NextResponse.json({ error: "Company not found" }, { status: 404 });
  }

  const { system, user } = campaignIdeasPrompt({
    company,
    objective: parsed.data.objective,
    maxIdeas: parsed.data.max_ideas ?? env.MAX_CAMPAIGN_IDEAS,
  });

  let claude;
  try {
    claude = await invokeClaude<IdeaJson>({
      system,
      messages: [{ role: "user", content: user }],
      json: true,
      maxTokens: 2500,
      temperature: 0.6,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Bedrock invocation failed";
    return NextResponse.json({ error: `Bedrock error: ${msg}` }, { status: 502 });
  }

  const ideas = claude.json?.ideas;
  if (!ideas || !Array.isArray(ideas) || ideas.length === 0) {
    return NextResponse.json(
      { error: "Model did not return valid ideas JSON", raw_text: claude.text },
      { status: 502 },
    );
  }

  const rows = ideas.map((i) => ({
    company_id: company.id,
    title: i.title?.slice(0, 200) ?? "Untitled campaign",
    summary: i.summary ?? null,
    activation: i.activation ?? null,
    cta: i.cta ?? null,
    description: i.partnership_angle ?? null,
    objective: parsed.data.objective ?? null,
    raw_output: i as unknown,
    generated_by: "bedrock-claude",
    model_id: env.BEDROCK_MODEL_ID,
    status: "draft" as const,
  }));

  const { data: inserted, error: insertErr } = await sb.from("campaigns").insert(rows).select("*");
  if (insertErr) {
    return NextResponse.json({ error: insertErr.message }, { status: 500 });
  }

  await recordAudit({
    entity_type: "campaign",
    action: "campaigns.generated",
    metadata: { company_id: company.id, count: inserted?.length ?? 0 },
  });

  return NextResponse.json({ data: inserted, usage: claude.usage });
}
