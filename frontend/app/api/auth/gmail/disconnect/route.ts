import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";
import { recordAudit } from "@/lib/audit/log";
import { decryptSecret } from "@/lib/security/secret-crypto";
import { serverEnv } from "@/lib/env";

export const runtime = "nodejs";

/**
 * POST /api/auth/gmail/disconnect
 *
 * Hardening pass (master_report.md Section 8, Pattern 6 — one-click
 * integration kill switch). Revokes the token at Google (so it can't be
 * used again even if a copy leaked) and clears it from our own storage.
 * Best-effort on the Google side — even if revocation fails or Google is
 * unreachable, local tokens are still cleared so the app stops using them.
 */
export async function POST() {
  const senderEmail = serverEnv().DEFAULT_FROM_EMAIL;
  if (!senderEmail) {
    return NextResponse.json({ error: "DEFAULT_FROM_EMAIL not configured" }, { status: 400 });
  }

  const sb = supabaseAdmin();
  const { data: user } = await sb
    .from("users")
    .select("id, email, metadata")
    .eq("email", senderEmail)
    .maybeSingle();

  const tokens = (user?.metadata as Record<string, unknown> | undefined)?.gmail_tokens as
    | { access_token?: string | null; refresh_token?: string | null; connected_email?: string | null }
    | undefined;

  if (!tokens) {
    return NextResponse.json({ success: true, was_connected: false });
  }

  let revoked = false;
  const tokenToRevoke = tokens.refresh_token ?? tokens.access_token;
  if (tokenToRevoke) {
    try {
      const plain = decryptSecret(tokenToRevoke);
      const res = await fetch("https://oauth2.googleapis.com/revoke", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: `token=${encodeURIComponent(plain)}`,
      });
      revoked = res.ok;
      if (!res.ok) {
        console.warn("[gmail-disconnect] Google revoke returned", res.status);
      }
    } catch (err) {
      console.warn("[gmail-disconnect] revoke request failed:", err instanceof Error ? err.message : err);
    }
  }

  const { error: upErr } = await sb
    .from("users")
    .update({ metadata: {} })
    .eq("email", senderEmail);

  if (upErr) {
    return NextResponse.json({ error: upErr.message }, { status: 500 });
  }

  await recordAudit({
    entity_type: "user",
    action: "gmail.disconnected",
    actor_email: senderEmail,
    metadata: { connected_email: tokens.connected_email ?? senderEmail, revoked_at_google: revoked },
  });

  return NextResponse.json({ success: true, was_connected: true, revoked_at_google: revoked });
}
