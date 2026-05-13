import { NextResponse } from "next/server";
import { gmailAuthUrl } from "@/lib/gmail/client";
import { randomBytes } from "node:crypto";

export const runtime = "nodejs";

/**
 * GET /api/auth/gmail
 *
 * Starts the Gmail OAuth flow. Redirects the browser to Google's consent
 * screen which always shows an account chooser (prompt=select_account consent).
 *
 * The Google Cloud OAuth client MUST have this redirect URI registered:
 *   https://eligibly-facing-unloved.ngrok-free.dev/api/auth/gmail/callback
 *
 * Where to add it:
 *   https://console.cloud.google.com/apis/credentials
 *   → Select the OAuth 2.0 client → "Authorised redirect URIs" → Add URI
 */
export async function GET(req: Request) {
  const redirectUri = process.env.GOOGLE_REDIRECT_URI;

  // Fail fast with a helpful message if the env var is missing
  if (!redirectUri) {
    return NextResponse.json(
      {
        error: "GOOGLE_REDIRECT_URI is not set.",
        fix: "Add GOOGLE_REDIRECT_URI=https://<your-ngrok-domain>/api/auth/gmail/callback to frontend/.env.local",
      },
      { status: 500 },
    );
  }

  const state = randomBytes(16).toString("hex");
  const url = gmailAuthUrl(state);

  // Log the full OAuth URL in non-production so it's easy to verify the
  // redirect_uri parameter without exposing secrets in production logs.
  if (process.env.NODE_ENV !== "production") {
    const { origin } = new URL(req.url);
    console.log(`[gmail-oauth] initiating flow from ${origin}`);
    console.log(`[gmail-oauth] redirect_uri = ${redirectUri}`);
    console.log(`[gmail-oauth] auth URL = ${url}`);
  }

  const res = NextResponse.redirect(url);
  res.cookies.set("gmail_oauth_state", state, {
    httpOnly: true,
    // Use secure:true when the request arrives over HTTPS (ngrok always does)
    secure: req.url.startsWith("https://"),
    sameSite: "lax",
    maxAge: 600,
    path: "/",
  });
  return res;
}
