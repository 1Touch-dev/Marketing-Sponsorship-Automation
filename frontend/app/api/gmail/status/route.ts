import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/gmail/status
 *
 * Returns the Gmail connection state without exposing actual token values.
 *
 * Response:
 *   {
 *     connected: boolean,
 *     connected_email: string | null,
 *     expected_sender: string,
 *     has_access_token: boolean,
 *     has_refresh_token: boolean,
 *     expires_at: string | null
 *   }
 */
export async function GET() {
  const expectedSender = process.env.DEFAULT_FROM_EMAIL ?? "";

  const sb = supabaseAdmin();
  const { data: user } = expectedSender
    ? await sb
        .from("users")
        .select("email, metadata")
        .eq("email", expectedSender)
        .maybeSingle()
    : { data: null };

  type GmailTokens = {
    access_token?: string | null;
    refresh_token?: string | null;
    expiry_date?: number | null;
    scope?: string | null;
    token_type?: string | null;
    connected_email?: string | null;
    connected_at?: string | null;
  };

  const tokens = (user?.metadata as Record<string, unknown> | undefined)
    ?.gmail_tokens as GmailTokens | undefined;

  const hasAccess = !!tokens?.access_token;
  const hasRefresh = !!tokens?.refresh_token;
  const connected = hasAccess && hasRefresh;
  const connectedEmail = tokens?.connected_email ?? (connected ? expectedSender : null);
  const expiresAt = tokens?.expiry_date
    ? new Date(tokens.expiry_date).toISOString()
    : null;

  return NextResponse.json({
    connected,
    connected_email: connectedEmail,
    expected_sender: expectedSender,
    has_access_token: hasAccess,
    has_refresh_token: hasRefresh,
    expires_at: expiresAt,
  });
}
