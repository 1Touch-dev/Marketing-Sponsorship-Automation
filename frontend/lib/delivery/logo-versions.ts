import crypto from "crypto";
import dns from "dns/promises";
import net from "net";
import type { WriteResult } from "../accounts/store";
import { isMissingMigration } from "../proposals/revision-store";
import { sniffContentType } from "./proof";

type Sb = any;

/**
 * Versions of a sponsor's logo (migration 0074).
 *
 * The database records every change of `companies.logo_url` as the next version, whichever route made it, and keeps the old
 * rows. This module adds what a database trigger cannot do: copying the image itself into our storage, because the address
 * alone can stop working on the other site, and working out which generated images were made from a logo that has since been
 * replaced.
 */
export const LOGO_BUCKET = "proposal-assets";
const MAX_LOGO_BYTES = 3 * 1024 * 1024;

export interface LogoVersion {
  id: string; company_id: string; version_number: number; logo_url: string; source: string | null;
  stored_path: string | null; sha256: string | null; content_type: string | null; size_bytes: number | null; archived_at: string | null; archive_error: string | null; created_at: string;
}
const COLUMNS = "id, company_id, version_number, logo_url, source, stored_path, sha256, content_type, size_bytes, archived_at, archive_error, created_at";

export async function listLogoVersions(sb: Sb, tenantId: string, companyId: string): Promise<LogoVersion[]> {
  const { data, error } = await sb.from("company_logo_versions").select(COLUMNS).eq("tenant_id", tenantId).eq("company_id", companyId).order("version_number", { ascending: false });
  return error ? [] : ((data ?? []) as LogoVersion[]);
}

/**
 * The fields to add to a generated image's record so it knows which logo it used. Empty when the logo was not one we have a
 * version of, and empty where versions are not set up, so saving an image never depends on them.
 */
export async function logoVersionFields(sb: Sb, tenantId: string, companyId: string | null | undefined, logoUrl: string | null | undefined): Promise<{ source_logo_version_id?: string }> {
  if (!companyId || !logoUrl) return {};
  const { data, error } = await sb.from("company_logo_versions").select("id").eq("tenant_id", tenantId).eq("company_id", companyId).eq("logo_url", logoUrl).order("version_number", { ascending: false }).limit(1);
  if (error || !data?.[0]) return {};
  return { source_logo_version_id: (data[0] as { id: string }).id };
}

// ── copying the image itself ───────────────────────────────────────────────

const PRIVATE_V4 = [/^10\./, /^127\./, /^169\.254\./, /^172\.(1[6-9]|2\d|3[01])\./, /^192\.168\./, /^0\./, /^100\.(6[4-9]|[7-9]\d|1[01]\d|12[0-7])\./];
export function isPrivateAddress(ip: string): boolean {
  if (net.isIPv4(ip)) return PRIVATE_V4.some((r) => r.test(ip));
  const v = ip.toLowerCase();
  return v === "::1" || v === "::" || v.startsWith("fc") || v.startsWith("fd") || v.startsWith("fe80") || v.startsWith("::ffff:127.") || v.startsWith("::ffff:10.") || v.startsWith("::ffff:192.168.") || v.startsWith("::ffff:169.254.");
}

/** Only a public web address: a logo address that points inside our network is refused rather than fetched. */
export async function isSafeLogoUrl(raw: string): Promise<boolean> {
  let u: URL;
  try { u = new URL(raw); } catch { return false; }
  if (u.protocol !== "https:" && u.protocol !== "http:") return false;
  const host = u.hostname.replace(/^\[|\]$/g, "");
  if (host === "localhost" || host.endsWith(".local") || host.endsWith(".internal")) return false;
  if (net.isIP(host)) return !isPrivateAddress(host);
  try {
    const addrs = await dns.lookup(host, { all: true });
    return addrs.length > 0 && addrs.every((a) => !isPrivateAddress(a.address));
  } catch { return false; }
}

async function fetchLogoBytes(startUrl: string): Promise<{ bytes: Buffer } | { error: string }> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 8000);
  try {
    // Logo services commonly answer with a redirect, so up to three are followed; but every address along the way has to be a
    // public one, so a redirect can never lead into our own network.
    let url = startUrl;
    for (let hop = 0; hop <= 3; hop++) {
      if (!(await isSafeLogoUrl(url))) return { error: hop === 0 ? "not a public web address" : "the address redirects somewhere that is not a public web address" };
      const res = await fetch(url, { signal: ctrl.signal, redirect: "manual", headers: { Accept: "image/*" } });
      if (res.status >= 300 && res.status < 400) {
        const next = res.headers.get("location");
        if (!next) return { error: "the address redirects to nowhere" };
        try { url = new URL(next, url).toString(); } catch { return { error: "the address redirects to something that is not an address" }; }
        continue;
      }
      if (!res.ok) return { error: `the address answered ${res.status}` };
      const len = Number(res.headers.get("content-length") ?? 0);
      if (len > MAX_LOGO_BYTES) return { error: "the image is larger than 3 MB" };
      const bytes = Buffer.from(await res.arrayBuffer());
      if (bytes.length === 0 || bytes.length > MAX_LOGO_BYTES) return { error: "the image is empty or larger than 3 MB" };
      return { bytes };
    }
    return { error: "the address redirects too many times" };
  } catch (e) {
    return { error: e instanceof Error && e.name === "AbortError" ? "the address did not answer in time" : "the address could not be fetched" };
  } finally {
    clearTimeout(timer);
  }
}

/** Copies one version's image into storage and records where, with its checksum. A failure is recorded on the version, not thrown. */
export async function archiveLogoVersion(sb: Sb, tenantId: string, v: Pick<LogoVersion, "id" | "company_id" | "version_number" | "logo_url" | "stored_path">): Promise<WriteResult<{ stored_path: string }>> {
  if (v.stored_path) return { ok: true, value: { stored_path: v.stored_path } };
  const got = await fetchLogoBytes(v.logo_url);
  const fail = async (msg: string): Promise<WriteResult<{ stored_path: string }>> => {
    await sb.from("company_logo_versions").update({ archive_error: msg.slice(0, 300) }).eq("id", v.id).eq("tenant_id", tenantId);
    return { ok: false, status: 502, error: msg };
  };
  if ("error" in got) return fail(got.error);
  const kind = sniffContentType(got.bytes);
  if (!kind || !kind.type.startsWith("image/")) return fail("it is not an image we can keep (PNG, JPEG, WebP or GIF)");
  const sha256 = crypto.createHash("sha256").update(got.bytes).digest("hex");
  const path = `logos/${tenantId}/${v.company_id}/v${v.version_number}-${sha256.slice(0, 12)}.${kind.ext}`;
  const up = await sb.storage.from(LOGO_BUCKET).upload(path, got.bytes, { contentType: kind.type, upsert: true });
  if (up.error) return fail(`could not store it: ${up.error.message}`);
  const { error } = await sb.from("company_logo_versions").update({ stored_path: path, sha256, content_type: kind.type, size_bytes: got.bytes.length, archived_at: new Date().toISOString(), archive_error: null }).eq("id", v.id).eq("tenant_id", tenantId);
  if (error) return { ok: false, status: 500, error: error.message };
  return { ok: true, value: { stored_path: path } };
}

/** Copies every version of a company's logo that has not been copied yet. Never throws: a logo that cannot be kept is recorded as such. */
export async function archivePendingLogos(sb: Sb, tenantId: string, companyId: string): Promise<{ archived: number; failed: number }> {
  try {
    const pending = (await listLogoVersions(sb, tenantId, companyId)).filter((v) => !v.stored_path);
    let archived = 0;
    let failed = 0;
    for (const v of pending) (await archiveLogoVersion(sb, tenantId, v)).ok ? archived++ : failed++;
    return { archived, failed };
  } catch {
    return { archived: 0, failed: 0 };
  }
}

// ── which generated images are out of date ─────────────────────────────────

export interface ImageLogoStatus {
  current_version: number | null;
  /** made from the logo as it is now */
  current: number;
  /** made from a logo that has since been replaced */
  stale: Array<{ job_id: string; job_type: string | null; display_label: string | null; proposal_id: string | null; created_at: string | null; used_version: number }>;
  /** made before versions were recorded, so it is not known */
  unknown: number;
}

export async function imageLogoStatus(sb: Sb, tenantId: string, companyId: string): Promise<WriteResult<ImageLogoStatus>> {
  const { data: versions, error } = await sb.from("company_logo_versions").select("id, version_number").eq("tenant_id", tenantId).eq("company_id", companyId);
  if (error) return isMissingMigration(error) ? { ok: false, status: 503, error: "Logo versions are not set up yet (migration 0074)." } : { ok: false, status: 500, error: error.message };
  const numberOf = new Map(((versions ?? []) as Array<{ id: string; version_number: number }>).map((v) => [v.id, v.version_number]));
  const currentVersion = numberOf.size > 0 ? Math.max(...numberOf.values()) : null;
  const { data: jobs, error: jerr } = await sb.from("image_generation_jobs").select("id, job_type, display_label, proposal_id, created_at, source_logo_version_id, status").eq("tenant_id", tenantId).eq("company_id", companyId).order("created_at", { ascending: false }).limit(1000);
  if (jerr) return { ok: false, status: 500, error: jerr.message };
  const out: ImageLogoStatus = { current_version: currentVersion, current: 0, stale: [], unknown: 0 };
  for (const j of (jobs ?? []) as Array<{ id: string; job_type: string | null; display_label: string | null; proposal_id: string | null; created_at: string | null; source_logo_version_id: string | null; status: string | null }>) {
    if (j.status === "archived" || j.status === "failed" || j.status === "rejected") continue;
    const used = j.source_logo_version_id ? numberOf.get(j.source_logo_version_id) : undefined;
    if (used === undefined) out.unknown++;
    else if (currentVersion !== null && used < currentVersion) out.stale.push({ job_id: j.id, job_type: j.job_type, display_label: j.display_label, proposal_id: j.proposal_id, created_at: j.created_at, used_version: used });
    else out.current++;
  }
  return { ok: true, value: out };
}
