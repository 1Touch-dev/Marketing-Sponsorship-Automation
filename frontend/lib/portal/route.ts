import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";
import { logger } from "@/lib/monitoring/logger";
import type { WriteResult } from "../accounts/store";
import { requirePortalSession, type PortalContext } from "./guard";
import { internalKeys } from "./safe-view";

type Sb = any;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const NO_STORE = { "Cache-Control": "private, no-store" };

/**
 * Every sponsor-portal API route is built with this, so none can forget the guard: the confirmed session first, the data
 * scoped by it, a last scan of what is about to be sent for anything that looks like the club's own cost or people (the
 * response is refused, not trimmed, if any is found), and no caching of one sponsor's answer for another.
 */
function respond(result: WriteResult<unknown> | Record<string, unknown>): NextResponse {
  let body: unknown;
  if (result && typeof result === "object" && "ok" in result && typeof (result as { ok: unknown }).ok === "boolean") {
    const r = result as WriteResult<unknown>;
    if (!r.ok) {
      // a sponsor never sees database wording: the detail goes to the log, the sponsor gets a plain sentence
      if (r.status >= 500) {
        logger.error("Portal request failed", { error: r.error });
        return NextResponse.json({ error: "Something went wrong. Please try again." }, { status: r.status, headers: NO_STORE });
      }
      return NextResponse.json({ error: r.error }, { status: r.status, headers: NO_STORE });
    }
    body = r.value;
  } else body = result;
  const leaks = internalKeys(body);
  if (leaks.length > 0) {
    logger.error("Portal response refused: internal-looking fields", { leaks: leaks.slice(0, 10) });
    return NextResponse.json({ error: "This could not be shown." }, { status: 500, headers: NO_STORE });
  }
  return NextResponse.json({ data: body }, { headers: NO_STORE });
}

/**
 * Every sponsor-portal API route is built with portalGet or portalPost, so none can forget the guard: the confirmed session
 * first, the data scoped by it, a last scan of what is about to be sent for anything that looks like the club's own cost or
 * people (the response is refused, not trimmed, if any is found), and no caching of one sponsor's answer for another.
 */
const notFound = () => NextResponse.json({ error: "Not found" }, { status: 404, headers: NO_STORE });
const badParams = (params: Record<string, string>) => Object.values(params).some((v) => !UUID.test(v));

export function portalGet(load: (sb: Sb, ctx: PortalContext, params: Record<string, string>) => Promise<WriteResult<unknown> | Record<string, unknown>>) {
  return async function GET(_req: Request, routeCtx: { params: Record<string, string> } = { params: {} }): Promise<NextResponse> {
    const sb = supabaseAdmin();
    const auth = await requirePortalSession(sb);
    if ("error" in auth) return auth.error;
    // an id that cannot be one is "not found", the same answer as an id that belongs to someone else
    const params = routeCtx.params ?? {};
    if (badParams(params)) return notFound();
    return respond(await load(sb, auth.ctx, params));
  };
}

/**
 * The few things a sponsor can DO (today: accept delivered work). It has everything portalGet has, and because the browser
 * attaches the sponsor's cookie by itself, it also refuses a request that did not come from this site's own pages: a
 * cross-site request, or a body that is not JSON (which a plain cross-site form cannot send).
 */
export function portalPost(handle: (sb: Sb, ctx: PortalContext, params: Record<string, string>, body: Record<string, unknown>) => Promise<WriteResult<unknown> | Record<string, unknown>>) {
  return async function POST(req: Request, routeCtx: { params: Record<string, string> } = { params: {} }): Promise<NextResponse> {
    const site = req.headers.get("sec-fetch-site");
    if (site && site !== "same-origin" && site !== "none") return NextResponse.json({ error: "This request was not made from the portal." }, { status: 403, headers: NO_STORE });
    if (!(req.headers.get("content-type") ?? "").toLowerCase().startsWith("application/json")) return NextResponse.json({ error: "Send JSON." }, { status: 415, headers: NO_STORE });
    const sb = supabaseAdmin();
    const auth = await requirePortalSession(sb);
    if ("error" in auth) return auth.error;
    const params = routeCtx.params ?? {};
    if (badParams(params)) return notFound();
    const raw = await req.json().catch(() => ({}));
    const body = raw && typeof raw === "object" && !Array.isArray(raw) ? (raw as Record<string, unknown>) : {};
    return respond(await handle(sb, auth.ctx, params, body));
  };
}
