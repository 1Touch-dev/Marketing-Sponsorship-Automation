import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";
import { requireInternalAuth } from "@/lib/internal-auth";
import { CORITIBA_TENANT_ID } from "@/lib/tenants/types";
import { resolveClubContext } from "@/lib/tenants/club-context";
import { logCrmActivity, pushDeal } from "@/lib/pipedrive/adapter";
import { isPipedriveConfigured } from "@/lib/pipedrive/client";
import { pushContext, service } from "@/lib/pipedrive/context";

// Pipedrive is a single, Coritiba-specific CRM integration today (see
// PLATFORM_ROADMAP.md Section 6 — it doesn't fit the multi-tenant model),
// so this background job is deliberately scoped to only the Coritiba
// tenant's data — never syncing another tenant's proposals/contracts into
// Coritiba's shared Pipedrive account.
//
// Every push here goes by the stored link of the record (lib/pipedrive/adapter.ts): a deal is updated, or created once and
// linked. Nothing is looked up in Pipedrive by title.
export async function POST(req: NextRequest) {
  const authErr = requireInternalAuth(req);
  if (authErr) return authErr;
  if (!isPipedriveConfigured()) return NextResponse.json({ ok: true, processed: 0, results: [], skipped: "No Pipedrive API key is set on this server." });

  const sb = supabaseAdmin();
  const results: string[] = [];
  const failures: string[] = [];
  const tenant = await resolveClubContext(CORITIBA_TENANT_ID);
  const clubName = tenant.club_facts.short_name ?? tenant.club_facts.club_name;
  const ctxFor = (ref: string) => pushContext(sb, CORITIBA_TENANT_ID, service("pipedrive-sync"), "scheduled_sync", ref);

  // 1. Proposals sent in the last 24h: make sure each has its deal, and that the deal is current
  const yesterday = new Date(Date.now() - 86400 * 1000).toISOString();
  const { data: sentProposals } = await sb
    .from("proposals")
    .select("id, title, companies(company_name)")
    .eq("tenant_id", CORITIBA_TENANT_ID)
    .eq("status", "sent")
    .gte("updated_at", yesterday);

  for (const p of (sentProposals ?? [])) {
    const companyName = (p.companies as { company_name?: string } | null)?.company_name ?? "Unknown";
    const r = await pushDeal(ctxFor(p.id), p.id, { status: "sent", title: `${companyName} x ${clubName} — ${p.title}` });
    if (r.ok) results.push(`${r.created ? "Created" : "Updated"} deal: ${p.title}`);
    else if (!r.skipped) failures.push(`Deal not synced (${p.title}): ${r.error}`);
  }

  // 2. Proposals with no activity in 7+ days (cold deals): a follow-up note on the proposal's own deal
  const sevenDaysAgo = new Date(Date.now() - 7 * 86400 * 1000).toISOString();
  const { data: coldProposals } = await sb
    .from("proposals")
    .select("id, title")
    .eq("tenant_id", CORITIBA_TENANT_ID)
    .in("status", ["sent", "viewed"])
    .lte("updated_at", sevenDaysAgo);

  for (const p of (coldProposals ?? [])) {
    const r = await logCrmActivity(ctxFor(p.id), p.id, { subject: "Follow-up needed", note: `No activity for 7+ days on proposal: ${p.title}. Follow up recommended.` });
    if (r.ok) results.push(`Cold deal alert: ${p.title}`);
  }

  // 3. Contracts expiring in 60 days: a renewal note on the deal of the proposal the contract came from
  const sixtyDaysFromNow = new Date(Date.now() + 60 * 86400 * 1000).toISOString().split("T")[0];
  let expiringContracts: Array<{ title: string; end_date: string; proposal_id?: string | null }> = [];
  try {
    const { data } = await sb
      .from("contracts")
      .select("title, end_date, proposal_id")
      .eq("tenant_id", CORITIBA_TENANT_ID)
      .lte("end_date", sixtyDaysFromNow)
      .eq("status", "active");
    expiringContracts = (data ?? []) as typeof expiringContracts;
  } catch { expiringContracts = []; }

  for (const c of expiringContracts) {
    if (!c.proposal_id) continue;
    const r = await logCrmActivity(ctxFor(c.proposal_id), c.proposal_id, { subject: "Contract renewal alert", note: `Contract "${c.title}" expires on ${c.end_date}. Start renewal proposal.` });
    if (r.ok) results.push(`Renewal alert: ${c.title} expires ${c.end_date}`);
  }

  return NextResponse.json({ ok: failures.length === 0, processed: results.length, results, ...(failures.length ? { failures } : {}) });
}
