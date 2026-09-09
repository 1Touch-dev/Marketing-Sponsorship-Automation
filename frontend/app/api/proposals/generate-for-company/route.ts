import { NextResponse } from "next/server";
import { z } from "zod";
import { generatePersonalizedProposalForCompany } from "@/lib/proposals/generate-for-company";
import { checkRateLimit, getClientIp } from "@/lib/rate-limit";
import { requirePermission } from "@/lib/auth/server-permission";

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
