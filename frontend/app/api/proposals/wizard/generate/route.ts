import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";
import { invokeClaude, extractJson } from "@/lib/bedrock/client";
import { recordAudit } from "@/lib/audit/log";
import { enqueueCrmSync } from "@/lib/pipedrive/sync";
import { proposalPrompt } from "@/lib/bedrock/prompts";

export const maxDuration = 90;

export async function POST(req: Request) {
  try {
    const body = await req.json() as {
      session_key?: string;
      proposal_type: string;
      company_id: string;
      campaign_id?: string | null;
      match_id?: string | null;
      selected_components?: string[];
      selected_inventory_lines?: Array<{
        inventory_id: string;
        name: string;
        quantity: number;
        scope: string;
        slot_timing: string | null;
        price_agreed: number | null;
      }>;
      selected_strategies?: string[];
      strategy?: string;
      custom_brief?: string;
    };

    const selectedComponents: string[] = body.selected_components ?? (body.strategy ? [body.strategy] : []);
    const selectedStrategies: string[] = body.selected_strategies ?? (body.strategy ? [body.strategy] : []);
    const inventoryLines = body.selected_inventory_lines ?? [];

    const sb = supabaseAdmin();

    // Load company
    const { data: company } = await sb.from("companies").select("*").eq("id", body.company_id).maybeSingle();
    if (!company) return NextResponse.json({ error: "Company not found" }, { status: 404 });

    // Load company intelligence + differentiators
    const co = company as Record<string, unknown>;
    const intel = (co.full_intelligence as Record<string, unknown> | null) ?? {};
    const differentiators = (intel.differentiators as Record<string, unknown> | null) ?? null;
    const competitors = (intel.competitors as Array<Record<string, unknown>> | null) ?? [];

    // Load campaign if provided
    const { data: campaign } = body.campaign_id
      ? await sb.from("campaigns").select("id, title, summary").eq("id", body.campaign_id).maybeSingle()
      : { data: null };

    // Build inventory package summary for the AI
    const packageLines = inventoryLines.length > 0
      ? inventoryLines.map(l => `- ${l.name} × ${l.quantity} (${l.scope}${l.slot_timing ? " / " + l.slot_timing : ""})${l.price_agreed ? " — R$" + l.price_agreed.toLocaleString("pt-BR") : ""}`)
      : [];
    const packageTotal = inventoryLines.reduce((s, l) => s + (l.price_agreed ?? 0) * l.quantity, 0);

    const inventoryContext = packageLines.length > 0
      ? `\n\nSPONSORSHIP PACKAGE SELECTED (use these exact items in the proposal):\n${packageLines.join("\n")}${packageTotal > 0 ? `\nPackage total: R$${packageTotal.toLocaleString("pt-BR")}` : ""}`
      : "";

    // Differentiator personalisation context
    let diffContext = "";
    if (differentiators) {
      const d = differentiators as Record<string, unknown>;
      const strengths = (d.brand_strengths as string[] | null) ?? [];
      const gaps = (d.competitor_gaps as string[] | null) ?? [];
      const angle = d.proposal_angle as string | null;
      const intro = d.personalised_proposal_intro as string | null;
      if (strengths.length || gaps.length || angle) {
        diffContext = `\n\nPERSONALISATION CONTEXT (use this to make the proposal specific to this brand):\n`;
        if (strengths.length) diffContext += `Brand strengths: ${strengths.slice(0, 3).join("; ")}\n`;
        if (gaps.length) diffContext += `Competitor gaps to exploit: ${gaps.slice(0, 3).join("; ")}\n`;
        if (angle) diffContext += `Key pitch angle: ${angle}\n`;
        if (intro) diffContext += `Personalised intro context: ${intro}\n`;
        if (competitors.length) diffContext += `Key competitors: ${competitors.slice(0, 4).map(c => c.name).join(", ")}\n`;
      }
    }

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

    const enhancedUser = user + componentContext + strategyContext + typeContext + briefContext + inventoryContext + diffContext;

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
      const { data: newCampaign } = await (sb as ReturnType<typeof import("@/lib/supabase/server")["supabaseAdmin"]>).from("campaigns").insert({
        title: `${company.company_name} × Coritiba FC — ${(body.proposal_type).replace(/_/g, " ")}`,
        summary: `Wizard-generated campaign for ${company.company_name}`,
        company_id: company.id,
        status: "draft" as never,
        strategy: strategyVariant ?? "awareness",
      } as never).select("id").single();
      campaignId = newCampaign?.id ?? null;
    }

    // Create proposal
    // match_id is only sent when set — omitting it keeps proposal creation working
    // even before migration 0042 (which adds the column) has been applied.
    const proposalRow: Record<string, unknown> = {
      title: (parsed.title as string) ?? `${company.company_name} × Coritiba FC — Proposal`,
      company_id: company.id,
      campaign_id: campaignId,
      status: "draft",
      content: parsed,
      proposal_type: body.proposal_type,
      selected_components: selectedComponents,
      selected_strategies: selectedStrategies,
      version: 1,
    };
    if (body.match_id) proposalRow.match_id = body.match_id;

    const { data: proposal, error } = await sb.from("proposals").insert(proposalRow as never).select("id").single();

    if (error) throw new Error(error.message);

    // Save individual inventory line items if selected
    if (inventoryLines.length > 0 && proposal?.id) {
      await (sb as any).from("proposal_inventory_items").insert(
        inventoryLines.map(l => ({
          proposal_id: proposal.id,
          inventory_id: l.inventory_id,
          quantity: l.quantity,
          scope: l.scope,
          slot_timing: l.slot_timing,
          price_agreed: l.price_agreed,
          currency: "BRL",
        }))
      );
    }

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

    void enqueueCrmSync({
      entity_type: "proposal",
      entity_id: proposal.id,
      operation: "create",
    }).catch(err => console.error("[CRM] wizard proposal sync failed", err));

    return NextResponse.json({ proposal_id: proposal.id });
  } catch (err) {
    console.error("[wizard/generate]", err);
    return NextResponse.json({ error: err instanceof Error ? err.message : "Generation failed" }, { status: 500 });
  }
}
