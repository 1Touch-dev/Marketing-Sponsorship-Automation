import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";
import { requireInternalAuth } from "@/lib/internal-auth";
import { mailProvider } from "@/lib/mail/config";
import { dispatchNewsletter, dueNewsletterIds } from "@/lib/mail/newsletter";
import { sendViaSes } from "@/lib/mail/ses";
import { resolveAppUrl } from "@/lib/url";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

/**
 * POST /api/internal/newsletter-dispatch — run every minute by a scheduler with INTERNAL_API_SECRET.
 * Sends newsletters that were scheduled for a time that has come, and picks up one whose send was cut off by a restart.
 */
export async function POST(req: Request) {
  const authErr = requireInternalAuth(req);
  if (authErr) return authErr;
  if (mailProvider() !== "ses") return NextResponse.json({ ok: false, error: "MAIL_PROVIDER is not ses: nothing is sent." }, { status: 503 });

  const sb = supabaseAdmin();
  const ids = await dueNewsletterIds(sb);
  const results: Array<Record<string, unknown>> = [];
  for (const id of ids) {
    const r = await dispatchNewsletter(sb, { newsletterId: id, send: sendViaSes, appUrl: resolveAppUrl(req), delayMs: 100 });
    results.push({ id, ...r });
  }
  return NextResponse.json({ ok: true, due: ids.length, results });
}
