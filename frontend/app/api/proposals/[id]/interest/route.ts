import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const body = await req.json();
  const sb = supabaseAdmin();

  await sb.from("audit_logs").insert({
    action: "proposal.interest_submitted",
    entity_type: "proposal",
    entity_id: params.id,
    metadata: {
      contact_name: body.name,
      contact_email: body.email,
      contact_phone: body.phone,
      company: body.company,
      message: body.message,
      lgpd_consent: body.lgpdConsent,
    },
  });

  return NextResponse.json({ ok: true });
}
