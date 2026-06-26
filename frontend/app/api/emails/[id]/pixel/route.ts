import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";

// 1x1 transparent GIF
const PIXEL = Buffer.from("R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7", "base64");

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const sb = supabaseAdmin();

  const ua = req.headers.get("user-agent") ?? "";
  const isBot = /bot|crawler|spider|preview|fetch|curl/i.test(ua);

  if (!isBot) {
    try {
      await sb.from("audit_logs").insert({
        action: "email.opened",
        entity_type: "email",
        entity_id: params.id,
        metadata: {
          user_agent: ua,
          ip: req.headers.get("x-forwarded-for")?.split(",")[0] ?? "",
          timestamp: new Date().toISOString(),
        },
      });
    } catch { /* non-fatal */ }

    try {
      await sb.from("emails")
        .update({ status: "opened", opened_at: new Date().toISOString() })
        .eq("id", params.id)
        .is("opened_at", null);
    } catch { /* non-fatal */ }
  }

  return new NextResponse(PIXEL, {
    headers: {
      "Content-Type": "image/gif",
      "Cache-Control": "no-cache, no-store, must-revalidate",
      "Pragma": "no-cache",
    },
  });
}
