import { supabaseAdmin } from "@/lib/supabase/server";

/**
 * Phase 5 — sponsor-facing real-time ROI dashboard (master_report.md
 * Section 4 P0 item #1: "Sponsorship ROI measurement is essentially
 * unsolved industry-wide — only 37% of sponsors have a standardized ROI
 * process"). Grounded entirely in real per-match reach data
 * (match_media_reach, built last sprint) — never fabricates a number.
 * has_data is false (and the caller should render nothing) until real
 * reach figures actually exist for at least one past match in scope.
 */
export interface ProposalRoiMatch {
  id: string;
  match_date: string;
  opponent: string;
  competition: string | null;
  result: string | null;
  official_views: number;
  unofficial_fan_views: number;
  rival_account_views: number;
  media_tv_radio_views: number;
}

export interface ProposalRoiData {
  has_data: boolean;
  matches_covered: number;
  total_official_views: number;
  total_unofficial_fan_views: number;
  total_rival_account_views: number;
  total_media_tv_radio_views: number;
  total_reach: number;
  matches: ProposalRoiMatch[];
  deliverables: Array<{ name: string; quantity: number | null; scope: string | null }>;
}

const EMPTY: ProposalRoiData = {
  has_data: false,
  matches_covered: 0,
  total_official_views: 0,
  total_unofficial_fan_views: 0,
  total_rival_account_views: 0,
  total_media_tv_radio_views: 0,
  total_reach: 0,
  matches: [],
  deliverables: [],
};

export async function getProposalRoiData(
  sb: ReturnType<typeof supabaseAdmin>,
  proposal: { id: string; match_id?: string | null; approved_at?: string | null; created_at: string },
): Promise<ProposalRoiData> {
  const today = new Date().toISOString().slice(0, 10);

  let matchRows: Array<Record<string, unknown>> = [];
  if (proposal.match_id) {
    const { data } = await sb
      .from("matches" as "companies")
      .select("id, match_date, opponent, competition, result, match_media_reach(*)")
      .eq("id", proposal.match_id)
      .lte("match_date", today);
    matchRows = (data as unknown as Array<Record<string, unknown>>) ?? [];
  } else {
    // Season-wide sponsorship: every match since this proposal was approved (or created).
    const since = (proposal.approved_at ?? proposal.created_at).slice(0, 10);
    const { data } = await sb
      .from("matches" as "companies")
      .select("id, match_date, opponent, competition, result, match_media_reach(*)")
      .gte("match_date", since)
      .lte("match_date", today)
      .order("match_date" as "id", { ascending: true });
    matchRows = (data as unknown as Array<Record<string, unknown>>) ?? [];
  }

  const matches: ProposalRoiMatch[] = matchRows.map((m) => {
    const reachRaw = m.match_media_reach as unknown;
    const reach = (Array.isArray(reachRaw) ? reachRaw[0] : reachRaw) as
      | { official_views?: number; unofficial_fan_views?: number; rival_account_views?: number; media_tv_radio_views?: number }
      | null
      | undefined;
    return {
      id: m.id as string,
      match_date: m.match_date as string,
      opponent: m.opponent as string,
      competition: (m.competition as string | null) ?? null,
      result: (m.result as string | null) ?? null,
      official_views: reach?.official_views ?? 0,
      unofficial_fan_views: reach?.unofficial_fan_views ?? 0,
      rival_account_views: reach?.rival_account_views ?? 0,
      media_tv_radio_views: reach?.media_tv_radio_views ?? 0,
    };
  });

  const totals = matches.reduce(
    (acc, m) => ({
      official: acc.official + m.official_views,
      unofficial: acc.unofficial + m.unofficial_fan_views,
      rival: acc.rival + m.rival_account_views,
      media: acc.media + m.media_tv_radio_views,
    }),
    { official: 0, unofficial: 0, rival: 0, media: 0 },
  );
  const totalReach = totals.official + totals.unofficial + totals.rival + totals.media;

  const { data: inventoryRows } = await sb
    .from("proposal_inventory_items" as "companies")
    .select("quantity, scope, inventory_items(name)")
    .eq("proposal_id" as "id", proposal.id);

  const deliverables = ((inventoryRows as unknown as Array<{
    quantity: number | null;
    scope: string | null;
    inventory_items: { name: string } | { name: string }[] | null;
  }>) ?? []).map((r) => {
    const inv = Array.isArray(r.inventory_items) ? r.inventory_items[0] : r.inventory_items;
    return { name: inv?.name ?? "Item", quantity: r.quantity, scope: r.scope };
  });

  if (matches.length === 0 || totalReach === 0) {
    return { ...EMPTY, deliverables };
  }

  return {
    has_data: true,
    matches_covered: matches.length,
    total_official_views: totals.official,
    total_unofficial_fan_views: totals.unofficial,
    total_rival_account_views: totals.rival,
    total_media_tv_radio_views: totals.media,
    total_reach: totalReach,
    matches,
    deliverables,
  };
}
