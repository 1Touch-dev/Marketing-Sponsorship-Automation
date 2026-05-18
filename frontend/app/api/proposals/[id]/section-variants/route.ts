import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";
import { invokeClaude, extractJson } from "@/lib/bedrock/client";

export const maxDuration = 60;

const SECTION_PROMPTS: Record<string, { instruction: string; wordTarget: number }> = {
  executive_summary: {
    instruction: "Write a powerful, compelling executive summary opening for this Coritiba FC sponsorship proposal. Lead with impact — the business opportunity, the cultural fit, and the unique value of partnering with Coritiba FC at Couto Pereira.",
    wordTarget: 120,
  },
  campaign_rationale: {
    instruction: "Write a persuasive campaign rationale explaining WHY this specific sponsorship at Coritiba FC makes strong business sense for this company. Reference the Curitiba/Paraná market, Coritiba FC's fan base, and the strategic alignment.",
    wordTarget: 150,
  },
  sponsorship_value: {
    instruction: "Write a concrete, specific description of the value this sponsor will receive from the Coritiba FC partnership. Be specific about brand exposure, audience reach, Couto Pereira presence, and community connection.",
    wordTarget: 120,
  },
  activation_plan: {
    instruction: "Write a detailed phased activation plan for this sponsorship at Coritiba FC. Include specific phases (pre-season, matchday, digital), touchpoints at Couto Pereira, and measurable activation moments.",
    wordTarget: 200,
  },
  investment_note: {
    instruction: "Write a high-level, aspirational investment overview framing the financial commitment as a strategic business investment in Coritiba FC and the Paraná market. Keep it positive and forward-looking.",
    wordTarget: 80,
  },
  cta: {
    instruction: "Write a single, compelling call-to-action that invites the company to take the next step toward a Coritiba FC partnership. Make it warm, direct, and action-oriented.",
    wordTarget: 40,
  },
};

const STYLE_VARIANTS = [
  "professional and data-driven — emphasise ROI, audience metrics, brand visibility numbers",
  "emotional and storytelling — focus on club heritage, fan passion, Verde e Branco identity, community pride",
  "concise and executive — tight, punchy prose aimed at a CEO or CMO, no fluff",
];

export async function POST(
  req: Request,
  { params }: { params: { id: string } }
) {
  try {
    const { section, company_name, industry, campaign_title, current_text } = await req.json() as {
      section: string;
      company_name?: string;
      industry?: string;
      campaign_title?: string;
      current_text?: string;
    };

    const sectionDef = SECTION_PROMPTS[section];
    if (!sectionDef) {
      return NextResponse.json({ error: "Unknown section" }, { status: 400 });
    }

    // Verify proposal exists
    const sb = supabaseAdmin();
    const { data: proposal } = await sb
      .from("proposals")
      .select("id, title")
      .eq("id", params.id)
      .maybeSingle();

    if (!proposal) return NextResponse.json({ error: "Proposal not found" }, { status: 404 });

    // Generate 3 variants in parallel
    const variantPromises = STYLE_VARIANTS.map(async (style, i) => {
      const label = String.fromCharCode(65 + i); // A, B, C
      const system = [
        "You are a senior B2B sponsorship proposal writer for Coritiba Foot Ball Club (Coxa / Coxa-Branca).",
        "ALL content MUST reference Coritiba FC specifically. NEVER mention Athletico Paranaense, Corinthians, Flamengo, or any other club.",
        "The club plays at Couto Pereira stadium in Curitiba, Paraná, Brazil.",
        "Coritiba FC's identity: Verde e Branco (green and white), traditional, community-driven, Paraná's most traditional club.",
        `Writing style for this variant: ${style}`,
        "Output MUST be a JSON object with a single key: { \"text\": \"your content here\" }",
        "No markdown, no fences, no explanation — just the JSON object.",
      ].join("\n");

      const user = [
        `Sponsor: ${company_name ?? "the sponsor company"}`,
        industry ? `Industry: ${industry}` : null,
        campaign_title ? `Campaign: ${campaign_title}` : null,
        current_text ? `Existing text to riff on (do NOT copy — write a fresh variant): ${current_text.slice(0, 300)}` : null,
        "",
        `Section to write: ${section.replace(/_/g, " ").toUpperCase()}`,
        `Task: ${sectionDef.instruction}`,
        `Target length: ~${sectionDef.wordTarget} words`,
      ].filter(Boolean).join("\n");

      const result = await invokeClaude({
        messages: [{ role: "user", content: user }],
        system,
        maxTokens: 600,
        temperature: 0.8 - i * 0.15, // A=0.8 creative, B=0.65, C=0.5 structured
      });

      const parsed = extractJson(result.text);
      const text = (parsed as Record<string, unknown>)?.text;
      if (typeof text !== "string" || text.length < 20) {
        // Fallback: use raw text if JSON parsing fails
        return { label, style: style.split(" — ")[0], text: result.text.slice(0, 800) };
      }
      return { label, style: style.split(" — ")[0], text };
    });

    const variants = await Promise.all(variantPromises);

    return NextResponse.json({ variants });
  } catch (err) {
    console.error("[section-variants]", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Generation failed" },
      { status: 500 }
    );
  }
}
