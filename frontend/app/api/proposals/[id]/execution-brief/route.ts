import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";
import { invokeClaude, extractJson } from "@/lib/bedrock/client";
import { recordAudit } from "@/lib/audit/log";
import { executionBriefSchema, normalizeExecutionBrief, validateAiOutput } from "@/lib/ai/schemas";
import type { StrategyVariant } from "@/lib/ai/schemas";
import { requirePermission } from "@/lib/auth/server-permission";

export const maxDuration = 60;

export async function POST(
  _req: Request,
  ctx: { params: { id: string } }
) {
  const auth = await requirePermission("create_proposal");
  if ("error" in auth) return auth.error;

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

  // Fetch inventory items to include in brief calculations
  const { data: inventoryItems } = await (sb as ReturnType<typeof supabaseAdmin>)
    .from("inventory_items" as "companies")
    .select("name, inventory_type, category, content_hours, team_required, production_cost, setup_hours, avg_views, line_items")
    .eq("status", "active") as unknown as { data: Array<Record<string, unknown>> | null };

  const inventoryContext = inventoryItems && inventoryItems.length > 0
    ? `\n\nAvailable Inventory Items (use these for cost/hour estimates):\n${
        inventoryItems.map((item) => {
          const parts = [`- ${item.name} (${item.inventory_type}/${item.category})`];
          if (item.content_hours) parts.push(`  Content hours: ${item.content_hours}h`);
          if (item.team_required) parts.push(`  Team: ${item.team_required}`);
          if (item.production_cost) parts.push(`  Production cost: R$${item.production_cost}`);
          if (item.setup_hours) parts.push(`  Setup hours: ${item.setup_hours}h`);
          if (item.avg_views) parts.push(`  Avg views: ${item.avg_views}`);
          if (item.line_items) parts.push(`  Line items: ${item.line_items}`);
          return parts.join("\n");
        }).join("\n")
      }`
    : "";

  const prompt = `You are a sports marketing operations expert for Coritiba FC.

Generate a detailed execution brief for EACH campaign strategy in this sponsorship proposal.
For each strategy, estimate based on the actual inventory items and their real production hours/costs:
- Duration to produce/activate (be specific, use inventory hours as basis)
- Resources required (list specific team roles from team_required fields)
- Action items (specific tasks per inventory item)
- Estimated cost in BRL (sum production costs + activation costs, NOT the sponsorship fee itself)
- Complexity level (low/medium/high based on total hours)
- Key risk
- Total team hours breakdown

Company: ${p.companies?.company_name ?? "Unknown"}
Industry: ${p.companies?.industry ?? "Unknown"}
Campaign: ${p.campaigns?.title ?? "Sponsorship"}
Proposal activation plan: ${String(content?.activation_plan ?? "").slice(0, 500)}

Campaign strategies to brief:
${strategies || "General sponsorship activation"}
${inventoryContext}

Return JSON:
{
  "briefs": [
    {
      "strategy_id": "awareness",
      "strategy_label": "Brand Awareness",
      "estimated_duration": "8–12 weeks",
      "estimated_cost_brl": "R$ 45.000 – R$ 70.000",
      "resources_needed": ["Videographer (8h)", "Graphic designer (16h)", "Social media team (4h/week)", "Player involvement (2h)"],
      "action_items": ["Briefing criativo com time de marketing", "Gravação de vídeo no Couto Pereira", "Edição e aprovação", "Publicação nas redes"],
      "complexity": "medium",
      "key_risk": "Player availability during match week",
      "total_team_hours": 40
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
