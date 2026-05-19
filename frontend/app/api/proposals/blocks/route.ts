import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";
import { invokeClaude } from "@/lib/bedrock/client";

export const dynamic = "force-dynamic";

/** Block Library API — save/load reusable proposal sections */

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const type = searchParams.get("type"); // preset | library | both
  const sb = supabaseAdmin();

  // Return built-in presets + saved library blocks
  const presets = getBuiltInPresets();
  
  let libraryBlocks: LibraryBlock[] = [];
  try {
    const { data } = await sb.from("proposal_sections" as "companies")
      .select("id, title, content, section_type, tags, metadata, created_at")
      .eq("is_library_item", true as unknown as string)
      .order("created_at", { ascending: false })
      .limit(50);
    libraryBlocks = (data ?? []) as unknown as LibraryBlock[];
  } catch { /* table may not support this field */ }

  return NextResponse.json({ presets, library_blocks: libraryBlocks });
}

export async function POST(req: Request) {
  const { action, ...data } = await req.json() as { action: string } & Record<string, unknown>;

  if (action === "save_library_block") {
    const { title, content, section_type, tags, proposal_id } = data as {
      title: string; content: string; section_type: string; tags?: string[]; proposal_id?: string;
    };
    const sb = supabaseAdmin();
    const { data: saved, error } = await sb.from("proposal_sections" as "companies").insert({
      proposal_id: proposal_id ?? null,
      section_type: section_type ?? "custom",
      title,
      content,
      tags,
      is_library_item: true,
      metadata: { saved_at: new Date().toISOString() },
    } as unknown as Record<string, string>).select("id").single();
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
    return NextResponse.json({ success: true, id: (saved as Record<string, string>)?.id });
  }

  if (action === "ai_suggestions") {
    const { section_id, current_content, proposal_type, company_name, industry } = data as {
      section_id: string; current_content: string; proposal_type: string; company_name: string; industry: string;
    };

    const prompt = `You are a Coritiba FC commercial proposal expert.
Section: ${section_id}
Company: ${company_name} (${industry})
Proposal type: ${proposal_type}
Current content: ${current_content?.slice(0, 600)}

Suggest 3 improvements for this section. Return JSON:
{
  "suggestions": [
    {"type": "stronger_cta", "title": "Stronger CTA", "suggestion": "...", "reason": "..."},
    {"type": "data_point", "title": "Add Data Point", "suggestion": "...", "reason": "..."},
    {"type": "emotional", "title": "Emotional Appeal", "suggestion": "...", "reason": "..."}
  ],
  "readability_score": 7.5,
  "sponsorship_strength": 8.0,
  "word_count_ideal": 200
}`;

    const result = await invokeClaude({ messages: [{ role: "user", content: prompt }], maxTokens: 1500, temperature: 0.5 });
    let suggestions: Record<string, unknown> = {};
    try { const m = result.text.match(/\{[\s\S]*\}/); if (m) suggestions = JSON.parse(m[0]); } catch { /* */ }
    return NextResponse.json({ success: true, ...suggestions });
  }

  return NextResponse.json({ error: "Unknown action" }, { status: 400 });
}

type LibraryBlock = { id: string; title: string; content: string; section_type: string; tags?: string[] };

function getBuiltInPresets(): Record<string, ProposalPreset> {
  return {
    sponsorship: {
      id: "sponsorship",
      name: "Sponsorship Proposal",
      description: "Full commercial sponsorship — jersey, LED, digital",
      icon: "🏆",
      sections: ["executive_summary","company_intelligence","sponsorship_strategy","activation_plan","deliverables","pricing_table","about_coritiba","next_steps"],
      default_content: {
        executive_summary: "Proposta de Parceria Estratégica — Coritiba FC × [EMPRESA]",
        about_coritiba: "O Coritiba Foot Ball Club, fundado em 1909, é o clube mais antigo do Paraná e um dos grandes do futebol brasileiro. Com mais de 1,5 milhão de seguidores nas redes sociais, transmissões nacionais no Brasileirão e Copa do Brasil, e o icônico Couto Pereira com capacidade para 30.000 torcedores, o Coritiba oferece uma plataforma de visibilidade premium para marcas que desejam conectar-se ao orgulho paranaense.",
      },
    },
    barter: {
      id: "barter",
      name: "Barter / Procurement Proposal",
      description: "Exchange goods/services for sponsorship visibility",
      icon: "🔄",
      sections: ["executive_summary","barter_overview","goods_services_offered","sponsorship_exchange","valuation","activation_plan","next_steps"],
      default_content: {
        executive_summary: "Proposta de Permuta Estratégica — Coritiba FC × [EMPRESA]",
      },
    },
    lei_de_incentivo: {
      id: "lei_de_incentivo",
      name: "Lei de Incentivo Fiscal",
      description: "Cultural/sports tax incentive sponsorship",
      icon: "⚖️",
      sections: ["executive_summary","lei_overview","esg_alignment","social_impact","fiscal_benefit","project_details","about_coritiba","next_steps"],
      default_content: {
        executive_summary: "Proposta Lei de Incentivo Esportivo — Coritiba FC × [EMPRESA]",
        lei_overview: "Através da Lei Federal de Incentivo ao Esporte (Lei nº 11.438/2006) e Lei Rouanet, empresas podem destinar parte do IR devido ao patrocínio de projetos esportivos e culturais aprovados, com dedução de até 100% do valor investido.",
      },
    },
    esg_community: {
      id: "esg_community",
      name: "ESG Community Partnership",
      description: "Sustainability + community impact partnership",
      icon: "🌱",
      sections: ["executive_summary","esg_overview","community_impact","social_metrics","partnership_model","activation_plan","reporting","next_steps"],
      default_content: {
        executive_summary: "Parceria ESG e Impacto Social — Coritiba FC × [EMPRESA]",
      },
    },
    local_business: {
      id: "local_business",
      name: "Local Business Package",
      description: "Tailored for Curitiba/Paraná local companies",
      icon: "📍",
      sections: ["executive_summary","local_context","sponsorship_strategy","deliverables","pricing_table","next_steps"],
      default_content: {},
    },
    national_brand: {
      id: "national_brand",
      name: "National Brand Proposal",
      description: "For large national/international brands",
      icon: "🌎",
      sections: ["executive_summary","company_intelligence","market_opportunity","sponsorship_strategy","activation_plan","deliverables","pricing_table","about_coritiba","case_studies","next_steps"],
      default_content: {},
    },
  };
}

type ProposalPreset = {
  id: string;
  name: string;
  description: string;
  icon: string;
  sections: string[];
  default_content: Record<string, string>;
};
