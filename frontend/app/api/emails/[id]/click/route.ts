import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";
import { resolveTenantId } from "@/lib/tenants/current";

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const { searchParams } = new URL(req.url);
  const targetUrl = searchParams.get("url");

  if (!targetUrl) {
    return NextResponse.redirect("/");
  }

  const sb = supabaseAdmin();
  const ua = req.headers.get("user-agent") ?? "";
  const isBot = /bot|crawler|spider|preview|fetch|curl/i.test(ua);

  if (!isBot) {
    // No session on this public route (an email recipient clicked a
    // tracked link) — resolves to the seeded Coritiba tenant for now.
    const tenantId = await resolveTenantId();

    // Log click event — fire and forget
    void sb.from("audit_logs").insert({
      tenant_id: tenantId,
      action: "email.clicked",
      entity_type: "email",
      entity_id: params.id,
      metadata: {
        url: targetUrl,
        user_agent: ua,
        ip: req.headers.get("x-forwarded-for")?.split(",")[0] ?? "",
        timestamp: new Date().toISOString(),
      },
    });

    // Update clicked_at on email (only first click) — fire and forget
    void sb.from("emails")
      .update({ clicked_at: new Date().toISOString() })
      .eq("id", params.id)
      .eq("tenant_id", tenantId)
      .is("clicked_at", null);
  }

  return NextResponse.redirect(targetUrl);
}
