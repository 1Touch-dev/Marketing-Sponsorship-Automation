import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";
import { invokeClaude, extractJson } from "@/lib/bedrock/client";
import { recordAudit } from "@/lib/audit/log";
import { proposalPrompt } from "@/lib/bedrock/prompts";

export const maxDuration = 90;

export async function POST(req: Request) {
  try {
    const body = await req.json() as {
      session_key?: string;
      proposal_type: string;
      company_id: string;
      campaign_id?: string | null;
      selected_components?: string[];
      selected_strategies?: string[];
      strategy?: string;
      custom_brief?: string;
    };

    const selectedComponents: string[] = body.selected_components ?? (body.strategy ? [body.strategy] : []);
    const selectedStrategies: string[] = body.selected_strategies ?? (body.strategy ? [body.strategy] : []);

    const sb = supabaseAdmin();

    // Load company
    const { data: company } = await sb.from("companies").select("*").eq("id", body.company_id).maybeSingle();
    if (!company) return NextResponse.json({ error: "Company not found" }, { status: 404 });

    // Load campaign if provided
    const { data: campaign } = body.campaign_id
      ? await sb.from("campaigns").select("id, title, summary").eq("id", body.campaign_id).maybeSingle()
      : { data: null };

    // Build context-aware proposal prompt with selected components and strategies
    const componentContext = selectedComponents.length > 0
      ? `\nSelected sponsorship inventory: ${selectedComponents.map(c => c.replace(/_/g, " ")).join(", ")}.`
      : "";
    const strategyContext = selectedStrategies.length > 0
      ? `\nSelected strategies: ${selectedStrategies.map(s => s.replace(/_/g, " ")).join(", ")}.`
      : "";
    const typeContext = body.proposal_type !== "sponsorship"
      ? `\nProposal type: ${body.proposal_type.replace(/_/g, " ")} — adapt the content accordingly.`
      : "";
    const briefContext = body.custom_brief ? `\nAdditional brief: ${body.custom_brief}` : "";

    const strategyVariant = selectedStrategies[0]?.replace(/_/g, " ") ?? null;

    const { system, user } = proposalPrompt({
      company: { company_name: company.company_name, industry: company.industry, country: company.country, notes: company.notes },
      campaign: campaign ? { title: campaign.title, summary: campaign.summary } : { title: `${company.company_name} × Coritiba FC Partnership` },
      strategy_variant: strategyVariant,
    });

    const enhancedUser = user + componentContext + strategyContext + typeContext + briefContext;

    const result = await invokeClaude({
      messages: [{ role: "user", content: enhancedUser }],
      system,
      maxTokens: 4000,
      temperature: 0.6,
    });

    const parsed = extractJson(result.text) as Record<string, unknown> | null;
    if (!parsed) throw new Error("AI returned invalid JSON");

    // Create campaign if none
    let campaignId = body.campaign_id;
    if (!campaignId) {
      const { data: newCampaign } = await sb.from("campaigns").insert({
        title: `${company.company_name} × Coritiba FC — ${(body.proposal_type).replace(/_/g, " ")}`,
        summary: `Wizard-generated campaign for ${company.company_name}`,
        company_id: company.id,
        status: "active",
        strategy: strategyVariant ?? "awareness",
      }).select("id").single();
      campaignId = newCampaign?.id ?? null;
    }

    // Create proposal
    const { data: proposal, error } = await sb.from("proposals").insert({
      title: (parsed.title as string) ?? `${company.company_name} × Coritiba FC — Proposal`,
      company_id: company.id,
      campaign_id: campaignId,
      status: "draft",
      content: parsed,
      proposal_type: body.proposal_type,
      selected_components: selectedComponents,
      selected_strategies: selectedStrategies,
      version: 1,
    }).select("id").single();

    if (error) throw new Error(error.message);

    // Update wizard draft
    await sb.from("proposal_wizard_drafts" as "companies").upsert({
      session_key: body.session_key,
      generated_proposal_id: proposal.id,
      status: "completed",
    }, { onConflict: "session_key" });

    await recordAudit({
      action: "proposal.wizard_generated",
      entity_type: "proposal",
      entity_id: proposal.id,
      metadata: { company: company.company_name, type: body.proposal_type, strategies: selectedStrategies.length, components: selectedComponents.length },
    });

    return NextResponse.json({ proposal_id: proposal.id });
  } catch (err) {
    console.error("[wizard/generate]", err);
    return NextResponse.json({ error: err instanceof Error ? err.message : "Generation failed" }, { status: 500 });
  }
}
