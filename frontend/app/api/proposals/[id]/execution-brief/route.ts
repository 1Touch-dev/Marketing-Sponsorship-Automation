import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";
import { invokeClaude, extractJson } from "@/lib/bedrock/client";
import { recordAudit } from "@/lib/audit/log";
import { executionBriefSchema, normalizeExecutionBrief, validateAiOutput } from "@/lib/ai/schemas";
import type { StrategyVariant } from "@/lib/ai/schemas";

export const maxDuration = 60;

export async function POST(
  _req: Request,
  ctx: { params: { id: string } }
) {
  const sb = supabaseAdmin();
  const { id } = ctx.params;

  const { data: proposal } = await sb
    .from("proposals")
    .select("*, companies(company_name, industry, website), campaigns(title, summary)")
    .eq("id", id)
    .maybeSingle();

  if (!proposal) return NextResponse.json({ error: "Proposal not found" }, { status: 404 });

  const p = proposal as typeof proposal & {
    companies: { company_name: string; industry?: string | null; website?: string | null } | null;
    campaigns: { title: string; summary?: string | null } | null;
    strategy_variants?: StrategyVariant[] | null;
  };

  const strategies = (p.strategy_variants ?? [])
    .map((v: StrategyVariant) => `- ID: ${v.id} | Label: ${v.label}\n  Activations: ${v.key_activations?.join(", ")}`)
    .join("\n");

  const content = p.content as Record<string, unknown> | null;

  const prompt = `You are a sports marketing operations expert for Coritiba FC.

Generate a detailed execution brief for EACH campaign strategy in this sponsorship proposal.
For each strategy, estimate:
- Duration to produce/activate
- Resources required (human, equipment, venues, creative)
- Action items (specific tasks)
- Estimated cost in BRL (production + activation, NOT the sponsorship fee itself)
- Complexity level (low/medium/high)
- Key risk

Company: ${p.companies?.company_name ?? "Unknown"}
Industry: ${p.companies?.industry ?? "Unknown"}
Campaign: ${p.campaigns?.title ?? "Sponsorship"}
Proposal activation plan: ${String(content?.activation_plan ?? "").slice(0, 500)}

Campaign strategies to brief:
${strategies || "General sponsorship activation"}

Return JSON:
{
  "briefs": [
    {
      "strategy_id": "awareness",
      "strategy_label": "Brand Awareness",
      "estimated_duration": "8–12 weeks",
      "estimated_cost_brl": "R$ 45.000 – R$ 70.000",
      "resources_needed": ["Videographer", "Graphic designer", "Social media team", "Player involvement (2h)"],
      "action_items": ["Briefing criativo com time de marketing", "Gravação de vídeo no Couto Pereira", "Edição e aprovação", "Publicação nas redes"],
      "complexity": "medium",
      "key_risk": "Player availability during match week"
    }
  ],
  "total_estimated_cost_brl": "R$ 45.000 – R$ 70.000",
  "production_timeline_weeks": 10
}`;

  try {
    const raw = await invokeClaude({
      system: "You are a sports marketing operations expert for Coritiba FC. Return only valid JSON.",
      messages: [{ role: "user", content: prompt }],
      maxTokens: 4096,
      json: true,
    });
    const json = raw.json ?? extractJson(raw.text);
    const normalized = normalizeExecutionBrief(json);
    const result = validateAiOutput(executionBriefSchema, normalized, {
      workflow: "execution_brief",
      entity_type: "proposal",
      entity_id: id,
      silent: false,
    });

    if (!result.ok || !result.data) {
      return NextResponse.json({ error: "AI output validation failed", details: result.errors }, { status: 422 });
    }

    // Save brief to proposal's content JSONB
    const existingContent = (p.content as Record<string, unknown>) ?? {};
    const updatedContent = { ...existingContent, execution_brief: result.data };
    await sb.from("proposals").update({ content: updatedContent }).eq("id", id);

    await recordAudit({
      entity_type: "proposal",
      entity_id: id,
      action: "execution_brief.generated",
      metadata: { strategy_count: result.data.briefs.length },
    });

    return NextResponse.json({ brief: result.data });
  } catch (err) {
    console.error("[execution-brief]", err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
