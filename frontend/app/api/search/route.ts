import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

/**
 * GET /api/search?q=query&types=companies,proposals,campaigns
 * Global search across all entities
 */
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const q = (searchParams.get("q") ?? "").trim();
  const types = (searchParams.get("types") ?? "companies,proposals,campaigns,inventory").split(",");
  const limit = Math.min(parseInt(searchParams.get("limit") ?? "8"), 20);

  if (q.length < 2) return NextResponse.json({ results: [], query: q });

  const sb = supabaseAdmin();
  const results: Array<{ type: string; id: string; title: string; subtitle: string; url: string; badge?: string }> = [];

  await Promise.all([
    // Companies
    types.includes("companies") && sb.from("companies")
      .select("id, company_name, industry, segment, status")
      .or(`company_name.ilike.%${q}%,industry.ilike.%${q}%,notes.ilike.%${q}%`)
      .neq("status", "closed")
      .limit(limit)
      .then(({ data }) => {
        for (const c of (data ?? []) as Array<Record<string,string>>) {
          results.push({
            type: "company",
            id: c.id,
            title: c.company_name,
            subtitle: [c.industry, c.segment].filter(Boolean).join(" · "),
            url: `/companies/${c.id}`,
            badge: c.status,
          });
        }
      }),

    // Proposals
    types.includes("proposals") && sb.from("proposals")
      .select("id, title, status, companies(company_name)")
      .or(`title.ilike.%${q}%`)
      .not("status", "eq", "archived")
      .limit(limit)
      .then(({ data }) => {
        for (const p of (data ?? []) as Array<Record<string,unknown>>) {
          const co = (p.companies as Record<string,string> | null)?.company_name ?? "";
          results.push({
            type: "proposal",
            id: p.id as string,
            title: p.title as string,
            subtitle: co,
            url: `/proposals/${p.id}`,
            badge: p.status as string,
          });
        }
      }),

    // Campaigns
    types.includes("campaigns") && sb.from("campaigns")
      .select("id, title, status, companies(company_name)")
      .or(`title.ilike.%${q}%,summary.ilike.%${q}%`)
      .limit(limit)
      .then(({ data }) => {
        for (const c of (data ?? []) as Array<Record<string,unknown>>) {
          const co = (c.companies as Record<string,string> | null)?.company_name ?? "";
          results.push({
            type: "campaign",
            id: c.id as string,
            title: c.title as string,
            subtitle: co,
            url: `/campaigns/${c.id}`,
            badge: c.status as string,
          });
        }
      }),

    // Inventory
    types.includes("inventory") && sb.from("inventory_items" as "companies")
      .select("id, name, category, price_per_game, price_per_month")
      .or(`name.ilike.%${q}%,category.ilike.%${q}%,description.ilike.%${q}%`)
      .limit(limit)
      .then(({ data }) => {
        for (const item of (data ?? []) as Array<Record<string,unknown>>) {
          results.push({
            type: "inventory",
            id: item.id as string,
            title: item.name as string,
            subtitle: item.category as string,
            url: `/inventory`,
            badge: item.price_per_month ? `R$${item.price_per_month}/mês` : undefined,
          });
        }
      }),
  ].filter(Boolean));

  // Sort: exact name matches first
  results.sort((a, b) => {
    const aExact = a.title.toLowerCase().startsWith(q.toLowerCase()) ? 0 : 1;
    const bExact = b.title.toLowerCase().startsWith(q.toLowerCase()) ? 0 : 1;
    return aExact - bExact;
  });

  return NextResponse.json({ results: results.slice(0, limit * 2), query: q, total: results.length });
}
