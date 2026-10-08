import crypto from "crypto";
import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";
import { getCurrentPlatformUser } from "@/lib/auth/server-permission";
import { resolveTenantId } from "@/lib/tenants/current";
import { isMissingMigration } from "@/lib/proposals/revision-store";

type Sb = any;

export const IDEMPOTENCY_HEADER = "idempotency-key";
const KEY_RE = /^[A-Za-z0-9_.:-]{8,128}$/;

/** The key a caller sent: null when none, or an error message when it is malformed. */
export function readKey(req: Request): { key: string | null } | { error: string } {
  const raw = req.headers.get(IDEMPOTENCY_HEADER);
  if (raw === null) return { key: null };
  return KEY_RE.test(raw) ? { key: raw } : { error: "Idempotency-Key must be 8 to 128 characters: letters, digits, and _ . : -" };
}

/** What identifies the request itself, so a key reused for a different request is noticed. */
export function requestFingerprint(method: string, pathname: string, body: string): string {
  let canonical = body;
  try { canonical = stable(JSON.parse(body)); } catch { /* not JSON: compare the raw text */ }
  return crypto.createHash("sha256").update(`${method.toUpperCase()}\n${pathname}\n${canonical}`).digest("hex");
}
function stable(v: unknown): string {
  if (Array.isArray(v)) return `[${v.map(stable).join(",")}]`;
  if (v && typeof v === "object") return `{${Object.keys(v as object).sort().map((k) => `${JSON.stringify(k)}:${stable((v as Record<string, unknown>)[k])}`).join(",")}}`;
  return JSON.stringify(v);
}

export type Claim =
  | { state: "new"; id: string }
  | { state: "replay"; status: number; body: unknown }
  | { state: "mismatch" }
  | { state: "in_progress" }
  | { state: "unavailable"; setUp: boolean };

/** Takes the key for this request, or reports what became of the request that took it first. */
export async function claimKey(sb: Sb, tenantId: string, scope: string, key: string, hash: string, actorId: string | null): Promise<Claim> {
  const ins = await sb.from("idempotency_keys").insert({ tenant_id: tenantId, scope, idem_key: key, request_hash: hash, actor_id: actorId }).select("id").single();
  if (!ins.error) return { state: "new", id: ins.data.id };
  if (ins.error.code !== "23505") return { state: "unavailable", setUp: !isMissingMigration(ins.error) };
  const { data: existing } = await sb.from("idempotency_keys").select("id, request_hash, status, response_status, response_body, expires_at").eq("tenant_id", tenantId).eq("scope", scope).eq("idem_key", key).maybeSingle();
  if (!existing) return { state: "in_progress" };
  if (existing.request_hash !== hash) return { state: "mismatch" };
  if (existing.status === "completed") return { state: "replay", status: existing.response_status, body: existing.response_body };
  return { state: "in_progress" };
}

export async function completeKey(sb: Sb, id: string, status: number, body: unknown): Promise<void> {
  await sb.from("idempotency_keys").update({ status: "completed", response_status: status, response_body: body ?? null, completed_at: new Date().toISOString() }).eq("id", id);
}
export async function releaseKey(sb: Sb, id: string): Promise<void> {
  await sb.from("idempotency_keys").delete().eq("id", id);
}

type Handler = (req: any, ctx: any) => Promise<Response>;

/** The retry logic itself, free of any sign-in wiring so it can be tested with a stand-in database. */
export async function runIdempotent(i: { sb: Sb; tenantId: string; actorId: string; scope: string; key: string; req: Request; ctx: unknown; handler: Handler }): Promise<Response> {
  const { sb, tenantId, actorId, key, req, ctx, handler } = i;
  const hash = requestFingerprint(req.method, new URL(req.url).pathname, await req.clone().text());
  const claim = await claimKey(sb, tenantId, `${i.scope}:${actorId}`, key, hash, actorId);
  if (claim.state === "unavailable") {
    if (claim.setUp) console.error("[idempotency] could not take the key; continuing without it");
    return handler(req, ctx);
  }
  if (claim.state === "mismatch") return NextResponse.json({ error: "This Idempotency-Key was already used for a different request." }, { status: 422 });
  if (claim.state === "in_progress") return NextResponse.json({ error: "A request with this Idempotency-Key is still being processed. Try again shortly." }, { status: 409, headers: { "Retry-After": "2" } });
  if (claim.state === "replay") return NextResponse.json(claim.body ?? {}, { status: claim.status, headers: { "Idempotent-Replay": "true" } });

  let res: Response;
  try {
    res = await handler(req, ctx);
  } catch (err) {
    await releaseKey(sb, claim.id);
    throw err;
  }
  if (res.status >= 500) {
    await releaseKey(sb, claim.id);
    return res;
  }
  const text = await res.clone().text();
  let body: unknown;
  try { body = text ? JSON.parse(text) : {}; } catch { body = { _text: text.slice(0, 2000) }; }
  await completeKey(sb, claim.id, res.status, body);
  return res;
}

/**
 * Makes a route safe to retry. A caller that sends an Idempotency-Key gets the original answer back, with the
 * header Idempotent-Replay: true, if it repeats the same request; a reused key on a different request is refused
 * (422); a repeat while the first is still running waits (409). A request that fails with a server error does not
 * keep its key, so it can be retried. Without a key the route behaves exactly as before.
 */
export function idempotent<H extends Handler>(scope: string, handler: H): H {
  const wrapped: Handler = async (req, ctx) => {
    const k = readKey(req);
    if ("error" in k) return NextResponse.json({ error: k.error }, { status: 400 });
    if (!k.key) return handler(req, ctx);
    const user = await getCurrentPlatformUser();
    const tenantId = user?.tenant_id ?? (await resolveTenantId());
    return runIdempotent({ sb: supabaseAdmin(), tenantId, actorId: user?.id ?? "service", scope, key: k.key, req, ctx, handler });
  };
  return wrapped as H;
}
