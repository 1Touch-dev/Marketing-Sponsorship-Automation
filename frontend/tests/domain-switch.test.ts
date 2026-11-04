import test from "node:test";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import assert from "node:assert/strict";
import { internalAppUrl, resolveAppUrl } from "../lib/url";
import { replaceHost, replaceHostInJson, DRAFT_STATUSES } from "../scripts/replace-app-host";

function withEnv(vars: Record<string, string | undefined>, fn: () => void) {
  const prev: Record<string, string | undefined> = {};
  for (const k of Object.keys(vars)) { prev[k] = process.env[k]; if (vars[k] === undefined) delete process.env[k]; else process.env[k] = vars[k]; }
  try { fn(); } finally { for (const k of Object.keys(prev)) { if (prev[k] === undefined) delete process.env[k]; else process.env[k] = prev[k]; } }
}

test("internalAppUrl never follows the public address", () => {
  withEnv({ APP_URL: "https://sponsorship.coritiba.com.br", NEXT_PUBLIC_APP_URL: "https://sponsorship.coritiba.com.br", INTERNAL_APP_URL: undefined, PORT: undefined }, () => {
    assert.equal(internalAppUrl(), "http://127.0.0.1:3000");
    assert.equal(resolveAppUrl(), "https://sponsorship.coritiba.com.br");
  });
});

test("internalAppUrl honours INTERNAL_APP_URL and PORT, without a trailing slash", () => {
  withEnv({ INTERNAL_APP_URL: "http://127.0.0.1:4000/", PORT: "3100" }, () => assert.equal(internalAppUrl(), "http://127.0.0.1:4000"));
  withEnv({ INTERNAL_APP_URL: undefined, PORT: "3100" }, () => assert.equal(internalAppUrl(), "http://127.0.0.1:3100"));
  withEnv({ INTERNAL_APP_URL: "  ", PORT: undefined }, () => assert.equal(internalAppUrl(), "http://127.0.0.1:3000"));
});

test("resolveAppUrl takes the configured public address, trimmed", () => {
  withEnv({ APP_URL: "https://sponsorship.coritiba.com.br/", NEXT_PUBLIC_APP_URL: undefined }, () => assert.equal(resolveAppUrl(), "https://sponsorship.coritiba.com.br"));
});

test("replace-app-host swaps every occurrence in text and in JSON, and leaves other text alone", () => {
  const from = "https://old.ngrok-free.dev"; const to = "https://sponsorship.coritiba.com.br";
  const html = `<a href="${from}/proposals/view/abc">x</a> <img src="${from}/api/emails/1/pixel"> keep https://other.example/y`;
  assert.equal(replaceHost(html, from, to), `<a href="${to}/proposals/view/abc">x</a> <img src="${to}/api/emails/1/pixel"> keep https://other.example/y`);
  assert.equal(replaceHost(null, from, to), null);
  assert.deepEqual(replaceHostInJson({ link: `${from}/p`, n: 3, nested: { l: [`${from}/q`] } }, from, to), { link: `${to}/p`, n: 3, nested: { l: [`${to}/q`] } });
  assert.equal(replaceHostInJson(null, from, to), null);
});

test("replace-app-host only ever touches emails that have not gone out", () => {
  assert.deepEqual([...DRAFT_STATUSES].sort(), ["approved", "pending_approval"]);
  assert.ok(!(DRAFT_STATUSES as readonly string[]).includes("sent"));
  assert.ok(!(DRAFT_STATUSES as readonly string[]).includes("replied"));
});

test("no page or library code hardcodes the legacy ngrok address (links must follow APP_URL)", () => {
  // The WhatsApp share button once carried the ngrok address, so every proposal shared from it kept the old link.
  const root = process.cwd(); // the tests run from frontend/
  const hits: string[] = [];
  const walk = (dir: string) => {
    for (const name of readdirSync(dir)) {
      if (name === "node_modules" || name === ".next") continue;
      const full = join(dir, name);
      if (statSync(full).isDirectory()) { walk(full); continue; }
      if (!/\.(ts|tsx)$/.test(name)) continue;
      const code = readFileSync(full, "utf8").split("\n").filter((l) => !/^\s*(\*|\/\/|\/\*)/.test(l)).join("\n");
      if (/ngrok-free\.dev/.test(code)) hits.push(full.slice(root.length + 1));
    }
  };
  walk(join(root, "app")); walk(join(root, "lib"));
  assert.deepEqual(hits, [], "these files hardcode the ngrok address; build the link with resolveAppUrl()");
});
