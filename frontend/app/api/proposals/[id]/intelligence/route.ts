import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";
import { invokeClaude } from "@/lib/bedrock/client";
import { companyIntelligencePrompt } from "@/lib/bedrock/prompts";
import { companyIntelligenceResponseSchema, normalizeCompanyIntelligence, validateAiOutput } from "@/lib/ai/schemas";
import { recordAudit } from "@/lib/audit/log";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * GET /api/proposals/[id]/intelligence
 * Returns the cached company intelligence for a proposal.
 *
 * POST /api/proposals/[id]/intelligence
 * (Re-)generates company intelligence analysis via Bedrock and caches it.
 */
export async function GET(_req: Request, ctx: { params: { id: string } }) {
  const sb = supabaseAdmin();
  const { data: proposal } = await sb
    .from("proposals")
    .select("id, intelligence, companies(company_name, industry, website, country, notes, intelligence)")
    .eq("id", ctx.params.id)
    .maybeSingle();

  if (!proposal) return NextResponse.json({ error: "Proposal not found" }, { status: 404 });

  type ProposalWithCompany = typeof proposal & {
    intelligence?: unknown;
    companies?: { company_name: string; industry?: string | null; website?: string | null; country?: string | null; notes?: string | null; intelligence?: unknown } | null;
  };
  const p = proposal as ProposalWithCompany;

  return NextResponse.json({
    proposal_id: p.id,
    intelligence: p.intelligence ?? p.companies?.intelligence ?? null,
    company_name: p.companies?.company_name ?? null,
  });
}

export async function POST(_req: Request, ctx: { params: { id: string } }) {
  const sb = supabaseAdmin();
  const { data: proposal } = await sb
    .from("proposals")
    .select("id, companies(id, company_name, industry, website, country, notes)")
    .eq("id", ctx.params.id)
    .maybeSingle();

  if (!proposal) return NextResponse.json({ error: "Proposal not found" }, { status: 404 });

  type ProposalWithCompany = typeof proposal & {
    companies?: { id: string; company_name: string; industry?: string | null; website?: string | null; country?: string | null; notes?: string | null } | null;
  };
  const p = proposal as ProposalWithCompany;
  const company = p.companies;
  if (!company) return NextResponse.json({ error: "Company not found" }, { status: 400 });

  let intelligence: Record<string, unknown> | null = null;
  try {
    const pt = companyIntelligencePrompt({
      company: {
        company_name: company.company_name,
        industry: company.industry,
        website: company.website,
        country: company.country ?? "BR",
        notes: company.notes,
      },
    });
    const result = await invokeClaude<unknown>({
      system: pt.system,
      messages: [{ role: "user", content: pt.user }],
      json: true,
      maxTokens: 1500,
    });
    const vr = validateAiOutput(companyIntelligenceResponseSchema, normalizeCompanyIntelligence(result.json), {
      workflow_name: "intelligence.generate",
      entity_id: proposal.id,
      silent: true,
    });
    if (vr.ok && vr.data) intelligence = vr.data.intelligence as unknown as Record<string, unknown>;
    else throw new Error(vr.error ?? "Validation failed");
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "generation failed" }, { status: 502 });
  }

  if (!intelligence) {
    return NextResponse.json({ error: "Intelligence generation failed — AI output did not match schema" }, { status: 502 });
  }

  // Save on proposal row (0007 column — graceful if not applied yet)
  await sb.from("proposals").update({ intelligence } as Record<string, unknown>).eq("id", proposal.id);
  await sb.from("companies").update({ intelligence } as Record<string, unknown>).eq("id", company.id);

  await recordAudit({
    entity_type: "proposal",
    entity_id: proposal.id,
    action: "proposal.intelligence_generated",
    metadata: { company: company.company_name, score: (intelligence as Record<string, unknown>)?.sponsorship_fit_score },
  });

  return NextResponse.json({ proposal_id: proposal.id, intelligence });
}
