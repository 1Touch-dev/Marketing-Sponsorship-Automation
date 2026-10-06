import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";
import { resolveTenantId } from "@/lib/tenants/current";
import { loadSponsorClaims } from "@/lib/claims/sponsor-claims";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Club facts now live in the claims registry (lib/claims, /api/claims). This
 * endpoint is kept read-only for existing callers and returns only the facts
 * that are verified and in date, in the old shape.
 */
export async function GET(req: Request) {
  const tenantId = await resolveTenantId();
  const category = new URL(req.url).searchParams.get("category");
  const { claims, available } = await loadSponsorClaims(supabaseAdmin(), tenantId);
  if (!available) return NextResponse.json({ data: [], migration_needed: true });

  const data = Object.values(claims)
    .filter((c) => !category || c.key.startsWith(`${category}.`))
    .map((c) => ({ key: c.key, metric_name: c.label, metric_value: c.value, source: c.source, as_of: c.asOf, expires_at: c.expiresAt }));
  return NextResponse.json({ data });
}

/**
 * Writing here used to change a table that no sponsor-facing page or AI prompt
 * read, and that had no source, owner or review. Facts are now added and
 * verified through the claims registry.
 */
export async function POST() {
  return NextResponse.json(
    { error: "Club facts are managed in the claims registry. Use POST /api/claims (or the Claims registry page)." },
    { status: 410 },
  );
}
