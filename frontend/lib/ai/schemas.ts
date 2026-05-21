/**
 * Zod schemas for validating AI (Bedrock / Claude) JSON outputs.
 *
 * Rule: NEVER trust raw LLM text. Always parse through these schemas.
 * On failure: coerce where safe, log only for unrecoverable failures.
 *
 * v3.1.0 — improved resilience:
 *  - Pricing: handles null tiers, array-wrapped response, missing fields
 *  - Intelligence: handles array-wrapped response, missing fields
 *  - Campaign activation: increased limits, truncation instead of failure
 *  - validateAiOutput: silent mode for minor issues, coercion-first approach
 *  - Partial success support in enhancement pipeline
 *
 * Design note: schemas use .passthrough() and .transform() for truncation.
 * Multi-structure unions use a normalizer function + single target schema
 * to avoid ZodEffects<ZodUnion<...>> TypeScript incompatibility issues.
 */
import { z } from "zod";

// ---------------------------------------------------------------------------
// Campaign ideas
// ---------------------------------------------------------------------------
export const campaignIdeaSchema = z.object({
  title: z.string().min(2).transform((s) => s.slice(0, 300)),
  summary: z.string().transform((s) => s.slice(0, 3000)).optional().nullable(),
  activation: z.string().transform((s) => s.slice(0, 3000)).optional().nullable(),
  partnership_angle: z.string().transform((s) => s.slice(0, 3000)).optional().nullable(),
  cta: z.string().transform((s) => s.slice(0, 1000)).optional().nullable(),
}).passthrough();

export const campaignIdeasResponseSchema = z.object({
  ideas: z.array(campaignIdeaSchema).min(1),
});

export type CampaignIdeaResponse = z.infer<typeof campaignIdeasResponseSchema>;

/** Normalize raw AI output to { ideas: [...] } before parsing */
export function normalizeCampaignIdeas(raw: unknown): unknown {
  if (!raw) return { ideas: [] };
  // Array at root: [{title: ..., ...}, ...]
  if (Array.isArray(raw)) return { ideas: raw };
  if (typeof raw !== "object") return { ideas: [] };
  const obj = raw as Record<string, unknown>;
  // Already correct
  if (Array.isArray(obj.ideas)) return raw;
  // Sometimes Claude returns { "campaign_ideas": [...] } or { "sponsorship_ideas": [...] }
  const alt = obj.campaign_ideas ?? obj.sponsorship_ideas ?? obj.campaigns ?? obj.results ?? obj.data;
  if (Array.isArray(alt)) return { ideas: alt };
  return raw;
}

// ---------------------------------------------------------------------------
// Proposal (base / legacy)
// ---------------------------------------------------------------------------
export const proposalContentSchema = z.object({
  title: z.string().min(2).transform((s) => s.slice(0, 300)),
  executive_summary: z.string().min(10).transform((s) => s.slice(0, 5000)),
  campaign_rationale: z.string().min(10).transform((s) => s.slice(0, 5000)),
  sponsorship_value: z.string().min(10).transform((s) => s.slice(0, 5000)),
  activation_plan: z.string().min(10).transform((s) => s.slice(0, 8000)),
  deliverables: z.array(z.string().min(2).transform((s) => s.slice(0, 800))).min(1).max(20),
  investment_note: z.string().min(5).transform((s) => s.slice(0, 3000)),
  cta: z.string().min(5).transform((s) => s.slice(0, 1000)),
}).passthrough();

export type ProposalContentAI = z.infer<typeof proposalContentSchema>;

// ---------------------------------------------------------------------------
// Strategy variants (Phase 2 / intelligence layer)
// ---------------------------------------------------------------------------
export const strategyVariantSchema = z.object({
  id: z.string().min(1).transform((s) => s.slice(0, 50)),
  label: z.string().min(2).transform((s) => s.slice(0, 100)),
  tagline: z.string().transform((s) => s.slice(0, 400)).optional().nullable(),
  description: z.string().min(10).transform((s) => s.slice(0, 3000)),
  key_activations: z.array(z.string().min(2).transform((s) => s.slice(0, 800))).min(1).max(8),
  audience_fit: z.string().transform((s) => s.slice(0, 1500)).optional().nullable(),
  estimated_reach: z.string().transform((s) => s.slice(0, 400)).optional().nullable(),
  differentiator: z.string().transform((s) => s.slice(0, 1000)).optional().nullable(),
}).passthrough();

export type StrategyVariant = z.infer<typeof strategyVariantSchema>;

export const strategyVariantsResponseSchema = z.object({
  variants: z.array(strategyVariantSchema).min(1).max(6),
});

/** Normalize raw AI output to { variants: [...] } before parsing */
export function normalizeStrategyVariants(raw: unknown): unknown {
  if (Array.isArray(raw)) return { variants: raw };
  return raw;
}

// ---------------------------------------------------------------------------
// Pricing tiers — highly resilient (common source of validation failures)
// ---------------------------------------------------------------------------
export const pricingTierSchema = z.object({
  tier: z.union([
    z.enum(["low", "mid", "high"]),
    z.string().transform((v): "low" | "mid" | "high" => {
      const m = v.toLowerCase();
      if (m.includes("low") || m.includes("básic") || m.includes("basic") || m.includes("bronze") || m.includes("starter")) return "low";
      if (m.includes("high") || m.includes("premium") || m.includes("gold") || m.includes("platinum") || m.includes("diamond")) return "high";
      return "mid";
    }),
  ]),
  label: z.string().min(2).transform((s) => s.slice(0, 120)),
  price_range: z.union([
    z.string().min(2).transform((s) => s.slice(0, 200)),
    z.number().transform((n) => `R$ ${n.toLocaleString("pt-BR")}`),
  ]),
  activations: z.array(z.string().min(2).transform((s) => s.slice(0, 800))).min(1).max(15),
  deliverables: z.array(z.string().min(2).transform((s) => s.slice(0, 800))).min(1).max(15),
  visibility: z.string().transform((s) => s.slice(0, 800)).optional().nullable(),
  digital_exposure: z.string().transform((s) => s.slice(0, 800)).optional().nullable(),
  stadium_exposure: z.string().transform((s) => s.slice(0, 800)).optional().nullable(),
  highlight: z.boolean().optional().default(false),
}).passthrough();

export type PricingTier = z.infer<typeof pricingTierSchema>;

export const pricingTiersResponseSchema = z.object({
  tiers: z.array(pricingTierSchema).min(1).max(3),
});

/** Normalize raw AI output to { tiers: [...] } before parsing */
export function normalizePricingTiers(raw: unknown): unknown {
  if (!raw || raw === null) return { tiers: [] };
  // Array at root: [{tier: "low", ...}, ...]
  if (Array.isArray(raw)) return { tiers: raw };
  if (typeof raw !== "object") return { tiers: [] };
  const obj = raw as Record<string, unknown>;
  // Already correct: { tiers: [...] }
  if (Array.isArray(obj.tiers)) return raw;
  // Object with tier keys: { low: {...}, mid: {...}, high: {...} }
  const byKey = ["low", "mid", "high"].map((k) => obj[k]).filter(Boolean);
  if (byKey.length > 0) return { tiers: byKey };
  return raw;
}

// ---------------------------------------------------------------------------
// Visual prompts (AI-generated image-gen prompts)
// ---------------------------------------------------------------------------
export const VISUAL_TYPES = ["jersey", "stadium_banner", "led_board", "social_media", "product_placement", "event_activation", "campaign_hero"] as const;
export type VisualType = typeof VISUAL_TYPES[number];

export const visualPromptSchema = z.object({
  id: z.string().min(1),
  label: z.string().min(2).transform((s) => s.slice(0, 100)),
  type: z.string().transform((v): VisualType => {
    const valid: string[] = ["jersey", "stadium_banner", "led_board", "social_media", "product_placement", "event_activation", "campaign_hero"];
    const lower = v.toLowerCase().replace(/\s+/g, "_");
    const match = valid.find((t) => lower.includes(t) || t.includes(lower));
    return (match as VisualType) ?? "campaign_hero";
  }),
  prompt: z.string().min(10).transform((s) => s.slice(0, 2000)),
  style_notes: z.string().transform((s) => s.slice(0, 800)).optional().nullable(),
  aspect_ratio: z.string().transform((s) => s.slice(0, 20)).optional().nullable(),
  placeholder_description: z.string().transform((s) => s.slice(0, 1000)).optional().nullable(),
}).passthrough();

export type VisualPrompt = z.infer<typeof visualPromptSchema>;

export const visualPromptsResponseSchema = z.object({
  visuals: z.array(visualPromptSchema).min(1).max(10),
});

/** Normalize raw AI output to { visuals: [...] } before parsing */
export function normalizeVisualPrompts(raw: unknown): unknown {
  if (Array.isArray(raw)) return { visuals: raw };
  return raw;
}

// ---------------------------------------------------------------------------
// Company intelligence — highly resilient (common source of failures)
// ---------------------------------------------------------------------------
export const companyIntelligenceBodySchema = z.object({
  marketing_goals: z.union([
    z.array(z.string().transform((s) => s.slice(0, 400))).min(1).max(8),
    z.string().transform((s) => [s.slice(0, 400)]),
  ]),
  brand_positioning: z.union([
    z.string(),
    z.array(z.string()).transform((a) => a.join(", ")),
  ]).transform((s) => String(s).slice(0, 3000)),
  audience_alignment: z.union([
    z.string(),
    z.array(z.string()).transform((a) => a.join(", ")),
  ]).transform((s) => String(s).slice(0, 3000)),
  loyalty_strategy: z.string().transform((s) => s.slice(0, 2000)).optional().nullable(),
  sponsorship_fit_score: z.union([
    z.number().min(0).max(10),
    z.string().transform((s) => {
      const n = parseFloat(s.replace(/[^\d.]/g, ""));
      return isNaN(n) ? 7 : Math.min(10, Math.max(0, n));
    }),
  ]),
  sponsorship_fit_rationale: z.union([
    z.string(),
    z.array(z.string()).transform((a) => a.join(". ")),
  ]).transform((s) => String(s).slice(0, 3000)),
  recommended_direction: z.union([
    z.string(),
    z.array(z.string()).transform((a) => a.join(". ")),
  ]).transform((s) => String(s).slice(0, 3000)),
  local_context: z.string().transform((s) => s.slice(0, 3000)).optional().nullable(),
  global_inspiration: z.string().transform((s) => s.slice(0, 3000)).optional().nullable(),
}).passthrough();

export type CompanyIntelligence = z.infer<typeof companyIntelligenceBodySchema>;

export const companyIntelligenceResponseSchema = z.object({
  intelligence: companyIntelligenceBodySchema,
});

/** Normalize raw AI output to { intelligence: {...} } before parsing */
export function normalizeCompanyIntelligence(raw: unknown): unknown {
  if (!raw) return { intelligence: null };
  // Array-wrapped: [{...}]
  if (Array.isArray(raw) && raw.length > 0) {
    return { intelligence: raw[0] };
  }
  if (typeof raw !== "object") return { intelligence: null };
  const obj = raw as Record<string, unknown>;
  // Already correct
  if (obj.intelligence && typeof obj.intelligence === "object") return raw;
  // Flat object with known fields — it IS the intelligence
  if (obj.marketing_goals || obj.brand_positioning || obj.recommended_direction) {
    return { intelligence: raw };
  }
  return raw;
}

// ---------------------------------------------------------------------------
// Execution brief (internal only — time, resources, cost per campaign strategy)
// ---------------------------------------------------------------------------
export const executionBriefItemSchema = z.object({
  strategy_id: z.string().min(1).transform((s) => s.slice(0, 50)),
  strategy_label: z.string().min(2).transform((s) => s.slice(0, 100)),
  estimated_duration: z.string().min(2).transform((s) => s.slice(0, 200)),
  estimated_cost_brl: z.union([
    z.string().min(1).transform((s) => s.slice(0, 200)),
    z.number().transform((n) => `R$ ${n.toLocaleString("pt-BR")}`),
  ]),
  resources_needed: z.array(z.string().min(2).transform((s) => s.slice(0, 400))).min(1).max(12),
  action_items: z.array(z.string().min(2).transform((s) => s.slice(0, 500))).min(1).max(15),
  complexity: z.enum(["low", "medium", "high"]).optional().default("medium"),
  key_risk: z.string().transform((s) => s.slice(0, 600)).optional().nullable(),
}).passthrough();

export const executionBriefSchema = z.object({
  briefs: z.array(executionBriefItemSchema).min(1).max(6),
  total_estimated_cost_brl: z.union([
    z.string().min(1).transform((s) => s.slice(0, 200)),
    z.number().transform((n) => `R$ ${n.toLocaleString("pt-BR")}`),
  ]).optional().nullable(),
  production_timeline_weeks: z.union([
    z.number(),
    z.string().transform((s) => parseInt(s.replace(/[^\d]/g, "")) || 8),
  ]).optional().nullable(),
}).passthrough();

export type ExecutionBrief = z.infer<typeof executionBriefSchema>;
export type ExecutionBriefItem = z.infer<typeof executionBriefItemSchema>;

export function normalizeExecutionBrief(raw: unknown): unknown {
  if (Array.isArray(raw)) return { briefs: raw };
  if (typeof raw === "object" && raw !== null) {
    const obj = raw as Record<string, unknown>;
    if (Array.isArray(obj.briefs)) return raw;
    // Flat brief for single strategy
    if (obj.strategy_id || obj.resources_needed || obj.action_items) return { briefs: [raw] };
  }
  return raw;
}

// ---------------------------------------------------------------------------
// Email (outreach + follow-up)
// ---------------------------------------------------------------------------
export const emailOutputSchema = z.object({
  subject: z.string().min(2).transform((s) => s.slice(0, 250)),
  body_text: z.string().min(10).transform((s) => s.slice(0, 12000)),
  body_html: z.string().optional().nullable(),
}).passthrough();

export type EmailOutput = z.infer<typeof emailOutputSchema>;

// ---------------------------------------------------------------------------
// Validation helper — parse with detailed error reporting.
// v3.1.0: silent=true suppresses audit log for minor/expected coercion failures
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
  context: {
    workflow?: string;
    workflow_name?: string;
    entity_type?: string;
    entity_id?: string;
    /** If true, validation failure does NOT produce an audit log entry */
    silent?: boolean;
  },
): ValidationResult<T> {
  const result = schema.safeParse(raw);
  if (result.success) {
    return { ok: true, data: result.data, error: null, errors: [] };
  }

  const errors = result.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`);
  const errorStr = errors.join("; ");
  const workflowName = context.workflow_name ?? context.workflow ?? "ai_output";

  // Only log audit entry for hard failures (not silent mode)
  if (!context.silent) {
    void recordAudit({
      entity_type: context.entity_type ?? workflowName,
      entity_id: context.entity_id ?? null,
      action: `ai.validation_failed:${workflowName}`,
      metadata: { validation_error: errorStr, raw_type: typeof raw },
    });
  }

  return { ok: false, data: null, error: errorStr, errors };
}
