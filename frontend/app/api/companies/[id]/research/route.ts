import { NextResponse } from "next/server";
import { z } from "zod";
import { supabaseAdmin } from "@/lib/supabase/server";
import { requirePermission } from "@/lib/auth/server-permission";
import { recordAudit } from "@/lib/audit/log";
import { recordResearch } from "@/lib/accounts/store";
import { RECOMMENDATIONS } from "@/lib/accounts/research";

export const runtime = "nodejs";

const schema = z.object({
  summary: z.string().min(1).max(4000),
  recommendation: z.enum(RECOMMENDATIONS),
  evidence: z.array(z.object({
    claim: z.string().max(1000),
    source_name: z.string().max(300).optional(),
    source_url: z.string().max(1000).optional(),
    retrieved_at: z.string().max(40).optional(),
    confidence: z.enum(["high", "medium", "low"]).optional(),
  })).max(50),
  unverified: z.array(z.string().max(500)).max(50).optional(),
});

/** A person records cited research. Research makes an account "researched"; it never makes it a sales opportunity. */
export async function POST(req: Request, ctx: { params: { id: string } }) {
  const auth = await requirePermission("run_intelligence");
  if ("error" in auth) return auth.error;

  const parsed = schema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: "Invalid payload", issues: parsed.error.issues }, { status: 400 });

  const res = await recordResearch(supabaseAdmin(), auth.user.tenant_id, ctx.params.id, { ...parsed.data, kind: "human", by: auth.user.email });
  if (!res.ok) return NextResponse.json({ error: res.error }, { status: res.status });

  await recordAudit({ entity_type: "company", entity_id: ctx.params.id, action: "company.research_recorded", actor_email: auth.user.email, tenant_id: auth.user.tenant_id, metadata: { research_id: res.value.id, recommendation: parsed.data.recommendation, actor_user_id: auth.user.id } });
  return NextResponse.json({ research_id: res.value.id }, { status: 201 });
}
