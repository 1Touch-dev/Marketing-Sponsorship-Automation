import { NextResponse } from "next/server";
import { z } from "zod";
import { supabaseAdmin } from "@/lib/supabase/server";
import { requirePermission } from "@/lib/auth/server-permission";
import { recordAudit } from "@/lib/audit/log";
import { userActor } from "@/lib/identity/actor";
import { installStandardAgents } from "@/lib/agents/registry";
import { idempotent } from "@/lib/idempotency";

export const runtime = "nodejs";

const schema = z.object({ assign: z.boolean().optional() });

/**
 * POST /api/agent-registry/install-standard   { assign?: boolean }
 * Registers the standard agents in this workspace. A new workspace starts with none, and an agent that is not registered
 * and assigned is refused everything. By default they are installed with NO authority; pass assign=true to give each
 * its standard workspace-wide assignment (you are recorded as the one who chose that).
 */
async function postHandler(req: Request) {
  const auth = await requirePermission("manage_agents");
  if ("error" in auth) return auth.error;
  const parsed = schema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: "Invalid payload", issues: parsed.error.issues }, { status: 400 });
  const res = await installStandardAgents(supabaseAdmin(), auth.user.tenant_id, auth.user.email, parsed.data.assign === true);
  if (!res.ok) return NextResponse.json({ error: res.error }, { status: res.status });
  await recordAudit({ actor: userActor(auth.user), entity_type: "agent", action: "agent.standard_installed", metadata: { installed: res.value.installed, skipped: res.value.skipped, assigned: res.value.assigned } });
  return NextResponse.json(res.value, { status: res.value.installed.length > 0 ? 201 : 200 });
}

export const POST = idempotent("agent-registry.install-standard", postHandler);
