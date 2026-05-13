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
  summary: z.string().max(1000).optional().nullable(),
  activation: z.string().max(1000).optional().nullable(),
  partnership_angle: z.string().max(1000).optional().nullable(),
  cta: z.string().max(500).optional().nullable(),
});

export const campaignIdeasResponseSchema = z.object({
  ideas: z.array(campaignIdeaSchema).min(1),
});

export type CampaignIdeaResponse = z.infer<typeof campaignIdeasResponseSchema>;

// ---------------------------------------------------------------------------
// Proposal
// ---------------------------------------------------------------------------
export const proposalContentSchema = z.object({
  title: z.string().min(2).max(300),
  executive_summary: z.string().min(10).max(3000),
  campaign_rationale: z.string().min(10).max(3000),
  sponsorship_value: z.string().min(10).max(3000),
  activation_plan: z.string().min(10).max(3000),
  deliverables: z.array(z.string().min(2).max(500)).min(1).max(20),
  investment_note: z.string().min(5).max(1000),
  cta: z.string().min(5).max(500),
});

export type ProposalContentAI = z.infer<typeof proposalContentSchema>;

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
// ---------------------------------------------------------------------------
import { recordAudit } from "@/lib/audit/log";

export interface ValidationResult<T> {
  ok: boolean;
  data: T | null;
  error: string | null;
}

export function validateAiOutput<T>(
  schema: z.ZodType<T>,
  raw: unknown,
  context: { workflow: string; entity_type?: string; entity_id?: string },
): ValidationResult<T> {
  const result = schema.safeParse(raw);
  if (result.success) return { ok: true, data: result.data, error: null };

  const error = result.error.issues
    .map((i) => `${i.path.join(".")}: ${i.message}`)
    .join("; ");

  // Fire-and-forget audit log for every validation failure.
  void recordAudit({
    entity_type: context.entity_type ?? "ai_output",
    action: `ai.validation_failed:${context.workflow}`,
    metadata: { validation_error: error, raw_type: typeof raw },
  });

  return { ok: false, data: null, error };
}
