import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";
import { resolveTenantId } from "@/lib/tenants/current";
import { loadCompanyIndex } from "@/lib/accounts/store";
import { findCandidates, findGroups } from "@/lib/accounts/dedup";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Duplicate review. Without a query it returns groups across the account list:
 * "same_entity" (probably one company entered twice) and "related" (possibly a
 * parent and its subsidiary, which must stay separate accounts). With
 * ?company_id= it returns the candidates for one company. Nothing is merged.
 */
export async function GET(req: Request) {
  const tenantId = await resolveTenantId();
  const index = await loadCompanyIndex(supabaseAdmin(), tenantId);
  const companyId = new URL(req.url).searchParams.get("company_id");

  if (companyId) {
    const probe = index.find((c) => c.id === companyId);
    if (!probe) return NextResponse.json({ error: "Company not found" }, { status: 404 });
    return NextResponse.json({ candidates: findCandidates(probe, index.filter((c) => !c.duplicate_of_id)).map((c) => ({ id: c.company.id, company_name: c.company.company_name, ...c.verdict })) });
  }

  const groups = findGroups(index);
  return NextResponse.json({
    as_of: new Date().toISOString(),
    companies: index.length,
    summary: { same_entity_groups: groups.filter((g) => g.kind === "same_entity").length, related_groups: groups.filter((g) => g.kind === "related").length },
    groups: groups.map((g) => ({ kind: g.kind, reasons: g.reasons, members: g.members.map((m) => ({ id: m.id, company_name: m.company_name, domain: m.domain ?? null, parent_company_id: m.parent_company_id ?? null })) })),
  });
}
