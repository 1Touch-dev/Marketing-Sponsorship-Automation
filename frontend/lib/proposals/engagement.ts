import { supabaseAdmin } from "@/lib/supabase/server";

/**
 * Phase 5 — native engagement analytics (master_report.md Section 4 P0
 * item #3: views, drop-off, time-on-page). Aggregates proposal_views rows
 * (migration 0046) into stats usable both for the proposal detail page and
 * for gone-cold detection.
 */
export interface ProposalEngagementStats {
  view_count: number;
  avg_time_on_page_seconds: number | null;
  avg_max_scroll_pct: number | null;
  last_viewed_at: string | null;
  days_since_last_view: number | null;
}

export async function getProposalEngagementStats(
  sb: ReturnType<typeof supabaseAdmin>,
  proposalId: string,
): Promise<ProposalEngagementStats> {
  const { data } = await sb
    .from("proposal_views" as "companies")
    .select("time_on_page_seconds, max_scroll_pct, created_at")
    .eq("proposal_id", proposalId);

  const rows = (data as unknown as Array<{
    time_on_page_seconds: number | null;
    max_scroll_pct: number | null;
    created_at: string;
  }> | null) ?? [];

  const withTime = rows.filter((r) => typeof r.time_on_page_seconds === "number") as Array<{ time_on_page_seconds: number }>;
  const withScroll = rows.filter((r) => typeof r.max_scroll_pct === "number") as Array<{ max_scroll_pct: number }>;
  const lastViewedAt = rows.length
    ? rows.reduce((max, r) => (r.created_at > max ? r.created_at : max), rows[0].created_at)
    : null;

  return {
    view_count: rows.length,
    avg_time_on_page_seconds: withTime.length
      ? Math.round(withTime.reduce((s, r) => s + r.time_on_page_seconds, 0) / withTime.length)
      : null,
    avg_max_scroll_pct: withScroll.length
      ? Math.round(withScroll.reduce((s, r) => s + r.max_scroll_pct, 0) / withScroll.length)
      : null,
    last_viewed_at: lastViewedAt,
    days_since_last_view: lastViewedAt
      ? Math.floor((Date.now() - new Date(lastViewedAt).getTime()) / 86_400_000)
      : null,
  };
}
