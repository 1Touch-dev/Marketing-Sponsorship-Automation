import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";
import { invokeClaude } from "@/lib/bedrock/client";
import { recordAudit } from "@/lib/audit/log";

export const runtime = "nodejs";
export const maxDuration = 60;

const INTELLIGENCE_PROMPT = (name: string, industry: string | null, website: string | null, notes: string | null) => `
You are a senior commercial sponsorship strategist for Coritiba FC, a top Brazilian football club based in Curitiba, Paraná, that plays at the Couto Pereira stadium.

Analyze the company "${name}" and generate deep commercial intelligence to guide sponsorship approach.

Company details:
- Name: ${name}
- Industry: ${industry || "Unknown"}
- Website: ${website || "Not provided"}
- Notes: ${notes || "None"}

Return ONLY valid JSON with this structure:
{
  "products_services": "Brief description of main products/services",
  "marketing_goals": "Likely marketing goals and priorities for this type of business",
  "brand_positioning": "How they likely position their brand in the market",
  "target_audience": "Their primary target audience/customer demographic",
  "audience_alignment": "How their audience aligns with Coritiba FC's 1.5M+ social following and Curitiba's 1.95M population fanbase",
  "sponsorship_fit_score": "Score 1-10 for Coritiba FC sponsorship fit with brief reason",
  "recommended_direction": "Specific recommended sponsorship partnership direction for Coritiba FC and Couto Pereira",
  "competitor_brands": ["array", "of", "likely", "competitor", "companies"],
  "local_context": "Specific Curitiba/Paraná regional market context relevant to this company",
  "global_inspiration": "Global campaign strategies from similar companies that could inspire Coritiba sponsorship approach",
  "sponsorship_activation_ideas": "3-5 specific activation ideas leveraging Coritiba FC assets (LED boards, jerseys, social, stadium)"
}

Focus on:
- Coritiba FC (Coxa) sponsorship opportunities at Couto Pereira
- Curitiba market relevance
- Brazilian football culture fit
- DO NOT mention competitor clubs (Athletico Paranaense, Corinthians, São Paulo FC, etc.)
`;

export async function POST(req: Request) {
  const { company_id, company_name, industry, website, notes } = await req.json().catch(() => ({}));

  if (!company_id || !company_name) {
    return NextResponse.json({ error: "company_id and company_name required" }, { status: 400 });
  }

  const sb = supabaseAdmin();

  try {
    const response = await invokeClaude({
      system: "You are a commercial intelligence analyst specializing in Brazilian football club sponsorships. Return only valid JSON, no prose.",
      messages: [{ role: "user", content: INTELLIGENCE_PROMPT(company_name, industry, website, notes) }],
    });

    let intelligence: Record<string, unknown> = {};
    try {
      const text = response.text ?? "";
      const jsonMatch = text.match(/\{[\s\S]+\}/);
      if (jsonMatch) {
        intelligence = JSON.parse(jsonMatch[0]);
      }
    } catch {
      return NextResponse.json({ error: "Failed to parse AI response" }, { status: 500 });
    }

    // Save to DB
    const { data, error } = await sb
      .from("companies")
      .update({
        full_intelligence: intelligence,
        intelligence_updated_at: new Date().toISOString(),
        competitors: Array.isArray(intelligence.competitor_brands) ? intelligence.competitor_brands : [],
      })
      .eq("id", company_id)
      .select("*")
      .single();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    await recordAudit({
      entity_type: "company",
      entity_id: company_id,
      action: "company.intelligence_generated",
      metadata: { company_name, fit_score: intelligence.sponsorship_fit_score },
    });

    return NextResponse.json({ intelligence, company: data });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
