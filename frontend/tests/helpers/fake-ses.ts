import http from "node:http";
import type { AddressInfo } from "node:net";

export interface SeenSend { path: string; body: any }

/**
 * A stand-in for the Amazon SES v2 API (POST /v2/email/outbound-emails): records every request and answers like SES.
 * `fail` can make chosen recipients fail with a named SES error, to test throttling and rejection.
 */
export async function fakeSes(opts: { fail?: (to: string, attempt: number) => { status: number; name: string; message: string } | null } = {}) {
  const seen: SeenSend[] = [];
  const attempts = new Map<string, number>();
  let n = 0;
  const server = http.createServer((rq, rs) => {
    let raw = "";
    rq.on("data", (c) => (raw += c));
    rq.on("end", () => {
      const body = raw ? JSON.parse(raw) : {};
      const to: string = body?.Destination?.ToAddresses?.[0] ?? "";
      const attempt = (attempts.get(to) ?? 0) + 1;
      attempts.set(to, attempt);
      const f = opts.fail?.(to, attempt) ?? null;
      seen.push({ path: rq.url ?? "", body });
      if (f) {
        rs.writeHead(f.status, { "content-type": "application/json", "x-amzn-errortype": f.name });
        rs.end(JSON.stringify({ message: f.message }));
        return;
      }
      rs.writeHead(200, { "content-type": "application/json" });
      rs.end(JSON.stringify({ MessageId: `fake-msg-${++n}` }));
    });
  });
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  const url = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  return { url, seen, close: () => new Promise<void>((r) => server.close(() => r())) };
}
