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

/**
 * Per-visitor identified engagement (2026-09-17) — replaces the
 * aggregate-only view count with a per-person breakdown: groups
 * proposal_views rows by visitor_key (an anonymous browser-persisted id
 * that becomes a real name/email once the visitor submits the
 * lead-interest form, see app/api/proposals/[id]/interest). Sessions with
 * no visitor_key at all (e.g. pre-migration rows, or storage blocked in
 * the visitor's browser) are grouped together as a single "unidentified"
 * bucket rather than one row each.
 */
export interface ProposalVisitorSummary {
  visitor_key: string | null;
  name: string | null;
  email: string | null;
  company: string | null;
  view_count: number;
  total_time_on_page_seconds: number;
  max_scroll_pct: number | null;
  first_viewed_at: string;
  last_viewed_at: string;
}

export async function getProposalVisitorBreakdown(
  sb: ReturnType<typeof supabaseAdmin>,
  proposalId: string,
): Promise<ProposalVisitorSummary[]> {
  const { data } = await sb
    .from("proposal_views" as "companies")
    .select("visitor_key, visitor_name, visitor_email, visitor_company, time_on_page_seconds, max_scroll_pct, created_at" as "id")
    .eq("proposal_id", proposalId)
    .order("created_at", { ascending: true });

  const rows = (data as unknown as Array<{
    visitor_key: string | null;
    visitor_name: string | null;
    visitor_email: string | null;
    visitor_company: string | null;
    time_on_page_seconds: number | null;
    max_scroll_pct: number | null;
    created_at: string;
  }> | null) ?? [];

  const byVisitor = new Map<string, ProposalVisitorSummary>();
  for (const row of rows) {
    // Rows with no visitor_key (never identified, or from before this
    // migration) are bucketed together under a fixed key rather than one
    // group per row — there's nothing to distinguish them by.
    const key = row.visitor_key ?? "__unidentified__";
    const existing = byVisitor.get(key);
    if (!existing) {
      byVisitor.set(key, {
        visitor_key: row.visitor_key,
        name: row.visitor_name,
        email: row.visitor_email,
        company: row.visitor_company,
        view_count: 1,
        total_time_on_page_seconds: row.time_on_page_seconds ?? 0,
        max_scroll_pct: row.max_scroll_pct,
        first_viewed_at: row.created_at,
        last_viewed_at: row.created_at,
      });
    } else {
      existing.view_count += 1;
      existing.total_time_on_page_seconds += row.time_on_page_seconds ?? 0;
      existing.max_scroll_pct = Math.max(existing.max_scroll_pct ?? 0, row.max_scroll_pct ?? 0);
      existing.last_viewed_at = row.created_at;
      // A later session's identity (post lead-form submission) supersedes
      // an earlier unidentified one for the same visitor_key.
      if (row.visitor_name) existing.name = row.visitor_name;
      if (row.visitor_email) existing.email = row.visitor_email;
      if (row.visitor_company) existing.company = row.visitor_company;
    }
  }

  return Array.from(byVisitor.values()).sort(
    (a, b) => new Date(b.last_viewed_at).getTime() - new Date(a.last_viewed_at).getTime(),
  );
}
