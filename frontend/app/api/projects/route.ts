import { NextResponse } from "next/server";
import { z } from "zod";
import { supabaseAdmin } from "@/lib/supabase/server";
import { resolveTenantId } from "@/lib/tenants/current";
import { requirePermission } from "@/lib/auth/server-permission";
import { recordAudit } from "@/lib/audit/log";
import { createProject, listProjects } from "@/lib/projects/store";
import { PROJECT_TYPES } from "@/lib/projects/model";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Projects, filterable by ?type=commercial|delivery, ?status= and ?company_id=, with counts. */
export async function GET(req: Request) {
  const u = new URL(req.url).searchParams;
  const res = await listProjects(supabaseAdmin(), await resolveTenantId(), { type: u.get("type"), status: u.get("status"), companyId: u.get("company_id") });
  if (!res.ok) return NextResponse.json({ error: res.error }, { status: res.status });
  const byStatus: Record<string, number> = {};
  const byType: Record<string, number> = {};
  for (const p of res.value) { byStatus[p.status] = (byStatus[p.status] ?? 0) + 1; byType[p.project_type] = (byType[p.project_type] ?? 0) + 1; }
  return NextResponse.json({ summary: { total: res.value.length, by_status: byStatus, by_type: byType }, data: res.value });
}

const schema = z.object({
  type: z.enum(PROJECT_TYPES),
  company_id: z.string().uuid(),
  title: z.string().max(200).nullish(),
  description: z.string().max(2000).nullish(),
  owner_email: z.string().max(200).nullish(),
  opportunity_id: z.string().uuid().nullish(),
  proposal_id: z.string().uuid().nullish(),
  contract_id: z.string().uuid().nullish(),
  objective: z.string().max(2000).nullish(),
  target_date: z.string().max(10).nullish(),
  next_action: z.string().max(1000).nullish(),
  period_start: z.string().max(10).nullish(),
  period_end: z.string().max(10).nullish(),
});

/** Open a commercial or a delivery project. Each type has its own required fields; what is missing is listed in the refusal. */
export async function POST(req: Request) {
  const auth = await requirePermission("manage_projects");
  if ("error" in auth) return auth.error;
  const parsed = schema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: "Invalid payload", issues: parsed.error.issues }, { status: 400 });

  const res = await createProject(supabaseAdmin(), auth.user.tenant_id, parsed.data, auth.user.email);
  if (!res.ok) return NextResponse.json({ error: res.error }, { status: res.status });
  await recordAudit({ entity_type: "project", entity_id: res.value.id, action: "project.created", actor_email: auth.user.email, tenant_id: auth.user.tenant_id, metadata: { type: parsed.data.type, company_id: parsed.data.company_id, actor_user_id: auth.user.id } });
  return NextResponse.json({ project_id: res.value.id, warnings: res.value.warnings }, { status: 201 });
}
