import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";
import { requireInternalAuth } from "@/lib/internal-auth";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const EXEC_COMPANIES = [
  {
    company_name: "Heineken Brasil",
    industry: "Bebidas / FMCG",
    website: "https://heineken.com.br",
    segment: "national",
    business_type: "B2C",
    company_size: "large",
    country: "Brasil",
    notes: "Patrocinador histórico de futebol. Alta afinidade com fan engagement e premium branding. Budget estimado R$5M+/ano.",
    status: "active",
    intelligence: {
      sponsorship_fit_score: 9.2,
      marketing_goals: ["Premium brand awareness", "Fan engagement no stádio", "Sustentabilidade ESG"],
      brand_positioning: "Premium, experiência autêntica, conexão cultural",
      recommended_strategies: ["fan_engagement", "premium_branding", "esg"],
      recommended_inventory: ["jersey_chest", "led_board", "vip_hospitality", "stadium_naming"],
    },
  },
  {
    company_name: "Natura Cosméticos",
    industry: "Beleza / Cosméticos / ESG",
    website: "https://natura.com.br",
    segment: "national",
    business_type: "B2C",
    company_size: "large",
    country: "Brasil",
    notes: "Empresa com forte posicionamento ESG. Busca ações de impacto social, sustentabilidade e comunidade.",
    status: "active",
    intelligence: {
      sponsorship_fit_score: 8.1,
      marketing_goals: ["Impacto social ESG", "Reconhecimento de marca feminina", "Conexão comunitária Curitiba"],
      brand_positioning: "Sustentabilidade, diversidade, beleza consciente",
      recommended_strategies: ["esg", "community", "digital_social"],
      recommended_inventory: ["instagram_post", "press_backdrop", "youth_academy", "matchday_activation"],
    },
  },
  {
    company_name: "Volvo Paraná",
    industry: "Automotivo / Caminhões",
    website: "https://volvotrucks.com.br",
    segment: "national",
    business_type: "B2B",
    company_size: "large",
    country: "Brasil",
    notes: "Planta de Curitiba. Empresa sueca com raízes profundas no Paraná. Interesse em ativações premium B2B.",
    status: "active",
    intelligence: {
      sponsorship_fit_score: 8.8,
      marketing_goals: ["B2B brand authority", "VIP hospitality para clientes corporativos", "Orgulho regional Paraná"],
      brand_positioning: "Segurança, confiabilidade, inovação sueca",
      recommended_strategies: ["hospitality", "premium_branding", "awareness"],
      recommended_inventory: ["vip_hospitality", "press_backdrop", "scoreboard", "led_board"],
    },
  },
  {
    company_name: "Positivo Tecnologia",
    industry: "Tecnologia / Educação",
    website: "https://positivo.com.br",
    segment: "national",
    business_type: "B2B",
    company_size: "large",
    country: "Brasil",
    notes: "Empresa paranaense de tecnologia. Forte conexão regional. Interesse em campanhas digitais e fan tech.",
    status: "active",
    intelligence: {
      sponsorship_fit_score: 8.5,
      marketing_goals: ["Fan engagement digital", "Tecnologia no estádio", "Orgulho paranaense"],
      brand_positioning: "Inovação tecnológica acessível, educação digital",
      recommended_strategies: ["digital_social", "fan_engagement", "community"],
      recommended_inventory: ["jersey_chest", "led_board", "instagram_post", "player_content"],
    },
  },
  {
    company_name: "Red Bull Brasil",
    industry: "Bebidas Energéticas / Lifestyle",
    website: "https://redbull.com/br-pt",
    segment: "national",
    business_type: "B2C",
    company_size: "large",
    country: "Brasil",
    notes: "Marca premium de lifestyle. Alto interesse em conteúdo digital, atletas jovens e ativações de energia.",
    status: "active",
    intelligence: {
      sponsorship_fit_score: 8.7,
      marketing_goals: ["Youth brand affinity", "Conteúdo digital viral", "Atleta branding"],
      brand_positioning: "Energia, performance, lifestyle jovem",
      recommended_strategies: ["digital_social", "fan_engagement", "youth"],
      recommended_inventory: ["player_content", "instagram_post", "youtube_video", "matchday_activation"],
    },
  },
];

export async function POST(req: Request) {
  const authErr = requireInternalAuth(req);
  if (authErr) return authErr;

  try {
    const { action } = await req.json() as { action: string };
    const sb = supabaseAdmin();
    const results: Record<string, unknown>[] = [];

    if (action === "seed_companies") {
      for (const co of EXEC_COMPANIES) {
        // Check if already exists (dedup by name)
        const { data: existing } = await sb.from("companies")
          .select("id").ilike("company_name", co.company_name).maybeSingle();

        if (existing) {
          // Update with polished data
          await sb.from("companies").update({
            industry: co.industry,
            website: co.website,
            segment: co.segment,
            business_type: co.business_type,
            company_size: co.company_size,
            notes: co.notes,
            status: "active",
            intelligence: co.intelligence,
            full_intelligence: co.intelligence,
          }).eq("id", existing.id);
          results.push({ action: "updated", company: co.company_name, id: existing.id });
        } else {
          const { data: created } = await sb.from("companies").insert({
            ...co,
            full_intelligence: co.intelligence,
          }).select("id").single();
          results.push({ action: "created", company: co.company_name, id: created?.id });
        }
      }
    }

    if (action === "seed_campaigns") {
      const { data: companies } = await sb.from("companies")
        .select("id, company_name")
        .in("company_name", EXEC_COMPANIES.map(c => c.company_name));

      const campaigns = [
        { title: "Heineken Matchday Experience: Verde com Estilo", company: "Heineken Brasil", strategy: "fan_engagement", status: "active", summary: "Experiência premium para torcedores no Couto Pereira com zona VIP Heineken, ativações no estádio e conteúdo exclusivo." },
        { title: "Natura Verde: Beleza com Impacto Social", company: "Natura Cosméticos", strategy: "esg", status: "active", summary: "Programa ESG com academia da juventude, reflorestamento Couto Pereira, e campanha de diversidade com jogadoras." },
        { title: "Volvo Power: Curitiba no Topo", company: "Volvo Paraná", strategy: "hospitality", status: "active", summary: "Hospitality B2B premium para clientes Volvo no Couto Pereira, naming rights do setor VIP, press backdrop exclusivo." },
        { title: "Positivo Coxa Digital: Tecnologia que Transforma", company: "Positivo Tecnologia", strategy: "digital_social", status: "active", summary: "Transformação digital do Coritiba FC com app do torcedor, telão interativo e campanha nas redes sociais." },
        { title: "Red Bull x Coritiba: Energia Verde e Branca", company: "Red Bull Brasil", strategy: "youth", status: "active", summary: "Campanha de atletas jovens, conteúdo digital viral, ativações de fan zone e programa de desenvolvimento jovem." },
      ];

      for (const camp of campaigns) {
        const company = (companies ?? []).find((c: Record<string,string>) => c.company_name === camp.company);
        if (!company) continue;

        const { data: existing } = await sb.from("campaigns").select("id").ilike("title", camp.title).maybeSingle();
        if (!existing) {
          const { data: created } = await sb.from("campaigns").insert({
            title: camp.title,
            company_id: company.id,
            strategy: camp.strategy,
            status: camp.status,
            summary: camp.summary,
          }).select("id").single();
          results.push({ action: "campaign_created", title: camp.title, id: created?.id });
        }
      }
    }

    return NextResponse.json({ success: true, action, results, count: results.length });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Seed failed" }, { status: 500 });
  }
}
