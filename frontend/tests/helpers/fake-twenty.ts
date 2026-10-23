/**
 * A stand-in for Twenty's Core REST API. It answers the calls the adapter makes, keeps what it was given, and records
 * every call so a test can say a second push updated by ID instead of creating a duplicate.
 */
export interface Call { method: string; path: string; body: unknown }

export class FakeTwenty {
  key = "test-twenty-key";
  calls: Call[] = [];
  companies = new Map<string, Record<string, unknown>>();
  people = new Map<string, Record<string, unknown>>();
  opportunities = new Map<string, Record<string, unknown>>();
  notes: Array<Record<string, unknown>> = [];
  failNext: { count: number; status: number; error: string } | null = null;
  dropNext = 0;
  private seq = 0;

  reset() {
    this.calls = []; this.companies.clear(); this.people.clear(); this.opportunities.clear(); this.notes = [];
    this.failNext = null; this.dropNext = 0;
  }

  callsTo(method: string, pathPrefix: string) { return this.calls.filter((c) => c.method === method && c.path.startsWith(pathPrefix)); }

  private id() { this.seq += 1; return `tw-${this.seq.toString().padStart(8, "0")}-0000-4000-8000-000000000000`; }

  fetch: typeof fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
    const method = (init?.method ?? "GET").toUpperCase();
    const path = new URL(url, "http://twenty.test").pathname;
    let body: unknown;
    if (init?.body) { try { body = JSON.parse(String(init.body)); } catch { body = init.body; } }
    this.calls.push({ method, path, body });

    const auth = String((init?.headers as Record<string, string> | undefined)?.Authorization ?? (init?.headers as Headers | undefined)?.get?.("Authorization") ?? "");
    const json = (status: number, payload: unknown) =>
      new Response(JSON.stringify(payload), { status, headers: { "Content-Type": "application/json" } });

    if (this.dropNext > 0) { this.dropNext--; throw new Error("network down"); }
    if (!auth.includes(this.key)) return json(401, { statusCode: 401, error: "Unauthorized", messages: ["Invalid API key"] });
    if (this.failNext && this.failNext.count > 0) {
      this.failNext.count--;
      return json(this.failNext.status, { statusCode: this.failNext.status, error: this.failNext.error, messages: [this.failNext.error] });
    }

    const payload = (body ?? {}) as Record<string, unknown>;
    const created = (objectName: string, record: Record<string, unknown>) =>
      json(201, { data: { [`create${objectName}`]: record } });
    const updated = (objectName: string, record: Record<string, unknown>) =>
      json(200, { data: { [`update${objectName}`]: record } });

    const stores: Array<[string, Map<string, Record<string, unknown>>, string]> = [
      ["/rest/companies", this.companies, "Company"],
      ["/rest/people", this.people, "Person"],
      ["/rest/opportunities", this.opportunities, "Opportunity"],
    ];
    for (const [prefix, store, objectName] of stores) {
      if (method === "POST" && path === prefix) {
        const id = this.id();
        const record = { id, ...payload };
        store.set(id, record);
        return created(objectName, record);
      }
      if (method === "PATCH" && path.startsWith(prefix + "/")) {
        const id = path.slice(prefix.length + 1);
        const existing = store.get(id);
        if (!existing) return json(404, { statusCode: 404, error: `${objectName} not found` });
        const record = { ...existing, ...payload, id };
        store.set(id, record);
        return updated(objectName, record);
      }
      if (method === "GET" && path === prefix) {
        return json(200, { data: { [objectName.toLowerCase() + "s"]: [...store.values()] } });
      }
    }
    if (method === "POST" && path === "/rest/notes") {
      const id = this.id();
      const record = { id, ...payload };
      this.notes.push(record);
      return created("Note", record);
    }
    if (method === "GET" && path === "/open-api/core") return json(200, { openapi: "3.0.0" });
    return json(404, { statusCode: 404, error: `No handler for ${method} ${path}` });
  };
}
