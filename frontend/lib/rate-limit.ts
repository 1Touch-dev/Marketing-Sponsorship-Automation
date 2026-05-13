/**
 * Lightweight in-process rate limiter.
 *
 * Strategy: sliding-window per key (IP or route) using a Map.
 * Good enough for single-EC2 MVP. No Redis needed.
 *
 * Usage in a route handler:
 *
 *   import { checkRateLimit } from "@/lib/rate-limit";
 *   const rl = checkRateLimit(`generate:${ip}`, { max: 5, windowMs: 60_000 });
 *   if (!rl.ok) return NextResponse.json({ error: rl.message }, { status: 429 });
 */

interface Window {
  count: number;
  resetAt: number;
}

const store = new Map<string, Window>();

/** Prune entries older than 5 minutes to prevent unbounded growth. */
function prune() {
  const now = Date.now();
  for (const [k, v] of store.entries()) {
    if (v.resetAt < now - 300_000) store.delete(k);
  }
}

let lastPrune = Date.now();

export interface RateLimitOptions {
  /** Maximum number of requests allowed in the window. */
  max: number;
  /** Window duration in milliseconds. */
  windowMs: number;
}

export interface RateLimitResult {
  ok: boolean;
  remaining: number;
  resetAt: number;
  message: string;
}

export function checkRateLimit(key: string, opts: RateLimitOptions): RateLimitResult {
  const now = Date.now();

  if (now - lastPrune > 60_000) {
    prune();
    lastPrune = now;
  }

  let win = store.get(key);
  if (!win || win.resetAt <= now) {
    win = { count: 0, resetAt: now + opts.windowMs };
    store.set(key, win);
  }

  win.count += 1;
  const remaining = Math.max(0, opts.max - win.count);

  if (win.count > opts.max) {
    return {
      ok: false,
      remaining: 0,
      resetAt: win.resetAt,
      message: `Rate limit exceeded. Try again after ${new Date(win.resetAt).toISOString()}.`,
    };
  }

  return { ok: true, remaining, resetAt: win.resetAt, message: "" };
}

/**
 * Extract the caller IP from Next.js Request headers.
 * Falls back to "unknown" in edge/serverless environments where it isn't available.
 */
export function getClientIp(req: Request): string {
  return (
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    req.headers.get("x-real-ip") ??
    "unknown"
  );
}
