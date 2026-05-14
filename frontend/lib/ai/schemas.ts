/**
 * Zod schemas for validating AI (Bedrock / Claude) JSON outputs.
 *
 * Rule: NEVER trust raw LLM text. Always parse through these schemas.
 * On failure: log, optionally retry, return structured error.
 */
import { z } from "zod";

// ---------------------------------------------------------------------------
// Campaign ideas
// ---------------------------------------------------------------------------
export const campaignIdeaSchema = z.object({
  title: z.string().min(2).max(300),
  summary: z.string().max(2000).optional().nullable(),
  activation: z.string().max(2000).optional().nullable(),
  partnership_angle: z.string().max(2000).optional().nullable(),
  cta: z.string().max(800).optional().nullable(),
});

export const campaignIdeasResponseSchema = z.object({
  ideas: z.array(campaignIdeaSchema).min(1),
});

export type CampaignIdeaResponse = z.infer<typeof campaignIdeasResponseSchema>;

// ---------------------------------------------------------------------------
// Proposal (base / legacy)
// ---------------------------------------------------------------------------
export const proposalContentSchema = z.object({
  title: z.string().min(2).max(300),
  executive_summary: z.string().min(10).max(5000),
  campaign_rationale: z.string().min(10).max(5000),
  sponsorship_value: z.string().min(10).max(5000),
  activation_plan: z.string().min(10).max(6000),
  deliverables: z.array(z.string().min(2).max(800)).min(1).max(20),
  investment_note: z.string().min(5).max(2000),
  cta: z.string().min(5).max(800),
});

export type ProposalContentAI = z.infer<typeof proposalContentSchema>;

// ---------------------------------------------------------------------------
// Strategy variants (Phase 2 / intelligence layer)
// ---------------------------------------------------------------------------
export const strategyVariantSchema = z.object({
  id: z.string().min(1),
  label: z.string().min(2).max(100),
  tagline: z.string().max(400).optional().nullable(),
  description: z.string().min(10).max(2000),
  key_activations: z.array(z.string().min(2).max(600)).min(1).max(8),
  audience_fit: z.string().max(1000).optional().nullable(),
  estimated_reach: z.string().max(400).optional().nullable(),
  differentiator: z.string().max(800).optional().nullable(),
});

export type StrategyVariant = z.infer<typeof strategyVariantSchema>;

export const strategyVariantsResponseSchema = z.object({
  variants: z.array(strategyVariantSchema).min(1).max(6),
});

// ---------------------------------------------------------------------------
// Pricing tiers
// ---------------------------------------------------------------------------
export const pricingTierSchema = z.object({
  tier: z.enum(["low", "mid", "high"]),
  label: z.string().min(2).max(80),
  price_range: z.string().min(2).max(200),
  activations: z.array(z.string().min(2).max(600)).min(1).max(10),
  deliverables: z.array(z.string().min(2).max(600)).min(1).max(10),
  visibility: z.string().max(600).optional().nullable(),
  digital_exposure: z.string().max(600).optional().nullable(),
  stadium_exposure: z.string().max(600).optional().nullable(),
  highlight: z.boolean().optional(),
});

export type PricingTier = z.infer<typeof pricingTierSchema>;

export const pricingTiersResponseSchema = z.object({
  tiers: z.array(pricingTierSchema).min(1).max(3),
});

// ---------------------------------------------------------------------------
// Visual prompts (AI-generated image-gen prompts)
// ---------------------------------------------------------------------------
export const VISUAL_TYPES = ["jersey", "stadium_banner", "led_board", "social_media", "product_placement", "event_activation", "campaign_hero"] as const;
export type VisualType = typeof VISUAL_TYPES[number];

export const visualPromptSchema = z.object({
  id: z.string().min(1),
  label: z.string().min(2).max(100),
  type: z.enum(VISUAL_TYPES),
  prompt: z.string().min(20).max(1500),
  style_notes: z.string().max(600).optional().nullable(),
  aspect_ratio: z.string().max(20).optional().nullable(),
  placeholder_description: z.string().max(800).optional().nullable(),
});

export type VisualPrompt = z.infer<typeof visualPromptSchema>;

export const visualPromptsResponseSchema = z.object({
  visuals: z.array(
    // Pre-normalize unknown visual types before strict enum validation
    z.object({
      id: z.string().min(1),
      label: z.string().min(2).max(100),
      type: z.string().transform((v): VisualType => {
        const valid: string[] = ["jersey", "stadium_banner", "led_board", "social_media", "product_placement", "event_activation", "campaign_hero"];
        return valid.includes(v) ? (v as VisualType) : "campaign_hero";
      }).pipe(z.enum(VISUAL_TYPES)),
      prompt: z.string().min(20).max(1500),
      style_notes: z.string().max(600).optional().nullable(),
      aspect_ratio: z.string().max(20).optional().nullable(),
      placeholder_description: z.string().max(800).optional().nullable(),
    })
  ).min(1).max(8),
});

// ---------------------------------------------------------------------------
// Company intelligence
// ---------------------------------------------------------------------------
export const companyIntelligenceSchema = z.object({
  marketing_goals: z.array(z.string().max(400)).min(1).max(5),
  brand_positioning: z.string().min(10).max(2000),
  audience_alignment: z.string().min(10).max(2000),
  loyalty_strategy: z.string().max(1500).optional().nullable(),
  sponsorship_fit_score: z.number().min(1).max(10),
  sponsorship_fit_rationale: z.string().min(10).max(2000),
  recommended_direction: z.string().min(10).max(2000),
  local_context: z.string().max(2000).optional().nullable(),
  global_inspiration: z.string().max(2000).optional().nullable(),
});

export type CompanyIntelligence = z.infer<typeof companyIntelligenceSchema>;

export const companyIntelligenceResponseSchema = z.object({
  intelligence: companyIntelligenceSchema,
});

// ---------------------------------------------------------------------------
// Email (outreach + follow-up)
// ---------------------------------------------------------------------------
export const emailOutputSchema = z.object({
  subject: z.string().min(2).max(250),
  body_text: z.string().min(10).max(10000),
  body_html: z.string().optional().nullable(),
});

export type EmailOutput = z.infer<typeof emailOutputSchema>;

// ---------------------------------------------------------------------------
// Validation helper — parse with detailed error reporting.
// Keeps backward-compatible synchronous interface used by campaign/email routes.
// ---------------------------------------------------------------------------
import { recordAudit } from "@/lib/audit/log";

export interface ValidationResult<T> {
  ok: boolean;
  data: T | null;
  /** Flat error string for backward compatibility */
  error: string | null;
  errors: string[];
}

export function validateAiOutput<T>(
  schema: z.ZodType<T>,
  raw: unknown,
  context: { workflow?: string; workflow_name?: string; entity_type?: string; entity_id?: string },
): ValidationResult<T> {
  const result = schema.safeParse(raw);
  if (result.success) {
    return { ok: true, data: result.data, error: null, errors: [] };
  }

  const errors = result.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`);
  const errorStr = errors.join("; ");
  const workflowName = context.workflow_name ?? context.workflow ?? "ai_output";

  void recordAudit({
    entity_type: context.entity_type ?? workflowName,
    entity_id: context.entity_id ?? null,
    action: `ai.validation_failed:${workflowName}`,
    metadata: { validation_error: errorStr, raw_type: typeof raw },
  });

  return { ok: false, data: null, error: errorStr, errors };
}
