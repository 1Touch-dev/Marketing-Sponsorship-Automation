/**
 * The only place that makes HTTP calls to Pipedrive. It never throws, never puts the key in anything it returns, retries a
 * rate-limited call a couple of times, and reads the address and the key when it is called (not when the server starts), so
 * a key added later works without a restart and a test can point it at a stand-in.
 *
 * `PIPEDRIVE_BASE_URL` exists for tests and for checking the integration against a stand-in server. It defaults to
 * Pipedrive's own address and nothing else in the app sets it.
 */
export const pipedriveBase = () => (process.env.PIPEDRIVE_BASE_URL?.trim() || "https://api.pipedrive.com/v1").replace(/\/+$/, "");
export const pipedriveKey = () => (process.env.PIPEDRIVE_API_KEY ?? "").trim();
export const isPipedriveConfigured = () => pipedriveKey().length > 0;

export interface PdResponse {
  ok: boolean;
  status: number;
  data: Record<string, unknown> | null;
  /** Pipedrive's own words for what went wrong, or ours when it could not be reached */
  error?: string;
  /** Pipedrive's `additional_data` (for example the pagination of a list) */
  extra?: Record<string, unknown>;
  /** true when Pipedrive did not answer at all (so nothing is known about the key) */
  unreachable?: boolean;
  ms: number;
}

export interface PdOptions { fetchImpl?: typeof fetch; retries?: number; timeoutMs?: number }

const scrub = (s: string) => s.replace(/api_token=[^&\s"']+/gi, "api_token=***");
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export async function pdRequest(method: "GET" | "POST" | "PUT", path: string, body?: unknown, opts: PdOptions = {}): Promise<PdResponse> {
  const started = Date.now();
  const key = pipedriveKey();
  if (!key) return { ok: false, status: 0, data: null, error: "No Pipedrive API key is set on this server.", unreachable: true, ms: 0 };
  const doFetch = opts.fetchImpl ?? fetch;
  const url = `${pipedriveBase()}${path}${path.includes("?") ? "&" : "?"}api_token=${encodeURIComponent(key)}`;
  const retries = opts.retries ?? 2;
  for (let attempt = 0; ; attempt++) {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), opts.timeoutMs ?? 10_000);
    try {
      const res = await doFetch(url, { method, headers: { "Content-Type": "application/json", Accept: "application/json" }, body: body === undefined ? undefined : JSON.stringify(body), signal: ctrl.signal });
      if (res.status === 429 && attempt < retries) {
        const wait = Math.min(3000, Number(res.headers.get("retry-after")) * 1000 || 500 * (attempt + 1));
        await sleep(wait);
        continue;
      }
      let json: { success?: boolean; data?: unknown; additional_data?: Record<string, unknown>; error?: string; error_info?: string } | null = null;
      try { json = await res.json(); } catch { /* not JSON */ }
      const ok = res.ok && json?.success !== false;
      const data = json && json.data && typeof json.data === "object" && !Array.isArray(json.data) ? (json.data as Record<string, unknown>) : json && Array.isArray(json.data) ? ({ items: json.data } as Record<string, unknown>) : null;
      return { ok, status: res.status, data, extra: json?.additional_data, error: ok ? undefined : scrub(json?.error ?? json?.error_info ?? (res.status === 429 ? "Pipedrive is rate limiting us (too many requests)." : `Pipedrive answered ${res.status}`)), ms: Date.now() - started };
    } catch (e) {
      const aborted = e instanceof Error && e.name === "AbortError";
      return { ok: false, status: 0, data: null, error: aborted ? "Pipedrive did not answer in time." : scrub(`Could not reach Pipedrive: ${e instanceof Error ? e.message : String(e)}`), unreachable: true, ms: Date.now() - started };
    } finally {
      clearTimeout(timer);
    }
  }
}

/** Asks Pipedrive who the key belongs to: a cheap call that says whether the key is accepted. */
export async function checkPipedriveKey(opts: PdOptions = {}): Promise<{ accepted: boolean | null; error?: string; status: number }> {
  const r = await pdRequest("GET", "/users/me", undefined, opts);
  if (r.ok) return { accepted: true, status: r.status };
  if (r.status === 401 || r.status === 403) return { accepted: false, error: "Pipedrive rejected the API key.", status: r.status };
  // it did not say yes or no: nothing is known about the key
  return { accepted: null, error: r.error, status: r.status };
}
