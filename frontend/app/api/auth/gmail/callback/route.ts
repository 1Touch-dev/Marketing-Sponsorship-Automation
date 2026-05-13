import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { exchangeCodeForTokens, gmailClientFromTokens } from "@/lib/gmail/client";
import { supabaseAdmin } from "@/lib/supabase/server";
import { recordAudit } from "@/lib/audit/log";

export const runtime = "nodejs";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const expected = cookies().get("gmail_oauth_state")?.value;

  if (!code) return NextResponse.json({ error: "Missing code" }, { status: 400 });
  if (!state || !expected || state !== expected) {
    return NextResponse.json({ error: "Invalid OAuth state" }, { status: 400 });
  }

  let tokens;
  try {
    tokens = await exchangeCodeForTokens(code);
  } catch (err) {
    return NextResponse.json(
      { error: `Token exchange failed: ${err instanceof Error ? err.message : "unknown"}` },
      { status: 502 },
    );
  }

  // Identify the Gmail account
  let emailAddress = "";
  try {
    const gmail = gmailClientFromTokens(tokens);
    const profile = await gmail.users.getProfile({ userId: "me" });
    emailAddress = profile.data.emailAddress ?? "";
  } catch (err) {
    return NextResponse.json(
      { error: `Gmail profile fetch failed: ${err instanceof Error ? err.message : "unknown"}` },
      { status: 502 },
    );
  }
  if (!emailAddress) return NextResponse.json({ error: "Could not resolve Gmail address" }, { status: 502 });

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
    return NextResponse.json({ error: `Persisting tokens failed: ${upErr.message}` }, { status: 500 });
  }

  await recordAudit({
    entity_type: "user",
    action: "gmail.connected",
    actor_email: emailAddress,
  });

  return NextResponse.redirect(new URL("/settings?gmail=connected", req.url));
}
