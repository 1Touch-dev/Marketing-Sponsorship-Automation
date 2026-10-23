/**
 * The only place that makes HTTP calls to Twenty. It never throws, never puts the key in anything it returns, retries a
 * rate-limited call a couple of times, and reads the address and the key when it is called (not when the server starts), so
 * a key added later works without a restart and a test can point it at a stand-in.
 *
 * `TWENTY_BASE_URL` is the self-hosted origin (no trailing slash). James's later public domain is this value only.
 * It defaults to the loopback bind used on this server.
 */
export const twentyBase = () => (process.env.TWENTY_BASE_URL?.trim() || "http://localhost:3200").replace(/\/+$/, "");
export const twentyKey = () => (process.env.TWENTY_API_KEY ?? "").trim();
export const isTwentyConfigured = () => twentyKey().length > 0;

export interface TwResponse {
  ok: boolean;
  status: number;
  data: Record<string, unknown> | null;
  error?: string;
  unreachable?: boolean;
  ms: number;
}

export interface TwOptions { fetchImpl?: typeof fetch; retries?: number; timeoutMs?: number }

const scrub = (s: string) => s.replace(/(Bearer\s+)[^\s"']+/gi, "$1***").replace(/(api[_-]?key=)[^&\s"']+/gi, "$1***");
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Walks Twenty's `{ data: { createCompany: { id } } }` (and cousins) for a record id. */
export function idOf(data: Record<string, unknown> | null): string | null {
  if (!data) return null;
  const walk = (v: unknown): string | null => {
    if (!v || typeof v !== "object") return null;
    const o = v as Record<string, unknown>;
    if (typeof o.id === "string" && o.id.length > 0) return o.id;
    for (const val of Object.values(o)) {
      const found = walk(val);
      if (found) return found;
    }
    return null;
  };
  return walk(data);
}

function errorOf(json: unknown, status: number): string {
  if (json && typeof json === "object") {
    const o = json as { error?: string; message?: string; messages?: string[] };
    const msg = o.error || o.message || (Array.isArray(o.messages) ? o.messages.filter(Boolean).join("; ") : "");
    if (msg) return scrub(msg);
  }
  if (status === 429) return "Twenty is rate limiting us (too many requests).";
  return `Twenty answered ${status}`;
}

export async function twRequest(method: "GET" | "POST" | "PATCH", path: string, body?: unknown, opts: TwOptions = {}): Promise<TwResponse> {
  const started = Date.now();
  const key = twentyKey();
  if (!key) return { ok: false, status: 0, data: null, error: "No Twenty API key is set on this server.", unreachable: true, ms: 0 };
  const doFetch = opts.fetchImpl ?? fetch;
  const url = `${twentyBase()}${path.startsWith("/") ? path : `/${path}`}`;
  const retries = opts.retries ?? 2;
  for (let attempt = 0; ; attempt++) {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), opts.timeoutMs ?? 10_000);
    try {
      const res = await doFetch(url, {
        method,
        headers: { "Content-Type": "application/json", Accept: "application/json", Authorization: `Bearer ${key}` },
        body: body === undefined ? undefined : JSON.stringify(body),
        signal: ctrl.signal,
      });
      if (res.status === 429 && attempt < retries) {
        const wait = Math.min(3000, Number(res.headers.get("retry-after")) * 1000 || 500 * (attempt + 1));
        await sleep(wait);
        continue;
      }
      let json: unknown = null;
      try { json = await res.json(); } catch { /* not JSON */ }
      const data = json && typeof json === "object" && !Array.isArray(json) ? (json as Record<string, unknown>) : null;
      const nested = data && data.data && typeof data.data === "object" && !Array.isArray(data.data) ? (data.data as Record<string, unknown>) : data;
      return { ok: res.ok, status: res.status, data: nested, error: res.ok ? undefined : errorOf(json, res.status), ms: Date.now() - started };
    } catch (e) {
      const aborted = e instanceof Error && e.name === "AbortError";
      return { ok: false, status: 0, data: null, error: aborted ? "Twenty did not answer in time." : scrub(`Could not reach Twenty: ${e instanceof Error ? e.message : String(e)}`), unreachable: true, ms: Date.now() - started };
    } finally {
      clearTimeout(timer);
    }
  }
}

/** A cheap call that says whether the key is accepted. */
export async function checkTwentyKey(opts: TwOptions = {}): Promise<{ accepted: boolean | null; error?: string; status: number }> {
  const r = await twRequest("GET", "/open-api/core", undefined, opts);
  if (r.ok) return { accepted: true, status: r.status };
  const r2 = r.ok ? r : await twRequest("GET", "/rest/companies?limit=1", undefined, opts);
  if (r2.ok) return { accepted: true, status: r2.status };
  if (r2.status === 401 || r2.status === 403) return { accepted: false, error: "Twenty rejected the API key.", status: r2.status };
  return { accepted: null, error: r2.error ?? r.error, status: r2.status };
}
