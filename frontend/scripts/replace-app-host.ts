/**
 * One-off, for the day the public address changes (for example from the ngrok address to the club's own domain).
 *
 * Emails that were drafted but not yet sent still carry the OLD address inside their text (the proposal link, the
 * tracking pixel, the unsubscribe link). Sent or replied emails are history and are never touched.
 *
 *   cd frontend
 *   npx tsx --env-file=.env.local scripts/replace-app-host.ts --from https://old.example --to https://new.example          # dry run
 *   npx tsx --env-file=.env.local scripts/replace-app-host.ts --from https://old.example --to https://new.example --apply  # writes
 *
 * Only emails in DRAFT_STATUSES are changed, and only body_html, body_text and metadata. Dry run is the default.
 */
export const DRAFT_STATUSES = ["pending_approval", "approved"] as const;

export function replaceHost(text: string | null, from: string, to: string): string | null {
  return typeof text === "string" ? text.split(from).join(to) : text;
}

export function replaceHostInJson(value: unknown, from: string, to: string): unknown {
  if (value === null || value === undefined) return value;
  return JSON.parse(JSON.stringify(value).split(from).join(to));
}

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

async function main() {
  const from = arg("from")?.replace(/\/+$/, "");
  const to = arg("to")?.replace(/\/+$/, "");
  const apply = process.argv.includes("--apply");
  if (!from || !to || !/^https?:\/\//.test(from) || !/^https?:\/\//.test(to) || from === to) {
    console.error("Usage: replace-app-host.ts --from https://old --to https://new [--apply]");
    process.exit(2);
  }
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    console.error("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required (run with --env-file=.env.local).");
    process.exit(2);
  }
  // Plain PostgREST over fetch: no supabase-js here, because its realtime client refuses to start on Node 20 in a script.
  const headers = { apikey: key, authorization: `Bearer ${key}`, "content-type": "application/json" };
  const inList = `in.(${DRAFT_STATUSES.join(",")})`;
  const res = await fetch(`${url}/rest/v1/emails?select=id,status,subject,body_html,body_text,metadata&status=${inList}&limit=5000`, { headers });
  if (!res.ok) throw new Error(`read failed: ${res.status} ${await res.text()}`);
  const data = (await res.json()) as Array<{ id: string; status: string; subject: string | null; body_html: string | null; body_text: string | null; metadata: unknown }>;

  const hit = data.filter((r) =>
    [r.body_html, r.body_text, r.metadata ? JSON.stringify(r.metadata) : null].some((t) => typeof t === "string" && t.includes(from)),
  );
  console.log(`${apply ? "APPLY" : "DRY RUN"}: ${hit.length} of ${data.length} unsent emails contain ${from}`);
  for (const r of hit) console.log(` - ${r.id} [${r.status}] ${String(r.subject ?? "").slice(0, 60)}`);
  if (!apply || hit.length === 0) return;

  let done = 0;
  for (const r of hit) {
    const patch = {
      body_html: replaceHost(r.body_html as string | null, from, to),
      body_text: replaceHost(r.body_text as string | null, from, to),
      metadata: replaceHostInJson(r.metadata, from, to),
    };
    // Re-check the status in the same statement: an email approved-and-sent between the read and the write is left alone.
    const up = await fetch(`${url}/rest/v1/emails?id=eq.${r.id}&status=${inList}`, {
      method: "PATCH",
      headers: { ...headers, prefer: "return=representation" },
      body: JSON.stringify(patch),
    });
    if (!up.ok) throw new Error(`${r.id}: ${up.status} ${await up.text()}`);
    done += ((await up.json()) as unknown[]).length;
  }
  console.log(`Updated ${done} emails.`);
}

if (process.argv[1]?.endsWith("replace-app-host.ts")) {
  main().catch((e) => { console.error(e); process.exit(1); });
}
