import { NextResponse } from "next/server";
import { z } from "zod";
import { generatePersonalizedProposalForCompany } from "@/lib/proposals/generate-for-company";
import { checkRateLimit, getClientIp } from "@/lib/rate-limit";
import { requirePermission } from "@/lib/auth/server-permission";
import { supabaseAdmin } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const maxDuration = 120;

const schema = z.object({
  company_id: z.string().uuid(),
});

export async function POST(req: Request) {
  const auth = await requirePermission("create_proposal");
  if ("error" in auth) return auth.error;

  const ip = getClientIp(req);
  const rl = checkRateLimit(`proposal-gen-company:${ip}`, { max: 10, windowMs: 60_000 });
  if (!rl.ok) return NextResponse.json({ error: rl.message }, { status: 429 });

  const body = await req.json().catch(() => ({}));
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "company_id required" }, { status: 400 });
  }

  // The library function derives the tenant from the target company's own
  // row (correct for the agent-orchestrator call path too), but that alone
  // would let a caller from a DIFFERENT tenant trigger generation against
  // another tenant's company — no data leaks (still tagged correctly), but
  // an unauthorized cross-tenant action. Verify ownership here first.
  const { data: targetCompany } = await supabaseAdmin()
    .from("companies")
    .select("id")
    .eq("id", parsed.data.company_id)
    .eq("tenant_id", auth.user.tenant_id)
    .maybeSingle();
  if (!targetCompany) {
    return NextResponse.json({ error: "Company not found" }, { status: 404 });
  }

  try {
    const result = await generatePersonalizedProposalForCompany(parsed.data.company_id);
    return NextResponse.json({ data: result });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Proposal generation failed" },
      { status: 500 },
    );
  }
}
