import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";
import { resolveTenantId } from "@/lib/tenants/current";
import { resolveClubContext } from "@/lib/tenants/club-context";
import { externalActor } from "@/lib/identity/actor";
import { recordAudit } from "@/lib/audit/log";
import { logFingerprint } from "@/lib/identity/privacy";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const email = searchParams.get("email");
  const token = searchParams.get("token");

  if (!email) {
    return new NextResponse("<html><body><h2>Invalid unsubscribe link</h2></body></html>", { headers: { "content-type": "text/html; charset=utf-8" } });
  }

  const sb = supabaseAdmin();
  // No session on this public route (an email recipient clicking an
  // unsubscribe link) — resolves to the seeded Coritiba tenant for now.
  const tenantId = await resolveTenantId();
  const tenant = await resolveClubContext(tenantId);
  const clubName = tenant.club_facts.short_name ?? tenant.club_facts.club_name;

  // Log unsubscribe
  // The address is a person's data and the log is permanent, so only a fingerprint of it is written here.
  await recordAudit({
    actor: externalActor("newsletter recipient", `recipient:${logFingerprint(email)}`),
    tenant_id: tenantId,
    action: "newsletter.unsubscribed",
    entity_type: "contact",
    entity_id: null,
    metadata: { email_fingerprint: logFingerprint(email), timestamp: new Date().toISOString() },
  });

  return new NextResponse(`
    <html lang="pt-BR">
    <head><meta charset="utf-8"><title>Descadastro realizado</title><style>body{font-family:sans-serif;display:flex;align-items:center;justify-content:center;min-height:100vh;background:#f9fafb;margin:0}div{text-align:center;max-width:400px;padding:40px;background:white;border-radius:16px;box-shadow:0 1px 3px rgba(0,0,0,0.1)}</style></head>
    <body><div>
      <div style="font-size:48px;margin-bottom:16px">✅</div>
      <h2 style="color:#1a1a1a;margin-bottom:8px">Descadastro realizado</h2>
      <p style="color:#6b7280;line-height:1.6">O email <strong>${email}</strong> foi removido da nossa lista de newsletters. Você não receberá mais comunicações da ${clubName}.</p>
    </div></body></html>
  `, { headers: { "content-type": "text/html; charset=utf-8" } });
}
