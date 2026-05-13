import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { exchangeCodeForTokens, gmailClientFromTokens } from "@/lib/gmail/client";
import { supabaseAdmin } from "@/lib/supabase/server";
import { recordAudit } from "@/lib/audit/log";
import { resolveAppUrl } from "@/lib/url";

export const runtime = "nodejs";

/**
 * GET /api/auth/gmail/callback
 *
 * Receives the authorization code from Google, exchanges it for tokens,
 * persists them in public.users.metadata, then redirects back to the
 * Settings page using the PUBLIC app URL (not req.url, which would be
 * localhost:3000 when running behind ngrok or any reverse proxy).
 */
export async function GET(req: Request) {
  // Resolve the canonical public base URL once — used for all redirects
  const baseUrl = resolveAppUrl(req);

  const url = new URL(req.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const expected = cookies().get("gmail_oauth_state")?.value;

  // Log resolved base URL (safe — no secrets)
  console.log(`[gmail-callback] baseUrl = ${baseUrl}`);

  if (!code) {
    return NextResponse.redirect(`${baseUrl}/settings?gmail=error&reason=missing_code`);
  }
  if (!state || !expected || state !== expected) {
    return NextResponse.redirect(`${baseUrl}/settings?gmail=error&reason=invalid_state`);
  }

  let tokens;
  try {
    tokens = await exchangeCodeForTokens(code);
  } catch (err) {
    console.error("[gmail-callback] token exchange failed:", err instanceof Error ? err.message : err);
    return NextResponse.redirect(`${baseUrl}/settings?gmail=error&reason=token_exchange_failed`);
  }

  // Identify the connected Gmail account
  let emailAddress = "";
  try {
    const gmail = gmailClientFromTokens(tokens);
    const profile = await gmail.users.getProfile({ userId: "me" });
    emailAddress = profile.data.emailAddress ?? "";
  } catch (err) {
    console.error("[gmail-callback] profile fetch failed:", err instanceof Error ? err.message : err);
    return NextResponse.redirect(`${baseUrl}/settings?gmail=error&reason=profile_fetch_failed`);
  }
  if (!emailAddress) {
    return NextResponse.redirect(`${baseUrl}/settings?gmail=error&reason=no_email`);
  }

  // Persist tokens
  const sb = supabaseAdmin();
  const { error: upErr } = await sb.from("users").upsert(
    {
      email: emailAddress,
      role: "admin",
      metadata: { gmail_tokens: tokens },
    },
    { onConflict: "email" },
  );
  if (upErr) {
    console.error("[gmail-callback] token persist failed:", upErr.message);
    return NextResponse.redirect(`${baseUrl}/settings?gmail=error&reason=persist_failed`);
  }

  await recordAudit({
    entity_type: "user",
    action: "gmail.connected",
    actor_email: emailAddress,
  });

  console.log(`[gmail-callback] connected ${emailAddress} → redirecting to ${baseUrl}/settings?gmail=connected`);
  return NextResponse.redirect(`${baseUrl}/settings?gmail=connected`);
}
