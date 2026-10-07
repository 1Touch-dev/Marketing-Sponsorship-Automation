import { NextResponse } from "next/server";
import { z } from "zod";
import { supabaseAdmin } from "@/lib/supabase/server";
import { resolveTenantId } from "@/lib/tenants/current";
import { requirePermission } from "@/lib/auth/server-permission";
import { recordAudit } from "@/lib/audit/log";
import { checkDiscoveryGate, listBriefs, saveBrief } from "@/lib/briefs/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** The gate status for this company (can a proposal be generated?) and its briefs, newest first. */
export async function GET(_req: Request, ctx: { params: { id: string } }) {
  const tenantId = await resolveTenantId();
  const sb = supabaseAdmin();
  const { data: company } = await sb.from("companies").select("id, company_name").eq("id", ctx.params.id).eq("tenant_id", tenantId).maybeSingle();
  if (!company) return NextResponse.json({ error: "Company not found" }, { status: 404 });

  const gate = await checkDiscoveryGate(sb, tenantId, company.id, company.company_name);
  const briefs = await listBriefs(sb, tenantId, company.id);
  return NextResponse.json({
    gate: { ok: gate.ok, enforced: gate.enforced, level: gate.level, missing: gate.missing, message: gate.message },
    briefs: briefs.ok ? briefs.value : [],
  });
}

const evidence = z.object({
  claim: z.string().max(1000),
  source_name: z.string().max(300).optional(),
  source_url: z.string().max(1000).optional(),
  retrieved_at: z.string().max(40).optional(),
  confidence: z.enum(["high", "medium", "low"]).optional(),
});

const schema = z.object({
  level: z.enum(["quick", "full"]),
  objective: z.string().max(2000),
  period_start: z.string().max(10),
  period_end: z.string().max(10),
  contact_name: z.string().max(200),
  contact_email: z.string().max(200).nullish(),
  next_action: z.string().max(1000),
  next_action_due: z.string().max(10).nullish(),
  why_sponsor: z.string().max(3000).nullish(),
  why_package: z.string().max(3000).nullish(),
  evidence: z.array(evidence).max(50).optional(),
  unverified: z.array(z.string().max(500)).max(50).optional(),
  opportunity_id: z.string().uuid().nullish(),
  research_id: z.string().uuid().nullish(),
});

/** A person writes a brief. A quick brief is enough to unlock proposal generation; a full brief adds cited research. */
export async function POST(req: Request, ctx: { params: { id: string } }) {
  const auth = await requirePermission("create_proposal");
  if ("error" in auth) return auth.error;

  const parsed = schema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: "Invalid payload", issues: parsed.error.issues }, { status: 400 });

  const res = await saveBrief(supabaseAdmin(), auth.user.tenant_id, ctx.params.id, parsed.data, auth.user.email);
  if (!res.ok) return NextResponse.json({ error: res.error }, { status: res.status });

  await recordAudit({ entity_type: "company", entity_id: ctx.params.id, action: "company.brief_written", actor_email: auth.user.email, tenant_id: auth.user.tenant_id, metadata: { brief_id: res.value.id, level: parsed.data.level, actor_user_id: auth.user.id } });
  return NextResponse.json({ brief_id: res.value.id }, { status: 201 });
}
