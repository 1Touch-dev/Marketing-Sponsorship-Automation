import { z } from "zod";

export const companyCreateSchema = z.object({
  company_name: z.string().min(2).max(200),
  industry: z.string().max(120).optional().nullable(),
  website: z.string().url().optional().or(z.literal("")).nullable(),
  country: z.string().max(40).optional().nullable().default("BR"),
  notes: z.string().max(4000).optional().nullable(),
  status: z.enum(["prospect", "active", "paused", "closed"]).default("prospect"),
});
export type CompanyCreateInput = z.infer<typeof companyCreateSchema>;

export const campaignGenerateSchema = z.object({
  company_id: z.string().uuid(),
  objective: z.string().max(500).optional(),
  max_ideas: z.number().int().min(1).max(10).optional(),
});

export const proposalGenerateSchema = z.object({
  campaign_id: z.string().uuid(),
});

export const proposalUpdateSchema = z.object({
  title: z.string().min(2).max(200).optional(),
  content: z
    .object({
      title: z.string().optional(),
      executive_summary: z.string().optional(),
      campaign_rationale: z.string().optional(),
      sponsorship_value: z.string().optional(),
      activation_plan: z.string().optional(),
      deliverables: z.array(z.string()).optional(),
      investment_note: z.string().optional(),
      cta: z.string().optional(),
    })
    .passthrough()
    .optional(),
  edit_reason: z.string().max(300).optional(),
});

export const approvalSchema = z.object({
  proposal_id: z.string().uuid(),
  decision: z.enum(["approve", "reject", "request_revision"]),
  comments: z.string().max(2000).optional(),
});

export const emailGenerateSchema = z.object({
  proposal_id: z.string().uuid(),
  recipient: z.string().email(),
  contact_name: z.string().max(120).optional(),
});

export const emailApproveSchema = z.object({
  email_id: z.string().uuid(),
});
