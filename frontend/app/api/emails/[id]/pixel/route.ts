import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";
import { resolveTenantId } from "@/lib/tenants/current";
import { recordMessageEventSafe } from "@/lib/messaging/store";
import { externalActor } from "@/lib/identity/actor";
import { recordAudit } from "@/lib/audit/log";
import { logFingerprint } from "@/lib/identity/privacy";

// 1x1 transparent GIF
const PIXEL = Buffer.from("R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7", "base64");

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const sb = supabaseAdmin();

  const ua = req.headers.get("user-agent") ?? "";
  const isBot = /bot|crawler|spider|preview|fetch|curl/i.test(ua);

  if (!isBot) {
    // No session on this public route (an email open-tracking pixel) —
    // resolves to the seeded Coritiba tenant for now.
    const tenantId = await resolveTenantId();

    try {
      await recordAudit({
        actor: externalActor("email recipient", `email:${params.id}`),
        tenant_id: tenantId,
        action: "email.opened",
        entity_type: "email",
        entity_id: params.id,
        metadata: {
          user_agent: ua,
          ip_fingerprint: logFingerprint(req.headers.get("x-forwarded-for")?.split(",")[0]),
          timestamp: new Date().toISOString(),
        },
      });
    } catch { /* non-fatal */ }

    // The recipient's own mail client fetched the pixel: a fact from outside this platform.
    await recordMessageEventSafe(sb, tenantId, params.id, {
      event_type: "opened", source: "platform", detail: { via: "open_pixel", user_agent: ua },
    });

    try {
      await sb.from("emails")
        .update({ status: "opened", opened_at: new Date().toISOString() })
        .eq("id", params.id)
        .eq("tenant_id", tenantId)
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
