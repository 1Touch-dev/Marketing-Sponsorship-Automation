import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";
import { resolveTenantId } from "@/lib/tenants/current";
import { loadDelivery } from "@/lib/messaging/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** What actually happened to this email: the derived state and the recorded facts behind it. */
export async function GET(_req: Request, ctx: { params: { id: string } }) {
  const tenantId = await resolveTenantId();
  const delivery = await loadDelivery(supabaseAdmin(), tenantId, ctx.params.id);
  if (!delivery) return NextResponse.json({ error: "Email not found" }, { status: 404 });
  return NextResponse.json({ delivery: delivery.view, events: delivery.events });
}
