import http from "node:http";

/**
 * A stand-in for the Pipedrive REST API, for tests and for checking the integration without touching a real account.
 * It answers the calls the adapter makes, keeps what it was given, and records every call so a test can say what must
 * NOT have happened (a search by title, a DELETE).
 *
 * It is not Pipedrive: it knows only the endpoints and answer shapes the adapter uses, written from Pipedrive's public
 * API description. A run against it proves how our code behaves, not that Pipedrive accepts our payloads.
 */
export interface Call { method: string; path: string; body: unknown; query: Record<string, string> }

export class FakePipedrive {
  key = "test-key";
  calls: Call[] = [];
  organizations = new Map<number, Record<string, unknown>>();
  persons = new Map<number, Record<string, unknown>>();
  deals = new Map<number, Record<string, unknown>>();
  activities: Array<Record<string, unknown>> = [];
  notes: Array<Record<string, unknown>> = [];
  private seq = 100;
  /** answer the next N calls with this status instead of doing anything */
  failNext: { count: number; status: number; error: string } | null = null;
  /** simulate a network failure for the next N calls */
  dropNext = 0;
  /** milliseconds to wait before answering */
  delayMs = 0;

  reset() {
    this.calls = []; this.organizations.clear(); this.persons.clear(); this.deals.clear(); this.activities = []; this.notes = [];
    this.failNext = null; this.dropNext = 0; this.delayMs = 0;
  }

  callsTo(method: string, pathPrefix: string) { return this.calls.filter((c) => c.method === method && c.path.startsWith(pathPrefix)); }

  /** the same API over HTTP, for a run against a real server process */
  async handle(method: string, rawPath: string, rawBody: unknown, headers: Record<string, string> = {}): Promise<{ status: number; json: unknown } | "drop"> {
    const url = new URL(rawPath, "http://fake");
    const path = url.pathname.replace(/^\/v1/, "");
    const query = Object.fromEntries(url.searchParams.entries());
    this.calls.push({ method, path, body: rawBody, query });
    if (this.delayMs) await new Promise((r) => setTimeout(r, this.delayMs));
    if (this.dropNext > 0) { this.dropNext--; return "drop"; }
    if ((query.api_token ?? headers["x-api-token"]) !== this.key) return { status: 401, json: { success: false, error: "unauthorized access", errorCode: 401 } };
    if (this.failNext && this.failNext.count > 0) { this.failNext.count--; return { status: this.failNext.status, json: { success: false, error: this.failNext.error } }; }

    const body = (rawBody ?? {}) as Record<string, unknown>;
    const ok = (data: unknown, status = 200) => ({ status, json: { success: true, data } });
    const bad = (status: number, error: string) => ({ status, json: { success: false, error } });

    if (method === "GET" && path === "/users/me") return ok({ id: 1, name: "Fake User", company_name: "Fake Co" });
    if (method === "GET" && path.endsWith("/search")) return ok({ items: [] });
    for (const [prefix, store] of [["/organizations", this.organizations], ["/persons", this.persons], ["/deals", this.deals]] as const) {
      if (method === "GET" && path.startsWith(prefix + "/")) { const found = store.get(Number(path.split("/").pop())); return found ? ok(found) : bad(404, `${prefix.slice(1, -1)} not found`); }
    }
    if (method === "GET" && path === "/organizations") {
      const start = Number(query.start ?? 0), limit = Number(query.limit ?? 100);
      const all = [...this.organizations.values()];
      return { status: 200, json: { success: true, data: all.slice(start, start + limit), additional_data: { pagination: { start, limit, more_items_in_collection: start + limit < all.length, next_start: start + limit } } } };
    }
    if (method === "DELETE") return ok({ id: Number(path.split("/").pop()) });

    const collections: Record<string, Map<number, Record<string, unknown>>> = { "/organizations": this.organizations, "/persons": this.persons, "/deals": this.deals };
    for (const [prefix, store] of Object.entries(collections)) {
      if (method === "POST" && path === prefix) {
        if (prefix === "/deals" && String(body.title ?? "").includes("REJECT")) return bad(400, "Deal title is not allowed");
        if (!body.name && !body.title) return bad(400, "A name or title is required");
        const id = ++this.seq;
        store.set(id, { id, ...body });
        return ok({ id, ...body }, 201);
      }
      if (method === "PUT" && path.startsWith(prefix + "/")) {
        const id = Number(path.split("/").pop());
        const existing = store.get(id);
        if (!existing) return bad(404, `${prefix.slice(1, -1)} not found`);
        const next = { ...existing, ...body, id };
        store.set(id, next);
        return ok(next);
      }
    }
    if (method === "POST" && path === "/activities") { const a = { id: ++this.seq, ...body }; this.activities.push(a); return ok(a, 201); }
    if (method === "POST" && path === "/notes") { const n = { id: ++this.seq, ...body }; this.notes.push(n); return ok(n, 201); }
    return bad(404, `No such endpoint in the stand-in: ${method} ${path}`);
  }

  /** a fetch that answers from this object (for tests that run in-process) */
  fetch: typeof fetch = async (input, init) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
    const method = (init?.method ?? "GET").toUpperCase();
    const body = init?.body ? JSON.parse(String(init.body)) : undefined;
    const r = await this.handle(method, new URL(url).pathname + new URL(url).search, body);
    if (r === "drop") throw new TypeError("fetch failed");
    return new Response(JSON.stringify(r.json), { status: r.status, headers: { "content-type": "application/json" } });
  };

  /** the same API on a local port; GET /__calls, POST /__reset and /__fail-next are for the person running it */
  listen(port: number): Promise<http.Server> {
    const server = http.createServer(async (req, res) => {
      const chunks: Buffer[] = [];
      for await (const c of req) chunks.push(c as Buffer);
      const text = Buffer.concat(chunks).toString("utf8");
      const body = text ? JSON.parse(text) : undefined;
      const url = req.url ?? "/";
      if (url.startsWith("/__calls")) { res.setHeader("content-type", "application/json"); res.end(JSON.stringify({ calls: this.calls, organizations: [...this.organizations.values()], persons: [...this.persons.values()], deals: [...this.deals.values()], activities: this.activities, notes: this.notes })); return; }
      if (url.startsWith("/__reset")) { this.reset(); res.end("{}"); return; }
      if (url.startsWith("/__fail-next")) { this.failNext = { count: body?.count ?? 1, status: body?.status ?? 500, error: body?.error ?? "Internal error" }; res.end("{}"); return; }
      if (url.startsWith("/__key")) { this.key = String(body?.key ?? this.key); res.end("{}"); return; }
      const r = await this.handle((req.method ?? "GET").toUpperCase(), url, body, req.headers as Record<string, string>);
      if (r === "drop") { req.socket.destroy(); return; }
      res.statusCode = r.status;
      res.setHeader("content-type", "application/json");
      res.end(JSON.stringify(r.json));
    });
    return new Promise((resolve) => server.listen(port, "127.0.0.1", () => resolve(server)));
  }
}
