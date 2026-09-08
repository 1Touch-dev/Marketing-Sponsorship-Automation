import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { exchangeCodeForTokens, gmailClientFromTokens } from "@/lib/gmail/client";
import { supabaseAdmin } from "@/lib/supabase/server";
import { recordAudit } from "@/lib/audit/log";
import { resolveAppUrl } from "@/lib/url";
import { encryptSecret } from "@/lib/security/secret-crypto";

export const runtime = "nodejs";

/**
 * GET /api/auth/gmail/callback
 *
 * Receives the authorization code from Google, exchanges it for tokens,
 * persists them in public.users.metadata, then redirects back to the
 * Settings page using the PUBLIC app URL (not req.url, which is localhost
 * when running behind ngrok or any reverse proxy).
 *
 * Token storage format in users.metadata.gmail_tokens:
 *   {
 *     access_token, refresh_token, expiry_date, scope, token_type,
 *     connected_email,   // Gmail address that was authorized
 *     connected_at       // ISO timestamp of the authorization
 *   }
 *
 * access_token/refresh_token are stored encrypted at rest (Pattern 6
 * hardening — see lib/security/secret-crypto.ts) via encryptSecret().
 * Callers that need to actually use them with the Gmail API must run them
 * through decryptSecret() first; callers that only check presence/expiry
 * (status route, settings page) can use the stored value as-is.
 *
 * If Google does not return a new refresh_token (e.g. re-authorization),
 * the previously stored refresh_token is preserved as-is (it is already
 * encrypted from the prior write — not re-encrypted here).
 */
export async function GET(req: Request) {
  const baseUrl = resolveAppUrl(req);

  const url = new URL(req.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const expected = cookies().get("gmail_oauth_state")?.value;

  if (!code) {
    return NextResponse.redirect(`${baseUrl}/settings?gmail=error&reason=missing_code`);
  }
  if (!state || !expected || state !== expected) {
    return NextResponse.redirect(`${baseUrl}/settings?gmail=error&reason=invalid_state`);
  }

  // ── 1. Exchange code for tokens ──────────────────────────────────────────
  let tokens: Record<string, unknown>;
  try {
    tokens = (await exchangeCodeForTokens(code)) as Record<string, unknown>;
  } catch (err) {
    console.error("[gmail-callback] token exchange failed:", err instanceof Error ? err.message : err);
    return NextResponse.redirect(`${baseUrl}/settings?gmail=error&reason=token_exchange_failed`);
  }

  // ── 2. Identify connected Gmail account ──────────────────────────────────
  let emailAddress = "";
  try {
    const gmail = gmailClientFromTokens(
      tokens as { access_token?: string; refresh_token?: string; expiry_date?: number },
    );
    const profile = await gmail.users.getProfile({ userId: "me" });
    emailAddress = profile.data.emailAddress ?? "";
  } catch (err) {
    console.error("[gmail-callback] profile fetch failed:", err instanceof Error ? err.message : err);
    return NextResponse.redirect(`${baseUrl}/settings?gmail=error&reason=profile_fetch_failed`);
  }
  if (!emailAddress) {
    return NextResponse.redirect(`${baseUrl}/settings?gmail=error&reason=no_email`);
  }

  // ── 3. Preserve existing refresh_token if Google didn't return a new one ─
  const sb = supabaseAdmin();

  let existingRefreshToken: string | null = null;
  if (!tokens.refresh_token) {
    const { data: existingUser } = await sb
      .from("users")
      .select("metadata")
      .eq("email", emailAddress)
      .maybeSingle();
    const existingTokens = (existingUser?.metadata as Record<string, unknown> | undefined)
      ?.gmail_tokens as Record<string, unknown> | undefined;
    existingRefreshToken = (existingTokens?.refresh_token as string | undefined) ?? null;
    if (existingRefreshToken) {
      console.log("[gmail-callback] no new refresh_token — preserving existing one");
    }
  }

  // ── 4. Build enriched token payload ──────────────────────────────────────
  // access_token is always fresh plaintext from Google here — encrypt it.
  // refresh_token is either fresh plaintext from Google (encrypt it) or the
  // preserved existingRefreshToken, which is already encrypted (or legacy
  // plaintext) from a prior write — pass it through unchanged either way.
  const tokenPayload = {
    access_token:
      typeof tokens.access_token === "string" ? encryptSecret(tokens.access_token) : null,
    refresh_token:
      typeof tokens.refresh_token === "string"
        ? encryptSecret(tokens.refresh_token)
        : (existingRefreshToken ?? null),
    expiry_date: tokens.expiry_date ?? null,
    scope: tokens.scope ?? null,
    token_type: tokens.token_type ?? "Bearer",
    connected_email: emailAddress,
    connected_at: new Date().toISOString(),
  };

  // ── 5. Persist ────────────────────────────────────────────────────────────
  const { data: savedUser, error: upErr } = await sb
    .from("users")
    .upsert(
      {
        email: emailAddress,
        role: "admin",
        metadata: { gmail_tokens: tokenPayload },
      },
      { onConflict: "email" },
    )
    .select("id, email")
    .single();

  if (upErr || !savedUser) {
    console.error("[gmail-callback] token persist failed:", upErr?.message);
    return NextResponse.redirect(`${baseUrl}/settings?gmail=error&reason=persist_failed`);
  }

  console.log(
    `[gmail-callback] connected ${emailAddress} (user id: ${savedUser.id}) — has_refresh: ${!!tokenPayload.refresh_token}`,
  );

  await recordAudit({
    entity_type: "user",
    action: "gmail.connected",
    actor_email: emailAddress,
    metadata: { connected_email: emailAddress, has_refresh_token: !!tokenPayload.refresh_token },
  });

  return NextResponse.redirect(`${baseUrl}/settings?gmail=connected`);
}
