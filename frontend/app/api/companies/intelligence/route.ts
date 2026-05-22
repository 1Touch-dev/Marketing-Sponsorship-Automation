import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";
import { invokeClaude } from "@/lib/bedrock/client";
import { recordAudit } from "@/lib/audit/log";

export const runtime = "nodejs";
export const maxDuration = 60;

const INTELLIGENCE_PROMPT = (name: string, industry: string | null, website: string | null, notes: string | null) => `You are a senior commercial sponsorship strategist for Coritiba FC, a top Brazilian football club based in Curitiba, Paraná, that plays at the Couto Pereira stadium.

Analyze the company "${name}" and generate deep commercial intelligence to guide sponsorship approach.

Company details:
- Name: ${name}
- Industry: ${industry || "Unknown"}
- Website: ${website || "Not provided"}
- Notes: ${notes || "None"}

Return raw JSON only (no markdown, no code fences, no prose). Include all fields:
{
  "products_services": "Brief description of main products/services",
  "marketing_goals": "Likely marketing goals and priorities",
  "brand_positioning": "How they position their brand in the market",
  "target_audience": "Their primary target audience/customer demographic",
  "audience_alignment": "How their audience aligns with Coritiba FC 1.5M+ social following and Curitiba 1.95M fanbase",
  "coritiba_fit_score": 8,
  "coritiba_fit_rationale": "Why this company fits Coritiba FC sponsorship",
  "recommended_direction": "Specific recommended sponsorship partnership direction for Coritiba FC",
  "competitors": [
    {"name": "Real Company Name", "reason": "Why they are a direct competitor", "estimated_spend": "R$X/year", "sponsorship_active": true, "website": "domain.com.br"}
  ],
  "local_context": "Specific Curitiba/Paraná regional market context",
  "global_inspiration": "Global campaign strategies from similar companies",
  "sponsorship_activation_ideas": "3-5 specific activation ideas leveraging Coritiba FC assets",
  "key_messages": "Key messages to use when pitching to this company",
  "best_contact_timing": "Best time to approach for sponsorship"
}

Rules:
- coritiba_fit_score must be a number 1-10
- competitors must be 4-6 real companies (no football clubs)
- All text fields must contain real intelligence, not placeholders
- Focus on Brazilian market, Curitiba region
- DO NOT mention competitor football clubs (Athletico Paranaense, etc.)`;

export async function POST(req: Request) {
  const { company_id, company_name, industry, website, notes } = await req.json().catch(() => ({}));

  if (!company_id || !company_name) {
    return NextResponse.json({ error: "company_id and company_name required" }, { status: 400 });
  }

  const sb = supabaseAdmin();

  try {
    const response = await invokeClaude({
      system: "You are a commercial intelligence analyst for Brazilian football club sponsorships. Always respond with valid JSON only. Never use markdown code blocks or code fences.",
      messages: [{ role: "user", content: INTELLIGENCE_PROMPT(company_name, industry, website, notes) }],
      maxTokens: 4096,
      json: true,
    });

    let intelligence: Record<string, unknown> = {};
    if (response.json) {
      if (Array.isArray(response.json)) {
        // Claude returned an array (likely competitors) — wrap it
        console.log("[intelligence] Claude returned array, wrapping as competitors");
        intelligence = { competitors: response.json };
      } else if (typeof response.json === "object" && response.json !== null) {
        intelligence = response.json as Record<string, unknown>;
      }
    }

    // If still empty, try manual parse
    if (Object.keys(intelligence).length === 0) {
      const rawText = (response.text ?? "").trim();
      console.log("[intelligence] manual parse needed, raw text first 150:", rawText.slice(0, 150));
      try {
        const stripped = rawText.replace(/^```(?:json)?\s*/i, "").replace(/\s*```\s*$/i, "").trim();
        try {
          const parsed = JSON.parse(stripped);
          if (Array.isArray(parsed)) {
            intelligence = { competitors: parsed };
          } else {
            intelligence = parsed;
          }
        } catch {
          const firstBrace = stripped.indexOf("{");
          const lastBrace = stripped.lastIndexOf("}");
          if (firstBrace !== -1 && lastBrace > firstBrace) {
            intelligence = JSON.parse(stripped.slice(firstBrace, lastBrace + 1));
          }
        }
        console.log("[intelligence] manual parse result keys:", Object.keys(intelligence).slice(0, 5));
      } catch (parseErr) {
        console.error("[intelligence] all parse attempts failed:", String(parseErr));
        return NextResponse.json({ error: "Failed to parse AI response" }, { status: 500 });
      }
    }

    // Normalize competitors — support both old string[] and new object[] formats
    let competitors: unknown[] = [];
    if (Array.isArray(intelligence.competitors)) {
      competitors = intelligence.competitors;
    } else if (Array.isArray(intelligence.competitor_brands)) {
      competitors = (intelligence.competitor_brands as string[]).map((name) => ({ name }));
    }

    // Save to DB — write to both columns for compatibility
    const { data, error } = await sb
      .from("companies")
      .update({
        full_intelligence: { ...intelligence, competitors },
        intelligence: { ...intelligence, competitors },
        intelligence_updated_at: new Date().toISOString(),
        competitors: competitors.map((c) => (typeof c === "string" ? c : (c as Record<string,string>).name)),
      })
      .eq("id", company_id)
      .select("*")
      .single();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    await recordAudit({
      entity_type: "company",
      entity_id: company_id,
      action: "company.intelligence_generated",
      metadata: { company_name, fit_score: intelligence.coritiba_fit_score ?? intelligence.sponsorship_fit_score },
    });

    return NextResponse.json({ intelligence: { ...intelligence, competitors }, company: data });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
