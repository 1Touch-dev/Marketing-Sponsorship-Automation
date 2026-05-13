#!/usr/bin/env node
/**
 * Smoke-check required env vars for the Next.js app (no values printed).
 * Usage: from repo root with vars exported, or:
 *   node scripts/verify-env.mjs path/to/.env
 */
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";

const required = [
  "AWS_ACCESS_KEY_ID",
  "AWS_SECRET_ACCESS_KEY",
  "AWS_REGION",
  "BEDROCK_MODEL_ID",
  "SUPABASE_URL",
  "SUPABASE_ANON_KEY",
  "SUPABASE_SERVICE_ROLE_KEY",
  "GOOGLE_CLIENT_ID",
  "GOOGLE_CLIENT_SECRET",
  "GOOGLE_REDIRECT_URI",
  "NEXT_PUBLIC_SUPABASE_URL",
  "NEXT_PUBLIC_SUPABASE_ANON_KEY",
];

const optional = ["DEFAULT_FROM_EMAIL", "MSA_INTERNAL_WEBHOOK_SECRET"];

const file = process.argv[2];
if (file) {
  const p = resolve(file);
  if (!existsSync(p)) {
    console.error("Missing file:", p);
    process.exit(1);
  }
  const text = readFileSync(p, "utf8");
  for (const line of text.split("\n")) {
    const m = line.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
    if (!m) continue;
    let v = m[2].replace(/^["']|["']$/g, "").trim();
    if (!process.env[m[1]]) process.env[m[1]] = v;
  }
}

let failed = false;
for (const k of required) {
  if (!process.env[k] || String(process.env[k]).trim() === "") {
    console.error("Missing:", k);
    failed = true;
  }
}
for (const k of optional) {
  if (!process.env[k] || String(process.env[k]).trim() === "") {
    console.warn("Optional unset:", k);
  }
}
if (failed) process.exit(1);
console.log("All required keys present.");
