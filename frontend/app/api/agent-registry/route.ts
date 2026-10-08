import { NextResponse } from "next/server";
import { z } from "zod";
import { supabaseAdmin } from "@/lib/supabase/server";
import { requirePermission } from "@/lib/auth/server-permission";
import { recordAudit } from "@/lib/audit/log";
import { userActor } from "@/lib/identity/actor";
import { createDefinition, listRegistry } from "@/lib/agents/registry";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Every agent: its definition, its versions (live, retired or not yet promoted), and what it is assigned to do, where. */
export async function GET() {
  const auth = await requirePermission("view_audit");
  if ("error" in auth) return auth.error;
  const res = await listRegistry(supabaseAdmin(), auth.user.tenant_id);
  if (!res.ok) return NextResponse.json({ error: res.error }, { status: res.status });
  return NextResponse.json({ total: res.value.length, data: res.value });
}

const schema = z.object({ key: z.string().regex(/^[a-z][a-z0-9-]{2,60}$/), name: z.string().min(1).max(120), description: z.string().max(1000).nullish(), runtime: z.enum(["orchestrator", "langgraph", "service"]) });

/** Register a new agent. It can do nothing until a version is promoted and it is assigned a scope. */
export async function POST(req: Request) {
  const auth = await requirePermission("manage_agents");
  if ("error" in auth) return auth.error;
  const parsed = schema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: "Invalid payload", issues: parsed.error.issues }, { status: 400 });
  const res = await createDefinition(supabaseAdmin(), auth.user.tenant_id, parsed.data, auth.user.email);
  if (!res.ok) return NextResponse.json({ error: res.error }, { status: res.status });
  await recordAudit({ actor: userActor(auth.user), entity_type: "agent", entity_id: res.value.id, action: "agent.registered", metadata: { key: parsed.data.key } });
  return NextResponse.json({ id: res.value.id }, { status: 201 });
}
