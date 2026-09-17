import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";
import { recordAudit } from "@/lib/audit/log";
import { gateCookieName, signGateToken } from "@/lib/proposals/access-gate";

export const runtime = "nodejs";

/**
 * POST /api/proposals/view/[token]/verify-gate
 * Public, unauthenticated (the share token itself is the capability).
 * Body: { passcode?: string; nda_name?: string; nda_accepted?: boolean }
 */
export async function POST(req: NextRequest, { params }: { params: { token: string } }) {
  const sb = supabaseAdmin();
  const { data: proposal } = await sb
    .from("proposals")
    .select("id, tenant_id, access_gate_enabled, access_gate_type, access_gate_passcode")
    .eq("share_token", params.token)
    .maybeSingle();

  if (!proposal) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (!(proposal as unknown as { access_gate_enabled: boolean }).access_gate_enabled) {
    return NextResponse.json({ ok: true });
  }

  const gate = proposal as unknown as {
    id: string;
    tenant_id: string;
    access_gate_type: "passcode" | "nda";
    access_gate_passcode: string | null;
  };

  const body = await req.json().catch(() => ({}));

  if (gate.access_gate_type === "passcode") {
    const provided = typeof body.passcode === "string" ? body.passcode.trim() : "";
    if (!gate.access_gate_passcode || provided !== gate.access_gate_passcode) {
      return NextResponse.json({ error: "Senha incorreta." }, { status: 401 });
    }
  } else {
    if (!body.nda_accepted || !body.nda_name || !String(body.nda_name).trim()) {
      return NextResponse.json({ error: "Nome e aceite do NDA são obrigatórios." }, { status: 400 });
    }
    await recordAudit({
      entity_type: "proposal",
      entity_id: gate.id,
      action: "proposal.nda_accepted",
      tenant_id: gate.tenant_id,
      metadata: { name: body.nda_name },
    });
  }

  const res = NextResponse.json({ ok: true });
  res.cookies.set(gateCookieName(params.token), signGateToken(params.token), {
    httpOnly: true,
    secure: req.url.startsWith("https://"),
    sameSite: "lax",
    maxAge: 60 * 60 * 24 * 30,
    path: "/",
  });
  return res;
}
