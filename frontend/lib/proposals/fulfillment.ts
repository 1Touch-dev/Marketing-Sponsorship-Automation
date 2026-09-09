import { supabaseAdmin } from "@/lib/supabase/server";

/**
 * Phase 6 — proof-of-delivery / fulfillment tracking (master_report.md
 * Section 4 P1 item, extends the Phase 5 ROI dashboard). The ROI dashboard
 * shows aggregate reach; this shows concrete, dated proof that specific
 * contracted deliverables actually happened — an approved mockup, a match
 * where the sponsor's placement was live. Grounded entirely in real rows
 * (image_generation_jobs, matches) — has_data is false until at least one
 * real fulfillment event exists, same discipline as roi.ts.
 */
export interface FulfillmentEvent {
  type: "mockup_approved" | "match_delivered";
  date: string;
  label: string;
  detail: string | null;
  image_url: string | null;
}

export interface FulfillmentData {
  has_data: boolean;
  events: FulfillmentEvent[];
}

const JOB_TYPE_LABELS: Record<string, string> = {
  jersey_mockup_official: "Mockup de camisa aprovado",
  jersey_mockup: "Mockup de camisa aprovado",
  stadium_mockup_official: "Mockup de estádio aprovado",
  stadium_mockup: "Mockup de estádio aprovado",
  campaign_creative: "Criativo de campanha aprovado",
  led_board: "Mockup de LED aprovado",
  social_post: "Post social aprovado",
  press_backdrop: "Backdrop de imprensa aprovado",
  scoreboard: "Mockup de placar aprovado",
};

export async function getProposalFulfillmentData(
  sb: ReturnType<typeof supabaseAdmin>,
  proposal: { id: string; match_id?: string | null; approved_at?: string | null; created_at: string },
): Promise<FulfillmentData> {
  const today = new Date().toISOString().slice(0, 10);

  // 1. Approved mockups — real, dated, with the actual image as proof.
  const { data: jobRows } = await sb
    .from("image_generation_jobs" as "companies")
    .select("id, job_type, display_label, selected_url, approved_at")
    .eq("proposal_id" as "id", proposal.id)
    .in("status" as "id", ["completed", "approved"])
    .not("approved_at" as "id", "is", null)
    .not("selected_url" as "id", "is", null);

  const mockupEvents: FulfillmentEvent[] = ((jobRows as unknown as Array<{
    id: string;
    job_type: string;
    display_label: string | null;
    selected_url: string | null;
    approved_at: string;
  }>) ?? []).map((j) => ({
    type: "mockup_approved" as const,
    date: j.approved_at,
    label: j.display_label ?? JOB_TYPE_LABELS[j.job_type] ?? "Mockup aprovado",
    detail: null,
    image_url: j.selected_url,
  }));

  // 2. Delivered matches — same scoping rule as lib/proposals/roi.ts
  // (one match if match_id is set, else every match since approval), but
  // only matches that actually happened AND have real reach data recorded
  // count as "delivered" — a scheduled-but-unplayed or unrecorded match
  // isn't proof of anything yet.
  let matchRows: Array<Record<string, unknown>> = [];
  if (proposal.match_id) {
    const { data } = await sb
      .from("matches" as "companies")
      .select("id, match_date, opponent, competition, match_media_reach(official_views, unofficial_fan_views, rival_account_views, media_tv_radio_views)")
      .eq("id", proposal.match_id)
      .lte("match_date", today);
    matchRows = (data as unknown as Array<Record<string, unknown>>) ?? [];
  } else {
    const since = (proposal.approved_at ?? proposal.created_at).slice(0, 10);
    const { data } = await sb
      .from("matches" as "companies")
      .select("id, match_date, opponent, competition, match_media_reach(official_views, unofficial_fan_views, rival_account_views, media_tv_radio_views)")
      .gte("match_date", since)
      .lte("match_date", today);
    matchRows = (data as unknown as Array<Record<string, unknown>>) ?? [];
  }

  const matchEvents: FulfillmentEvent[] = matchRows
    .filter((m) => {
      const reachRaw = m.match_media_reach as unknown;
      const reach = (Array.isArray(reachRaw) ? reachRaw[0] : reachRaw) as
        | { official_views?: number; unofficial_fan_views?: number; rival_account_views?: number; media_tv_radio_views?: number }
        | null
        | undefined;
      const total =
        (reach?.official_views ?? 0) +
        (reach?.unofficial_fan_views ?? 0) +
        (reach?.rival_account_views ?? 0) +
        (reach?.media_tv_radio_views ?? 0);
      return total > 0;
    })
    .map((m) => ({
      type: "match_delivered" as const,
      date: m.match_date as string,
      label: `Exposição entregue — Coritiba × ${m.opponent as string}`,
      detail: (m.competition as string | null) ?? null,
      image_url: null,
    }));

  const events = [...mockupEvents, ...matchEvents].sort((a, b) => (a.date < b.date ? 1 : -1));

  return { has_data: events.length > 0, events };
}
