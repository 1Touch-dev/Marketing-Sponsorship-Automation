import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const email = searchParams.get("email");
  const token = searchParams.get("token");

  if (!email) {
    return new NextResponse("<html><body><h2>Invalid unsubscribe link</h2></body></html>", { headers: { "content-type": "text/html; charset=utf-8" } });
  }

  const sb = supabaseAdmin();

  // Log unsubscribe
  await sb.from("audit_logs").insert({
    action: "newsletter.unsubscribed",
    entity_type: "contact",
    entity_id: email,
    metadata: { email, token, timestamp: new Date().toISOString() },
  });

  return new NextResponse(`
    <html lang="pt-BR">
    <head><meta charset="utf-8"><title>Descadastro realizado</title><style>body{font-family:sans-serif;display:flex;align-items:center;justify-content:center;min-height:100vh;background:#f9fafb;margin:0}div{text-align:center;max-width:400px;padding:40px;background:white;border-radius:16px;box-shadow:0 1px 3px rgba(0,0,0,0.1)}</style></head>
    <body><div>
      <div style="font-size:48px;margin-bottom:16px">✅</div>
      <h2 style="color:#1a1a1a;margin-bottom:8px">Descadastro realizado</h2>
      <p style="color:#6b7280;line-height:1.6">O email <strong>${email}</strong> foi removido da nossa lista de newsletters. Você não receberá mais comunicações da Coritiba FC.</p>
    </div></body></html>
  `, { headers: { "content-type": "text/html; charset=utf-8" } });
}
