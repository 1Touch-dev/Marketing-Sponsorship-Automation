import { NextResponse } from "next/server";
import { z } from "zod";
import { supabaseAdmin } from "@/lib/supabase/server";
import { requirePermission } from "@/lib/auth/server-permission";
import { recordAudit } from "@/lib/audit/log";
import { recordChannelCheck } from "@/lib/contacts/store";
import { userActor } from "@/lib/identity/actor";

export const runtime = "nodejs";

const schema = z.object({ channel: z.enum(["email", "phone", "linkedin", "whatsapp"]), outcome: z.enum(["verified", "bounced", "invalid"]), note: z.string().max(500).nullish() });

/** A person confirms (or marks dead) one of a contact's channels. The value checked is the one on file for the contact. */
export async function POST(req: Request, ctx: { params: { id: string } }) {
  const auth = await requirePermission("manage_contacts");
  if ("error" in auth) return auth.error;
  const parsed = schema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: "Invalid payload", issues: parsed.error.issues }, { status: 400 });

  const sb = supabaseAdmin();
  const { data: contact } = await sb.from("contacts").select("id, email, phone, linkedin_url").eq("id", ctx.params.id).eq("tenant_id", auth.user.tenant_id).maybeSingle();
  if (!contact) return NextResponse.json({ error: "Contact not found" }, { status: 404 });
  const value = parsed.data.channel === "email" ? contact.email : parsed.data.channel === "linkedin" ? contact.linkedin_url : contact.phone;
  if (!value) return NextResponse.json({ error: `This contact has no ${parsed.data.channel} on file.` }, { status: 400 });

  const res = await recordChannelCheck(sb, auth.user.tenant_id, { contactId: contact.id, channel: parsed.data.channel, value, outcome: parsed.data.outcome, method: "person", checkedBy: auth.user.email, note: parsed.data.note });
  if (!res.ok) return NextResponse.json({ error: res.error }, { status: res.status });
  await recordAudit({ actor: userActor(auth.user), entity_type: "contact", entity_id: contact.id, action: `contact.channel_${parsed.data.outcome}`, actor_email: auth.user.email, tenant_id: auth.user.tenant_id, metadata: { channel: parsed.data.channel, actor_user_id: auth.user.id } });
  return NextResponse.json({ check_id: res.value.id }, { status: 201 });
}
