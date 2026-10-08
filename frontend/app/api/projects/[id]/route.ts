import { NextResponse } from "next/server";
import { z } from "zod";
import { supabaseAdmin } from "@/lib/supabase/server";
import { resolveTenantId } from "@/lib/tenants/current";
import { requirePermission } from "@/lib/auth/server-permission";
import { recordAudit } from "@/lib/audit/log";
import { getProject, updateProject } from "@/lib/projects/store";
import { userActor } from "@/lib/identity/actor";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** One project: its status, what can be done next, the facts that block completion, and its history. */
export async function GET(_req: Request, ctx: { params: { id: string } }) {
  const res = await getProject(supabaseAdmin(), await resolveTenantId(), ctx.params.id);
  if (!res.ok) return NextResponse.json({ error: res.error }, { status: res.status });
  return NextResponse.json({ data: res.value });
}

const schema = z.object({
  owner_email: z.string().max(200).optional(),
  next_action: z.string().max(1000).optional(),
  title: z.string().max(200).optional(),
  description: z.string().max(2000).nullish(),
  external_system: z.string().max(60).nullish(),
  external_id: z.string().max(200).nullish(),
});

/** Day-to-day changes only: owner, next action, title, notes, and the pointer to the system that runs the tasks. Type, links and dates are fixed. */
export async function PATCH(req: Request, ctx: { params: { id: string } }) {
  const auth = await requirePermission("manage_projects");
  if ("error" in auth) return auth.error;
  const parsed = schema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: "Invalid payload", issues: parsed.error.issues }, { status: 400 });

  const res = await updateProject(supabaseAdmin(), auth.user.tenant_id, ctx.params.id, parsed.data);
  if (!res.ok) return NextResponse.json({ error: res.error }, { status: res.status });
  await recordAudit({ actor: userActor(auth.user), entity_type: "project", entity_id: ctx.params.id, action: "project.updated", actor_email: auth.user.email, tenant_id: auth.user.tenant_id, metadata: { fields: Object.keys(parsed.data), actor_user_id: auth.user.id } });
  return NextResponse.json({ ok: true });
}
