import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";
import { invokeClaude, extractJson } from "@/lib/bedrock/client";
import { requirePermission } from "@/lib/auth/server-permission";

export const maxDuration = 60;

/**
 * POST /api/inventory/suggest
 * Given a company profile, suggest the best inventory items and proposal type.
 */
export async function POST(req: Request) {
  const auth = await requirePermission("create_proposal");
  if ("error" in auth) return auth.error;

  try {
    const body = await req.json() as {
      company_id?: string;
      company_name?: string;
      industry?: string;
      business_type?: string;
      company_size?: string;
      segment?: string;
      notes?: string;
      full_intelligence?: Record<string, unknown>;
    };

    if (!body.company_id && !body.company_name) {
      return NextResponse.json({ error: "company_id or company_name required" }, { status: 400 });
    }

    const sb = supabaseAdmin();

    // Load company from DB if only ID given
    let company = body;
    if (body.company_id && !body.company_name) {
      const { data } = await sb.from("companies").select("*").eq("id", body.company_id).maybeSingle();
      if (!data) return NextResponse.json({ error: "Company not found" }, { status: 404 });
      company = data as typeof body;
    }

    // Get all available active inventory items
    const { data: inventoryItems } = await sb
      .from("inventory_items" as "companies")
      .select("id, name, inventory_type, category, price_min, price_max, description, placement_zone, exposure_reach")
      .eq("status", "active")
      .limit(50) as { data: Array<Record<string, unknown>> | null };

    const items = (inventoryItems ?? []) as Array<Record<string, unknown>>;

    // Build AI prompt
    const inventoryList = items.map((item, i) =>
      `${i + 1}. [${String(item.id).slice(0, 8)}] ${item.name} (${item.inventory_type}) — R$${item.price_min}–${item.price_max} — ${item.description ?? ""}`
    ).join("\n");

    const companyProfile = `
Company: ${company.company_name}
Industry: ${company.industry ?? "Unknown"}
Business type: ${company.business_type ?? "B2C"}
Size: ${company.company_size ?? "medium"}
Geographic reach: ${company.segment ?? "local"}
Notes: ${company.notes ?? "None"}
Existing intelligence: ${company.full_intelligence ? JSON.stringify(company.full_intelligence).slice(0, 500) : "None"}
`.trim();

    const prompt = `You are a commercial sponsorship advisor for Coritiba FC (Brazilian football club, Curitiba/Paraná).

Your task: Given a company profile, recommend the BEST sponsorship inventory items and proposal approach.

COMPANY PROFILE:
${companyProfile}

AVAILABLE INVENTORY (choose from these):
${inventoryList}

Respond with a JSON object:
{
  "proposal_type": "sponsorship" | "barter" | "lei_de_incentivo" | "hybrid",
  "proposal_type_reason": "brief explanation why this type fits",
  "recommended_items": [
    {
      "inventory_id": "the 8-char id prefix",
      "inventory_name": "full item name",
      "priority": "primary" | "secondary" | "optional",
      "reason": "why this item fits this company",
      "suggested_price_brl": 50000,
      "activation_idea": "specific activation concept for this brand"
    }
  ],
  "total_package_min": 50000,
  "total_package_max": 200000,
  "key_selling_points": ["point 1", "point 2", "point 3"],
  "outreach_angle": "One sentence pitch opening for this brand",
  "fit_score": 8.5,
  "barter_opportunities": ["list of potential barter if applicable"],
  "ideal_campaign_themes": ["theme 1", "theme 2"]
}

Rules:
- Recommend 3-6 inventory items, prioritized by brand fit
- If company is B2B, focus on hospitality, brand visibility, networking
- If B2C consumer brand, focus on jersey, digital, fan engagement
- If small/local company, suggest affordable packages (under R$50k)
- If enterprise/large, suggest premium packages
- NEVER suggest anything involving rival football clubs (Athletico, Cruzeiro, Flamengo, Palmeiras, Santos, Corinthians, São Paulo, Grêmio, Internacional)
- Always ground in Coritiba FC's identity: Verde e Branco, Couto Pereira, Curitiba, Paraná
`;

    const result = await invokeClaude({
      messages: [{ role: "user", content: prompt }],
      maxTokens: 2000,
      temperature: 0.4,
    });

    const parsed = extractJson(result.text) as Record<string, unknown> | null;
    if (!parsed) {
      return NextResponse.json({ error: "AI returned invalid response" }, { status: 500 });
    }

    // Enrich recommended items with full inventory data
    const recommendedItems = (parsed.recommended_items as Array<Record<string, unknown>>) ?? [];
    const enriched = recommendedItems.map(rec => {
      const match = items.find(item =>
        String(item.id).startsWith(String(rec.inventory_id)) ||
        String(item.name).toLowerCase() === String(rec.inventory_name).toLowerCase()
      );
      return { ...rec, inventory_data: match ?? null };
    });

    return NextResponse.json({
      proposal_type: parsed.proposal_type ?? "sponsorship",
      proposal_type_reason: parsed.proposal_type_reason ?? "",
      recommended_items: enriched,
      total_package_min: parsed.total_package_min ?? 0,
      total_package_max: parsed.total_package_max ?? 0,
      key_selling_points: parsed.key_selling_points ?? [],
      outreach_angle: parsed.outreach_angle ?? "",
      fit_score: parsed.fit_score ?? 7,
      barter_opportunities: parsed.barter_opportunities ?? [],
      ideal_campaign_themes: parsed.ideal_campaign_themes ?? [],
      company_name: company.company_name,
    });
  } catch (err) {
    console.error("[inventory/suggest]", err);
    return NextResponse.json({ error: err instanceof Error ? err.message : "Failed" }, { status: 500 });
  }
}
