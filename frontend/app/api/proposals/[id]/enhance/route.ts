import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";
import { invokeClaude } from "@/lib/bedrock/client";
import {
  strategyVariantsPrompt,
  pricingTiersPrompt,
  visualPromptsPrompt,
  companyIntelligencePrompt,
} from "@/lib/bedrock/prompts";
import {
  strategyVariantsResponseSchema,
  pricingTiersResponseSchema,
  visualPromptsResponseSchema,
  companyIntelligenceResponseSchema,
  validateAiOutput,
  type VisualPrompt,
} from "@/lib/ai/schemas";
import { recordAudit } from "@/lib/audit/log";
import { startWorkflow, completeWorkflow, failWorkflow } from "@/lib/workflow-events";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 180;

/**
 * POST /api/proposals/[id]/enhance
 *
 * Enriches an existing proposal with:
 *  - strategy_variants (3 strategic directions)
 *  - pricing_tiers (Low / Mid / High)
 *  - visual_prompts (5 mockup prompt cards)
 *  - intelligence (company fit analysis)
 *
 * Called after the main /generate endpoint, either:
 *  - automatically from the UI after proposal creation
 *  - manually via a "Enhance with AI" button
 *
 * Body: { layers?: ("variants" | "pricing" | "visuals" | "intelligence")[] }
 * Defaults to generating all 4 layers.
 */
export async function POST(req: Request, ctx: { params: { id: string } }) {
  const sb = supabaseAdmin();
  const body = await req.json().catch(() => ({}));
  const layers: string[] = body.layers ?? ["variants", "pricing", "visuals", "intelligence"];

  const { data: proposal } = await sb
    .from("proposals")
    .select("*, companies(*), campaigns(title, summary, activation)")
    .eq("id", ctx.params.id)
    .maybeSingle();

  if (!proposal) return NextResponse.json({ error: "Proposal not found" }, { status: 404 });

  type EnrichedProposal = typeof proposal & {
    companies: { company_name: string; industry?: string | null; website?: string | null; country?: string | null; notes?: string | null } | null;
    campaigns: { title: string; summary?: string | null; activation?: string | null } | null;
  };
  const p = proposal as EnrichedProposal;
  const company = p.companies;
  if (!company) return NextResponse.json({ error: "Company not found" }, { status: 400 });

  const companyCtx = {
    company_name: company.company_name,
    industry: company.industry,
    website: company.website,
    country: company.country ?? "BR",
    notes: company.notes,
  };

  const campaignCtx = {
    title: p.campaigns?.title ?? proposal.title,
    summary: p.campaigns?.summary ?? null,
    activation: p.campaigns?.activation ?? null,
  };

  const eventId = await startWorkflow({
    workflow_name: "proposal.enhance",
    entity_type: "proposal",
    entity_id: proposal.id,
    metadata: { company: company.company_name, layers },
  });

  const results: Record<string, unknown> = {};

  // Run all layers in parallel for speed
  // Add a small stagger to avoid Bedrock throttling on simultaneous requests
  const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
  const tasks: Promise<void>[] = [];

  if (layers.includes("variants")) {
    tasks.push(delay(0).then(async () => {
      try {
        const pt = strategyVariantsPrompt({ company: companyCtx, campaign: campaignCtx });
        const r = await invokeClaude<unknown>({ system: pt.system, messages: [{ role: "user", content: pt.user }], json: true, maxTokens: 2500 });
        const vr = validateAiOutput(strategyVariantsResponseSchema, r.json, { workflow_name: "proposal.enhance.variants" });
        results.variants = vr.ok && vr.data ? vr.data.variants : null;
      } catch (err) { results.variants_error = err instanceof Error ? err.message : String(err); }
    }));
  }

  if (layers.includes("pricing")) {
    tasks.push(delay(1000).then(async () => {
      try {
        const pt = pricingTiersPrompt({ company: companyCtx, campaign: campaignCtx });
        const r = await invokeClaude<unknown>({ system: pt.system, messages: [{ role: "user", content: pt.user }], json: true, maxTokens: 2000 });
        const vr = validateAiOutput(pricingTiersResponseSchema, r.json, { workflow_name: "proposal.enhance.pricing" });
        results.pricing = vr.ok && vr.data ? vr.data.tiers : null;
      } catch (err) { results.pricing_error = err instanceof Error ? err.message : String(err); }
    }));
  }

  if (layers.includes("visuals")) {
    tasks.push(delay(2000).then(async () => {
      try {
        const pt = visualPromptsPrompt({ company: companyCtx, campaign: campaignCtx });
        const r = await invokeClaude<unknown>({ system: pt.system, messages: [{ role: "user", content: pt.user }], json: true, maxTokens: 2000 });
        const vr = validateAiOutput(visualPromptsResponseSchema, r.json, { workflow_name: "proposal.enhance.visuals" });
        results.visuals = vr.ok && vr.data ? (vr.data.visuals as unknown as VisualPrompt[]) : null;
      } catch (err) { results.visuals_error = err instanceof Error ? err.message : String(err); }
    }));
  }

  if (layers.includes("intelligence")) {
    tasks.push(delay(3000).then(async () => {
      try {
        const pt = companyIntelligencePrompt({ company: companyCtx });
        const r = await invokeClaude<unknown>({ system: pt.system, messages: [{ role: "user", content: pt.user }], json: true, maxTokens: 1500 });
        const vr = validateAiOutput(companyIntelligenceResponseSchema, r.json, { workflow_name: "proposal.enhance.intelligence" });
        results.intelligence = vr.ok && vr.data ? vr.data.intelligence : null;
      } catch (err) { results.intelligence_error = err instanceof Error ? err.message : String(err); }
    }));
  }

  await Promise.allSettled(tasks);

  // Build update payload (only set columns that have new data)
  const updatePayload: Record<string, unknown> = {};
  if (results.variants != null) updatePayload.strategy_variants = results.variants;
  if (results.pricing != null) updatePayload.pricing_tiers = results.pricing;
  if (results.visuals != null) updatePayload.visual_prompts = results.visuals;
  if (results.intelligence != null) {
    updatePayload.intelligence = results.intelligence;
    // Also cache on company
    await sb.from("companies").update({ intelligence: results.intelligence }).eq("id", (proposal as { company_id: string }).company_id);
  }

  if (Object.keys(updatePayload).length > 0) {
    await sb.from("proposals").update(updatePayload).eq("id", proposal.id);
  }

  if (eventId) {
    await completeWorkflow(eventId, {
      layers_requested: layers,
      layers_completed: Object.keys(results).filter(k => !k.endsWith("_error")),
      layers_failed: Object.keys(results).filter(k => k.endsWith("_error")),
    });
  }

  await recordAudit({
    entity_type: "proposal",
    entity_id: proposal.id,
    action: "proposal.enhanced",
    metadata: {
      company: company.company_name,
      layers_completed: Object.keys(results).filter(k => !k.endsWith("_error")),
    },
  });

  // Return full updated proposal
  const { data: updated } = await sb.from("proposals").select("*").eq("id", proposal.id).single();
  return NextResponse.json({ data: updated, enhancement_results: results });
}
