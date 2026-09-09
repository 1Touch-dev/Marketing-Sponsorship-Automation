import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";
import { createOrUpdateDeal, logActivity } from "@/lib/pipedrive/sync";
import { requireInternalAuth } from "@/lib/internal-auth";

export async function POST(req: NextRequest) {
  const authErr = requireInternalAuth(req);
  if (authErr) return authErr;

  const sb = supabaseAdmin();
  const results: string[] = [];

  // 1. Find proposals sent in last 24h that haven't been synced to Pipedrive
  const yesterday = new Date(Date.now() - 86400 * 1000).toISOString();
  const { data: sentProposals } = await sb
    .from("proposals")
    .select("id, title, companies(company_name)")
    .eq("status", "sent")
    .gte("updated_at", yesterday);

  for (const p of (sentProposals ?? [])) {
    const companyName = (p.companies as { company_name?: string } | null)?.company_name ?? "Unknown";
    const result = await createOrUpdateDeal({
      title: `${companyName} x Coritiba FC — ${p.title}`,
      orgName: companyName,
      status: "open",
      proposalId: p.id,
    });
    if (result.success) results.push(`Synced deal: ${p.title}`);
  }

  // 2. Find proposals with no activity in 7+ days (cold deals)
  const sevenDaysAgo = new Date(Date.now() - 7 * 86400 * 1000).toISOString();
  const { data: coldProposals } = await sb
    .from("proposals")
    .select("id, title, companies(company_name)")
    .in("status", ["sent", "viewed"])
    .lte("updated_at", sevenDaysAgo);

  for (const p of (coldProposals ?? [])) {
    const companyName = (p.companies as { company_name?: string } | null)?.company_name ?? "Unknown";
    const dealTitle = `${companyName} x Coritiba FC — ${p.title}`;
    await logActivity({
      dealTitle,
      activityType: "Follow-up needed",
      note: `No activity for 7+ days on proposal: ${p.title}. Follow up recommended.`,
    }).catch(() => {});
    results.push(`Cold deal alert: ${p.title}`);
  }

  // 3. Find contracts expiring in 60 days
  const sixtyDaysFromNow = new Date(Date.now() + 60 * 86400 * 1000).toISOString().split("T")[0];
  let expiringContracts: Array<{ title: string; end_date: string; companies?: Array<{ company_name?: string }> | null }> = [];
  try {
    const { data } = await sb
      .from("contracts")
      .select("title, end_date, companies(company_name)")
      .lte("end_date", sixtyDaysFromNow)
      .eq("status", "active");
    expiringContracts = (data ?? []) as typeof expiringContracts;
  } catch { expiringContracts = []; }

  for (const c of expiringContracts) {
    const rawCompanies = c.companies as unknown;
    const companyName = Array.isArray(rawCompanies)
      ? ((rawCompanies as Array<{ company_name?: string }>)[0]?.company_name ?? "Unknown")
      : ((rawCompanies as { company_name?: string } | null)?.company_name ?? "Unknown");
    await logActivity({
      dealTitle: `${companyName} x Coritiba FC`,
      activityType: "Contract renewal alert",
      note: `Contract "${c.title}" expires on ${c.end_date}. Start renewal proposal.`,
    }).catch(() => {});
    results.push(`Renewal alert: ${c.title} expires ${c.end_date}`);
  }

  return NextResponse.json({ ok: true, processed: results.length, results });
}
