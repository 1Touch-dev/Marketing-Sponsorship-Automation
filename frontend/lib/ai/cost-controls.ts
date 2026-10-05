/**
 * Cost controls for every Claude call (pure logic, no I/O).
 * Wired in at the two entry points in lib/bedrock/client.ts, so all call
 * sites are covered.
 */

// ── Pricing ─────────────────────────────────────────────────────────────────
// Sonnet-tier list prices per million tokens. Cache reads bill at 0.1x input,
// 5-minute cache writes at 1.25x input.
export const RATES_USD_PER_MTOK = { input: 3, output: 15, cacheRead: 0.3, cacheWrite: 3.75 };

export type TokenUsage = {
  input?: number | null;
  output?: number | null;
  cacheRead?: number | null;
  cacheWrite?: number | null;
};

export function claudeCostUsd(u: TokenUsage): number {
  const r = RATES_USD_PER_MTOK;
  return (
    ((u.input ?? 0) * r.input +
      (u.output ?? 0) * r.output +
      (u.cacheRead ?? 0) * r.cacheRead +
      (u.cacheWrite ?? 0) * r.cacheWrite) /
    1_000_000
  );
}

// ── Prompt caching helpers ─────────────────────────────────────────────────
// Sonnet 4.6 only caches prefixes of at least 1024 tokens; below that a marker
// is ignored. ~4 characters per token, so 4,400 characters is a safe floor.
export const MIN_CACHEABLE_CHARS = 4400;

export type CacheMarker = { type: "ephemeral" };
export type SystemBlock = { type: "text"; text: string; cache_control?: CacheMarker };

/** System prompt as blocks; marks it cacheable only when it is large enough to be worth it. */
export function systemBlocks(system: string | undefined): string | SystemBlock[] | undefined {
  if (!system) return undefined;
  if (system.length < MIN_CACHEABLE_CHARS) return system;
  return [{ type: "text", text: system, cache_control: { type: "ephemeral" } }];
}

/** Marks the last tool definition so the whole tool list is cached with the system prompt. */
export function withToolCache<T extends object>(tools: T[]): Array<T & { cache_control?: CacheMarker }> {
  if (tools.length === 0) return tools;
  return tools.map((t, i) => (i === tools.length - 1 ? { ...t, cache_control: { type: "ephemeral" as const } } : t));
}

/** Total size of the static prefix, to decide whether a loop is worth caching. */
export function prefixChars(system: string | undefined, tools: unknown[]): number {
  return (system?.length ?? 0) + JSON.stringify(tools).length;
}

// ── Output clamp ────────────────────────────────────────────────────────────
export function maxOutputTokensCeiling(): number {
  const n = Number(process.env.AI_MAX_OUTPUT_TOKENS);
  return Number.isFinite(n) && n >= 256 ? Math.floor(n) : 4096;
}

export function clampMaxTokens(requested: number | undefined, fallback: number): number {
  return Math.min(Math.max(1, requested ?? fallback), maxOutputTokensCeiling());
}

// ── Throttle: stops a runaway loop even if every call individually looks fine
export class CallThrottle {
  private stamps: number[] = [];
  constructor(private readonly limit: number, private readonly windowMs = 60_000) {}

  /** Returns true and records the call if under the limit. */
  tryAcquire(now = Date.now()): boolean {
    const cutoff = now - this.windowMs;
    this.stamps = this.stamps.filter((t) => t > cutoff);
    if (this.stamps.length >= this.limit) return false;
    this.stamps.push(now);
    return true;
  }
}

export function callsPerMinuteLimit(): number {
  const n = Number(process.env.AI_MAX_CALLS_PER_MIN);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : 90;
}

// ── Provider breaker: skip a provider that just failed ─────────────────────
export class ProviderBreaker {
  private openUntil = 0;
  constructor(private readonly cooldownMs = 10 * 60_000) {}
  isOpen(now = Date.now()): boolean {
    return now < this.openUntil;
  }
  trip(now = Date.now()): void {
    this.openUntil = now + this.cooldownMs;
  }
  reset(): void {
    this.openUntil = 0;
  }
}

// ── In-flight reservation: parallel calls count against the cap before they finish
export const ESTIMATED_CALL_COST_USD = 0.08;

export class InFlight {
  private total = 0;
  reserve(amount = ESTIMATED_CALL_COST_USD): () => void {
    this.total += amount;
    let released = false;
    return () => {
      if (released) return;
      released = true;
      this.total = Math.max(0, this.total - amount);
    };
  }
  get usd(): number {
    return this.total;
  }
}

// ── In-process daily tally: keeps the cap meaningful if the ledger read fails
export class DayTally {
  private day = "";
  private total = 0;
  private key(now: Date) {
    return now.toISOString().slice(0, 10);
  }
  add(usd: number, now = new Date()) {
    this.roll(now);
    this.total += usd;
  }
  get(now = new Date()): number {
    this.roll(now);
    return this.total;
  }
  private roll(now: Date) {
    const k = this.key(now);
    if (k !== this.day) {
      this.day = k;
      this.total = 0;
    }
  }
}

// ── Attribution: which route made this call ────────────────────────────────
export function callerLabel(stack: string | undefined): string {
  if (!stack) return "unknown";
  const m =
    stack.match(/\/app\/api\/([^\s:)]*?)\/route\.[jt]s/) ||
    stack.match(/server\/app\/api\/([^\s:)]*?)\/route\.[jt]s/) ||
    stack.match(/\/lib\/((?:agents|emails|intelligence|proposals|email)[^\s:)]*?)\.[jt]s/);
  return m ? m[1].replace(/\[|\]/g, "") : "unknown";
}
