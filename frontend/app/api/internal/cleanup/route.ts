import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";
import { requireInternalAuth } from "@/lib/internal-auth";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * POST /api/internal/cleanup
 * Had ZERO auth of any kind — its "deduplicate_companies" action deletes
 * ANY company sharing a name with another (not just test data), plus
 * associated proposals/campaigns. Reachable unauthenticated from the
 * public internet since /api/internal/* bypasses the session middleware.
 * Found in the RBAC follow-up audit, 2026-09-09.
 */
export async function POST(req: Request) {
  const authErr = requireInternalAuth(req);
  if (authErr) return authErr;

  const { action } = await req.json() as { action: string };
  const sb = supabaseAdmin();
  const results: Record<string, unknown> = {};

  if (action === "archive_test_companies") {
    const testNames = ["Test Corp","Test Sponsor","TEST_DIAG","Good Company","Bad Website",
      "Valid URL Co","Bad URL Co","No Protocol Co","Empty URL Co","ValidUrlFix Co","EmptyUrlFix Co","Positivo Tecnologia Test"];
    const { data: toDelete } = await sb.from("companies").select("id,company_name").in("status",["closed"]);
    const ids = ((toDelete ?? []) as Array<Record<string,string>>)
      .filter(c => testNames.some(t => c.company_name?.toLowerCase().includes(t.toLowerCase())))
      .map(c => c.id);
    if (ids.length > 0) {
      await sb.from("proposals").delete().in("company_id", ids);
      await sb.from("campaigns").delete().in("company_id", ids);
      await sb.from("companies").delete().in("id", ids);
    }
    results.archived_companies = ids.length;
  }

  if (action === "deduplicate_companies") {
    const { data: companies } = await sb.from("companies").select("id,company_name,created_at").order("created_at",{ascending:false});
    const seen: Record<string,boolean> = {};
    const toDelete: string[] = [];
    for (const c of (companies ?? []) as Array<Record<string,string>>) {
      const key = c.company_name.toLowerCase().trim();
      if (seen[key]) toDelete.push(c.id);
      else seen[key] = true;
    }
    if (toDelete.length > 0) {
      await sb.from("campaigns").delete().in("company_id", toDelete);
      await sb.from("proposals").delete().in("company_id", toDelete);
      await sb.from("companies").delete().in("id", toDelete);
    }
    results.deduplicated = toDelete.length;
  }

  if (action === "archive_stale_proposals") {
    const { data: drafts } = await sb.from("proposals").select("id,company_id,created_at").eq("status","draft").order("created_at",{ascending:false});
    const seen: Record<string,number> = {};
    const toArchive: string[] = [];
    for (const p of (drafts ?? []) as Array<Record<string,string>>) {
      seen[p.company_id] = (seen[p.company_id] ?? 0) + 1;
      if (seen[p.company_id] > 2) toArchive.push(p.id);
    }
    if (toArchive.length > 0) await sb.from("proposals").update({status:"archived"} as Record<string,unknown>).in("id",toArchive);
    results.archived_proposals = toArchive.length;
  }

  if (action === "cleanup_failed_jobs") {
    const { data: failed } = await sb.from("image_generation_jobs" as "companies").select("id").eq("status","failed");
    const ids = ((failed ?? []) as Array<Record<string,string>>).map(j => j.id);
    if (ids.length > 0) await sb.from("image_generation_jobs" as "companies").update({status:"archived"} as unknown as Record<string,unknown>).in("id",ids);
    results.cleaned_failed_jobs = ids.length;
  }

  return NextResponse.json({ success: true, action, results });
}
