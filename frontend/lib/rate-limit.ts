/**
 * In-memory rate limiter — no Redis dependency.
 * Sliding window, keyed by IP + endpoint.
 *
 * Two call signatures are supported:
 *   checkRateLimit(key, { max, windowMs })    → { ok, message, remaining, resetAt }
 *   checkRateLimit({ key, limit, windowSec }) → { allowed, remaining, resetAt, limit }
 */

// ── Types ─────────────────────────────────────────────────────────────────────

export interface LegacyRateLimitResult {
  ok: boolean;
  message: string;
  remaining: number;
  resetAt: number;
}

export interface RateLimitOptions {
  key: string;
  limit: number;
  windowSec: number;
}

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  resetAt: number;
  limit: number;
}

// ── Internal store ────────────────────────────────────────────────────────────

interface RateWindow {
  count: number;
  resetAt: number;
}

const store = new Map<string, RateWindow>();

let cleanupTimer: ReturnType<typeof setInterval> | null = null;
function ensureCleanup() {
  if (cleanupTimer) return;
  cleanupTimer = setInterval(() => {
    const now = Date.now();
    for (const [key, win] of store.entries()) {
      if (win.resetAt < now) store.delete(key);
    }
  }, 5 * 60 * 1000);
}

function getOrCreateWindow(key: string, windowMs: number): RateWindow {
  ensureCleanup();
  const now = Date.now();
  let win = store.get(key);
  if (!win || win.resetAt < now) {
    win = { count: 0, resetAt: now + windowMs };
    store.set(key, win);
  }
  win.count += 1;
  return win;
}

// ── Overloaded function ───────────────────────────────────────────────────────

export function checkRateLimit(key: string, opts: { max: number; windowMs: number }): LegacyRateLimitResult;
export function checkRateLimit(opts: RateLimitOptions): RateLimitResult;
export function checkRateLimit(
  keyOrOpts: string | RateLimitOptions,
  legacyOpts?: { max: number; windowMs: number }
): LegacyRateLimitResult | RateLimitResult {
  if (typeof keyOrOpts === "string") {
    const { max, windowMs } = legacyOpts!;
    const win = getOrCreateWindow(keyOrOpts, windowMs);
    const remaining = Math.max(0, max - win.count);
    const ok = win.count <= max;
    return {
      ok,
      message: ok
        ? `${remaining} requests remaining`
        : `Rate limit exceeded. Try again in ${Math.ceil((win.resetAt - Date.now()) / 1000)}s`,
      remaining,
      resetAt: win.resetAt,
    };
  }

  const { key, limit, windowSec } = keyOrOpts;
  const win = getOrCreateWindow(key, windowSec * 1000);
  const remaining = Math.max(0, limit - win.count);
  return {
    allowed: win.count <= limit,
    remaining,
    resetAt: win.resetAt,
    limit,
  };
}

/** Convenience: 429 response headers */
export function rateLimitHeaders(result: RateLimitResult | LegacyRateLimitResult): Record<string, string> {
  const limit = "limit" in result ? result.limit : undefined;
  return {
    ...(limit !== undefined ? { "X-RateLimit-Limit": String(limit) } : {}),
    "X-RateLimit-Remaining": String(result.remaining),
    "X-RateLimit-Reset": String(Math.floor(result.resetAt / 1000)),
    "Retry-After": String(Math.ceil((result.resetAt - Date.now()) / 1000)),
  };
}

/** Extract the real client IP from request headers */
export function getClientIp(req: Request): string {
  return (
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    req.headers.get("x-real-ip")?.trim() ??
    "unknown"
  );
}
