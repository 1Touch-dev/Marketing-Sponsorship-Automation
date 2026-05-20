import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";
import { invokeClaude, extractJson } from "@/lib/bedrock/client";

export const maxDuration = 90;

/**
 * POST /api/companies/[id]/differentiators
 * Compare a company against its competitors, identify differentiators,
 * and generate personalised campaign angles.
 */
export async function POST(req: Request, ctx: { params: { id: string } }) {
  const companyId = ctx.params.id;

  try {
    const sb = supabaseAdmin();

    const { data: company } = await sb
      .from("companies")
      .select("*")
      .eq("id", companyId)
      .maybeSingle();

    if (!company) return NextResponse.json({ error: "Company not found" }, { status: 404 });

    const co = company as Record<string, unknown>;
    const intelligence = (co.full_intelligence as Record<string, unknown>) ?? {};
    const competitors: Array<Record<string, unknown>> = (
      Array.isArray(intelligence.competitors)
        ? intelligence.competitors
        : Array.isArray(co.competitors)
          ? (co.competitors as string[]).map(n => ({ name: n }))
          : []
    );

    const prompt = `You are a senior sponsorship strategist for Coritiba FC, a Brazilian football club.

COMPANY BEING ANALYSED:
Name: ${co.company_name}
Industry: ${co.industry ?? "Unknown"}
Type: ${co.business_type ?? "B2C"}
Size: ${co.company_size ?? "medium"}
Segment: ${co.segment ?? "local"}
Notes: ${co.notes ?? "none"}

KNOWN COMPETITORS:
${competitors.slice(0, 8).map((c, i) => `${i+1}. ${c.name ?? "Unknown"} — ${c.reason ?? "direct competitor"}`).join("\n") || "No competitors found yet"}

TASK:
Perform a deep differentiator analysis and produce a JSON object with:
{
  "brand_strengths": ["What makes this company stand out from competitors"],
  "competitor_gaps": ["Weaknesses competitors have that this company does NOT have"],
  "unique_angles": ["Unique things about this brand that can be used in sponsorship pitch"],
  "campaign_themes": [
    {
      "theme": "theme name",
      "description": "brief description",
      "why_it_fits": "why this theme aligns with their brand vs competitors",
      "call_to_action": "suggested cta for proposal"
    }
  ],
  "personalised_proposal_intro": "Opening paragraph personalized for this brand — reference their specific differentiators, why Coritiba FC is the RIGHT partner for THEM specifically",
  "personalised_outreach_email": "Short 150-word cold outreach email personalised to decision maker using differentiators as hooks",
  "sponsorship_fit": {
    "score": 8.5,
    "reasoning": "why they are a good fit",
    "best_format": "jerseys|led_boards|digital|hospitality|barter|hybrid",
    "ideal_package": "describe the ideal package for this specific company"
  },
  "competitive_advantage_summary": "2-sentence summary of how partnering with Coritiba FC differentiates them FROM their competitors"
}

Rules:
- Be SPECIFIC — mention real brand attributes, not generic statements
- Never mention rival football clubs
- Focus on Brazilian market context
- Reference Coritiba FC's Paraná/Curitiba audience as a strategic asset`;

    const result = await invokeClaude({
      messages: [{ role: "user", content: prompt }],
      maxTokens: 3500,
      temperature: 0.4,
    });

    const parsed = extractJson(result.text) as Record<string, unknown> | null;
    if (!parsed) throw new Error("AI returned invalid response");

    // Persist to full_intelligence
    const updatedIntelligence = {
      ...intelligence,
      differentiators: parsed,
      differentiators_updated_at: new Date().toISOString(),
    };

    await sb.from("companies")
      .update({ full_intelligence: updatedIntelligence } as unknown as Record<string, unknown>)
      .eq("id", companyId);

    return NextResponse.json({ success: true, differentiators: parsed });
  } catch (err) {
    console.error("[differentiators]", err);
    return NextResponse.json({ error: err instanceof Error ? err.message : "Analysis failed" }, { status: 500 });
  }
}

/**
 * GET /api/companies/[id]/differentiators — return cached differentiators
 */
export async function GET(_req: Request, ctx: { params: { id: string } }) {
  const sb = supabaseAdmin();
  const { data: company } = await sb
    .from("companies")
    .select("full_intelligence")
    .eq("id", ctx.params.id)
    .maybeSingle();

  const intel = (company as Record<string, unknown> | null)?.full_intelligence as Record<string, unknown> | null;
  const diffs = intel?.differentiators ?? null;

  return NextResponse.json({ differentiators: diffs });
}
