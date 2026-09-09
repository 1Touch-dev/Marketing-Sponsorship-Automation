import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";
import { invokeClaude } from "@/lib/bedrock/client";
import { recordAudit } from "@/lib/audit/log";
import { requirePermission } from "@/lib/auth/server-permission";

export const runtime = "nodejs";
export const maxDuration = 60;

// Resource requirement templates per inventory category
const RESOURCE_TEMPLATES: Record<string, Array<{ role: string; hours: number }>> = {
  jersey:             [{ role: "Gestor de Patrocínio", hours: 2 }, { role: "Designer", hours: 4 }],
  led_board:          [{ role: "Técnico de LED", hours: 3 }, { role: "Coordenador de Evento", hours: 2 }],
  banner:             [{ role: "Designer", hours: 6 }, { role: "Impressão/Produção", hours: 8 }],
  scoreboard:         [{ role: "Técnico de Vídeo", hours: 3 }, { role: "Editor", hours: 4 }],
  press_backdrop:     [{ role: "Designer", hours: 5 }, { role: "Instalação", hours: 4 }],
  stadium_branding:   [{ role: "Designer", hours: 8 }, { role: "Produção", hours: 12 }],
  vip_area:           [{ role: "Anfitrião/Hostess", hours: 6 }, { role: "Coordenador", hours: 4 }],
  training_kit:       [{ role: "Designer", hours: 4 }, { role: "Produção", hours: 6 }],
  social_post:        [{ role: "Social Manager", hours: 2 }, { role: "Designer", hours: 2 }],
  stories:            [{ role: "Social Manager", hours: 1.5 }, { role: "Designer", hours: 1.5 }],
  reels:              [{ role: "Videógrafo", hours: 3 }, { role: "Editor", hours: 4 }, { role: "Social Manager", hours: 1 }],
  youtube:            [{ role: "Videógrafo", hours: 4 }, { role: "Editor", hours: 6 }, { role: "Roteirista", hours: 2 }],
  influencer:         [{ role: "Jogador/Atleta", hours: 2 }, { role: "Videógrafo", hours: 3 }, { role: "Editor", hours: 4 }],
  sponsored_content:  [{ role: "Redator", hours: 3 }, { role: "Designer", hours: 2 }, { role: "Social Manager", hours: 1 }],
  email_newsletter:   [{ role: "Redator", hours: 2 }, { role: "Designer HTML", hours: 3 }],
  matchday_activation:[{ role: "Coordenador de Ativação", hours: 8 }, { role: "Promoter (×3)", hours: 6 }],
};

function buildBriefFromInventory(lines: Array<{ name: string; category: string; inventory_type: string; quantity: number }>) {
  const resourceMap = new Map<string, number>();

  for (const line of lines) {
    const key = (line.category ?? "").toLowerCase().replace(/\s+/g, "_").replace(/[^a-z0-9_]/g, "");
    const tmpl = RESOURCE_TEMPLATES[key] ?? [];
    for (const r of tmpl) {
      resourceMap.set(r.role, (resourceMap.get(r.role) ?? 0) + r.hours * line.quantity);
    }
  }

  return Array.from(resourceMap.entries()).map(([role, hours]) => ({ role, hours }));
}

export async function GET(
  _req: Request,
  ctx: { params: { id: string } }
) {
  const sb = supabaseAdmin();
  const { data, error } = await sb
    .from("campaigns")
    .select("id, title, activation_brief")
    .eq("id", ctx.params.id)
    .maybeSingle();

  if (error || !data) return NextResponse.json({ error: "Campaign not found" }, { status: 404 });

  return NextResponse.json({ brief: (data as Record<string, unknown>).activation_brief ?? null });
}

export async function POST(
  req: Request,
  ctx: { params: { id: string } }
) {
  const auth = await requirePermission("create_campaign");
  if ("error" in auth) return auth.error;

  const sb = supabaseAdmin();
  const id = ctx.params.id;
  const body = await req.json().catch(() => ({})) as { lines?: Array<{ name: string; category: string; inventory_type: string; quantity: number }> };

  // Load campaign + inventory items
  const { data: campaign } = await sb
    .from("campaigns")
    .select("id, title, activation, companies(company_name)")
    .eq("id", id)
    .maybeSingle();
  if (!campaign) return NextResponse.json({ error: "Campaign not found" }, { status: 404 });

  // Load inventory lines from DB or use provided ones
  let lines = body.lines;
  if (!lines) {
    const { data: dbLines } = await sb
      .from("campaign_inventory_items")
      .select("name, category, inventory_type, quantity")
      .eq("campaign_id", id)
      .eq("included", true);
    lines = (dbLines as Array<{ name: string; category: string; inventory_type: string; quantity: number }>) ?? [];
  }

  // Generate resource requirements from template (empty if no inventory items)
  const resources = buildBriefFromInventory(lines);

  // Use AI to generate a richer brief with narrative
  const company = (campaign as unknown as { companies: { company_name: string } | null }).companies;
  const companyName = company?.company_name ?? "the sponsor";

  let aiBrief: string | null = null;
  try {
    const lineList = lines.length > 0
      ? lines.map(l => `- ${l.name} × ${l.quantity}`).join("\n")
      : "Nenhum item de inventário vinculado ainda.";
    const resourceList = resources.length > 0
      ? resources.map(r => `- ${r.role}: ${r.hours}h`).join("\n")
      : "A definir conforme itens de inventário.";

    const result = await invokeClaude({
      messages: [{
        role: "user",
        content: `You are a sponsorship activation coordinator for Coritiba FC.

Campaign: ${(campaign as Record<string, unknown>).title}
Sponsor: ${companyName}
Activation notes: ${String((campaign as Record<string, unknown>).activation ?? "Patrocínio Coritiba FC")}

Selected inventory:
${lineList}

Estimated resource requirements:
${resourceList}

Write a concise activation brief in Portuguese (max 300 words) covering:
1. Objetivo da ativação
2. Itens contratados e formato de execução
3. Equipe necessária e horas
4. Timeline sugerido (pré-jogo, jogo, pós-jogo)
5. Próximos passos imediatos

Be specific and actionable. Format as clean text with headers.`
      }],
      maxTokens: 600,
      temperature: 0.4,
    });
    aiBrief = result.text;
  } catch {
    // non-fatal — use template-based brief
  }

  const brief = {
    generated_at: new Date().toISOString(),
    campaign_id: id,
    company: companyName,
    inventory_items: lines,
    resource_requirements: resources,
    total_team_hours: resources.reduce((s, r) => s + r.hours, 0),
    narrative: aiBrief,
  };

  // Save to campaign
  await sb.from("campaigns").update({ activation_brief: brief } as never).eq("id", id);

  await recordAudit({
    entity_type: "campaign",
    entity_id: id,
    action: "campaign.activation_brief_generated",
    metadata: { item_count: lines.length, team_hours: brief.total_team_hours },
  });

  return NextResponse.json({ brief });
}

export async function PATCH(
  req: Request,
  ctx: { params: { id: string } }
) {
  const auth = await requirePermission("create_campaign");
  if ("error" in auth) return auth.error;

  const sb = supabaseAdmin();
  const body = await req.json().catch(() => ({})) as { brief: Record<string, unknown> };

  if (!body.brief) return NextResponse.json({ error: "brief required" }, { status: 400 });

  await sb.from("campaigns").update({ activation_brief: body.brief } as never).eq("id", ctx.params.id);

  return NextResponse.json({ ok: true });
}
