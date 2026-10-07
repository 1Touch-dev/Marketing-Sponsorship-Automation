import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";
import { resolveTenantId } from "@/lib/tenants/current";
import { loadOutreachContext } from "@/lib/playbooks/store";
import { checkPlaybook, PLAYBOOK_IDS, PLAYBOOKS } from "@/lib/playbooks/definitions";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** What to send this company: the recommended playbook and why, and which playbooks are open to use. */
export async function GET(_req: Request, ctx: { params: { id: string } }) {
  const tenantId = await resolveTenantId();
  const c = await loadOutreachContext(supabaseAdmin(), tenantId, ctx.params.id);
  if (!c) return NextResponse.json({ error: "Company not found" }, { status: 404 });

  return NextResponse.json({
    company: c.company.company_name,
    stage: c.stage,
    first_touch: c.firstTouch,
    has_approved_proposal: c.hasApprovedProposal,
    recommended: c.recommendation,
    playbooks: PLAYBOOK_IDS.map((id) => {
      // A person is asking, and the supplied detail is checked at send time, so ignore it here.
      const check = checkPlaybook({ playbook: id, stage: c.stage, firstTouch: c.firstTouch, hasApprovedProposal: c.hasApprovedProposal, detail: "ok-detail", actor: { kind: "human", email: "person" } });
      return { id, label: PLAYBOOKS[id].label, description: PLAYBOOKS[id].description, relationship_first: PLAYBOOKS[id].relationshipFirst, needs_detail: PLAYBOOKS[id].requiresDetail, available: check.allowed, unavailable_reason: check.reason ?? null, note: check.note ?? null };
    }),
  });
}
