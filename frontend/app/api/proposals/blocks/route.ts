import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";
import { invokeClaude } from "@/lib/bedrock/client";
import { requirePermission } from "@/lib/auth/server-permission";
import { resolveTenantId } from "@/lib/tenants/current";
import { resolveClubContext } from "@/lib/tenants/club-context";
import type { ClubContextInput } from "@/lib/bedrock/prompts";

export const dynamic = "force-dynamic";

/** Block Library API — save/load reusable proposal sections */

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const type = searchParams.get("type"); // preset | library | both
  const sb = supabaseAdmin();
  const tenantId = await resolveTenantId();
  const tenant = await resolveClubContext(tenantId);

  // Return built-in presets + saved library blocks
  const presets = getBuiltInPresets(tenant);

  let libraryBlocks: LibraryBlock[] = [];
  try {
    const { data } = await sb.from("proposal_sections" as "companies")
      .select("id, title, content, section_type, tags, metadata, created_at")
      .eq("is_library_item", true as unknown as string)
      .eq("tenant_id", tenantId)
      .order("created_at", { ascending: false })
      .limit(50);
    libraryBlocks = (data ?? []) as unknown as LibraryBlock[];
  } catch { /* table may not support this field */ }

  return NextResponse.json({ presets, library_blocks: libraryBlocks });
}

export async function POST(req: Request) {
  const auth = await requirePermission("edit_proposal");
  if ("error" in auth) return auth.error;

  const { action, ...data } = await req.json() as { action: string } & Record<string, unknown>;

  if (action === "save_library_block") {
    const { title, content, section_type, tags, proposal_id } = data as {
      title: string; content: string; section_type: string; tags?: string[]; proposal_id?: string;
    };
    const sb = supabaseAdmin();
    const { data: saved, error } = await sb.from("proposal_sections" as "companies").insert({
      tenant_id: auth.user.tenant_id,
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

    const tenant = await resolveClubContext(auth.user.tenant_id);
    const clubName = tenant.club_facts.short_name ?? tenant.club_facts.club_name;
    const prompt = `You are a ${clubName} commercial proposal expert.
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

function getBuiltInPresets(tenant: ClubContextInput): Record<string, ProposalPreset> {
  const clubName = tenant.club_facts.short_name ?? tenant.club_facts.club_name;
  const fullName = tenant.club_facts.club_name;
  const localRegion = [tenant.club_facts.city, tenant.club_facts.state].filter(Boolean).join("/") || "sua região";

  const aboutClub = tenant.club_facts.founded_year
    ? `O ${fullName}, fundado em ${tenant.club_facts.founded_year}, é um dos grandes clubes do futebol brasileiro.${tenant.club_facts.follower_count ? ` Com ${tenant.club_facts.follower_count} nas redes sociais` : ""}${tenant.club_facts.stadium_name ? ` e o icônico ${tenant.club_facts.stadium_name}` : ""}, o ${clubName} oferece uma plataforma de visibilidade premium para marcas que desejam conectar-se à sua torcida.`
    : `O ${clubName} oferece uma plataforma de visibilidade premium para marcas que desejam conectar-se à sua torcida.`;

  return {
    sponsorship: {
      id: "sponsorship",
      name: "Sponsorship Proposal",
      description: "Full commercial sponsorship — jersey, LED, digital",
      icon: "🏆",
      sections: ["executive_summary","company_intelligence","sponsorship_strategy","activation_plan","deliverables","pricing_table","about_coritiba","next_steps"],
      default_content: {
        executive_summary: `Proposta de Parceria Estratégica — ${clubName} × [EMPRESA]`,
        about_coritiba: aboutClub,
      },
    },
    barter: {
      id: "barter",
      name: "Barter / Procurement Proposal",
      description: "Exchange goods/services for sponsorship visibility",
      icon: "🔄",
      sections: ["executive_summary","barter_overview","goods_services_offered","sponsorship_exchange","valuation","activation_plan","next_steps"],
      default_content: {
        executive_summary: `Proposta de Permuta Estratégica — ${clubName} × [EMPRESA]`,
      },
    },
    lei_de_incentivo: {
      id: "lei_de_incentivo",
      name: "Lei de Incentivo Fiscal",
      description: "Cultural/sports tax incentive sponsorship",
      icon: "⚖️",
      sections: ["executive_summary","lei_overview","esg_alignment","social_impact","fiscal_benefit","project_details","about_coritiba","next_steps"],
      default_content: {
        executive_summary: `Proposta Lei de Incentivo Esportivo — ${clubName} × [EMPRESA]`,
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
        executive_summary: `Parceria ESG e Impacto Social — ${clubName} × [EMPRESA]`,
      },
    },
    local_business: {
      id: "local_business",
      name: "Local Business Package",
      description: `Tailored for ${localRegion} local companies`,
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
