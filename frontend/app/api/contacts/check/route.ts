import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";
import { resolveTenantId } from "@/lib/tenants/current";
import { checkRecipient } from "@/lib/contacts/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Can this email address be contacted? ?email=...  Returns the reasons when it cannot. */
export async function GET(req: Request) {
  const email = new URL(req.url).searchParams.get("email")?.trim();
  if (!email) return NextResponse.json({ error: "email is required" }, { status: 400 });
  const tenantId = await resolveTenantId();
  const v = await checkRecipient(supabaseAdmin(), tenantId, { email });
  return NextResponse.json({ email: email.toLowerCase(), can_contact: v.allowed, blocks: v.blocks, warnings: v.warnings, channel: v.channel, enforced: v.enforced });
}
