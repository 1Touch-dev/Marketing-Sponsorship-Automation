import { isMissingMigration } from "../proposals/revision-store";
import {
  evaluateClaim,
  SOURCE_KINDS,
  type ClaimEvaluation,
  type ClaimVersionFacts,
  type ReviewFact,
  type SourceKind,
} from "./status";

type Sb = any;

export interface ClaimVersionRow extends ClaimVersionFacts {
  id: string;
  claim_id: string;
  version: number;
  value: string;
  unit: string | null;
  description: string | null;
  source_url: string | null;
  created_by_email: string | null;
  created_at: string;
}

export interface ReviewRow extends ReviewFact {
  id: string;
  claim_version_id: string;
  reviewer_email: string | null;
  note: string | null;
}

export interface RegistryEntry {
  id: string;
  key: string;
  category: string;
  label: string;
  retired_at: string | null;
  /** The newest version. Older ones are history; only this one can be shown. */
  current: ClaimVersionRow;
  versionCount: number;
  reviews: ReviewRow[];
  evaluation: ClaimEvaluation;
}

export type LoadResult =
  | { ok: true; entries: RegistryEntry[] }
  | { ok: false; reason: "migration_missing" | "error"; error?: string };

const VERSION_COLUMNS =
  "id, claim_id, version, value, unit, description, source_kind, source_ref, source_url, effective_date, expires_at, owner, created_by_email, created_at";

export async function loadRegistry(sb: Sb, tenantId: string, now: Date = new Date()): Promise<LoadResult> {
  const [claimsRes, versionsRes, reviewsRes] = await Promise.all([
    sb.from("claims").select("id, key, category, label, retired_at").eq("tenant_id", tenantId).order("category").order("key"),
    sb.from("claim_versions").select(VERSION_COLUMNS).eq("tenant_id", tenantId).order("version", { ascending: false }),
    sb
      .from("claim_reviews")
      .select("id, claim_version_id, decision, reviewer_email, note, created_at")
      .eq("tenant_id", tenantId)
      .order("created_at", { ascending: true }),
  ]);

  for (const res of [claimsRes, versionsRes, reviewsRes]) {
    if (res.error) {
      return isMissingMigration(res.error)
        ? { ok: false, reason: "migration_missing" }
        : { ok: false, reason: "error", error: res.error.message };
    }
  }

  const versionsByClaim = new Map<string, ClaimVersionRow[]>();
  for (const v of (versionsRes.data ?? []) as ClaimVersionRow[]) {
    const list = versionsByClaim.get(v.claim_id) ?? [];
    list.push(v);
    versionsByClaim.set(v.claim_id, list);
  }
  const reviewsByVersion = new Map<string, ReviewRow[]>();
  for (const r of (reviewsRes.data ?? []) as ReviewRow[]) {
    const list = reviewsByVersion.get(r.claim_version_id) ?? [];
    list.push(r);
    reviewsByVersion.set(r.claim_version_id, list);
  }

  const entries: RegistryEntry[] = [];
  for (const c of (claimsRes.data ?? []) as Array<{ id: string; key: string; category: string; label: string; retired_at: string | null }>) {
    const versions = versionsByClaim.get(c.id) ?? [];
    const current = versions[0]; // newest first
    if (!current) continue; // a claim with no version has nothing to evaluate
    const reviews = reviewsByVersion.get(current.id) ?? [];
    entries.push({
      ...c,
      current,
      versionCount: versions.length,
      reviews,
      evaluation: evaluateClaim({ version: current, reviews, retired: !!c.retired_at, now }),
    });
  }
  return { ok: true, entries };
}

export interface VersionInput {
  value: string;
  unit?: string | null;
  description?: string | null;
  source_kind: SourceKind;
  source_ref?: string | null;
  source_url?: string | null;
  effective_date?: string | null;
  expires_at?: string | null;
  owner?: string | null;
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const clean = (s: string | null | undefined) => (s && s.trim() !== "" ? s.trim() : null);

/** Returns an error message, or null when the input is acceptable. */
export function validateVersionInput(v: VersionInput): string | null {
  if (!clean(v.value)) return "value is required";
  if (!SOURCE_KINDS.includes(v.source_kind)) return `source_kind must be one of ${SOURCE_KINDS.join(", ")}`;
  for (const f of ["effective_date", "expires_at"] as const) {
    const d = clean(v[f]);
    if (d && !DATE_RE.test(d)) return `${f} must be YYYY-MM-DD`;
  }
  const eff = clean(v.effective_date);
  const exp = clean(v.expires_at);
  if (eff && exp && exp < eff) return "expires_at cannot be before effective_date";
  return null;
}

function versionPayload(v: VersionInput) {
  return {
    value: clean(v.value),
    unit: clean(v.unit),
    description: clean(v.description),
    source_kind: v.source_kind,
    source_ref: clean(v.source_ref),
    source_url: clean(v.source_url),
    effective_date: clean(v.effective_date),
    expires_at: clean(v.expires_at),
    owner: clean(v.owner),
  };
}

export type WriteResult<T> = { ok: true; value: T } | { ok: false; status: number; error: string };

export async function createClaim(
  sb: Sb,
  tenantId: string,
  input: { key: string; category: string; label: string; version: VersionInput; createdByEmail: string | null },
): Promise<WriteResult<{ claimId: string; versionId: string }>> {
  const key = input.key.trim();
  if (!/^[a-z0-9_]+(\.[a-z0-9_]+)*$/.test(key)) return { ok: false, status: 400, error: "key must be lowercase dotted words, e.g. club.avg_attendance" };
  if (!input.label.trim()) return { ok: false, status: 400, error: "label is required" };
  const bad = validateVersionInput(input.version);
  if (bad) return { ok: false, status: 400, error: bad };

  const { data: claim, error } = await sb
    .from("claims")
    .insert({ tenant_id: tenantId, key, category: input.category.trim() || "general", label: input.label.trim() })
    .select("id")
    .single();
  if (error) {
    if (error.code === "23505") return { ok: false, status: 409, error: `A claim with key "${key}" already exists. Add a version to it instead.` };
    return { ok: false, status: 500, error: error.message };
  }

  const { data: version, error: vErr } = await sb
    .from("claim_versions")
    .insert({ tenant_id: tenantId, claim_id: claim.id, version: 1, created_by_email: input.createdByEmail, ...versionPayload(input.version) })
    .select("id")
    .single();
  if (vErr) {
    await sb.from("claims").delete().eq("id", claim.id); // no version was written, so nothing is lost
    return { ok: false, status: 500, error: vErr.message };
  }
  return { ok: true, value: { claimId: claim.id, versionId: version.id } };
}

/** A changed figure is a new version. It has no review, so it must be re-verified. */
export async function addVersion(
  sb: Sb,
  tenantId: string,
  claimId: string,
  input: VersionInput,
  createdByEmail: string | null,
): Promise<WriteResult<{ versionId: string; version: number }>> {
  const bad = validateVersionInput(input);
  if (bad) return { ok: false, status: 400, error: bad };

  const { data: claim } = await sb.from("claims").select("id, retired_at").eq("id", claimId).eq("tenant_id", tenantId).maybeSingle();
  if (!claim) return { ok: false, status: 404, error: "Claim not found" };
  if (claim.retired_at) return { ok: false, status: 409, error: "This claim is retired" };

  for (let attempt = 0; attempt < 2; attempt++) {
    const { data: latest } = await sb
      .from("claim_versions")
      .select("version")
      .eq("claim_id", claimId)
      .order("version", { ascending: false })
      .limit(1)
      .maybeSingle();
    const next = ((latest?.version as number | undefined) ?? 0) + 1;
    const { data, error } = await sb
      .from("claim_versions")
      .insert({ tenant_id: tenantId, claim_id: claimId, version: next, created_by_email: createdByEmail, ...versionPayload(input) })
      .select("id")
      .single();
    if (!error) return { ok: true, value: { versionId: data.id, version: next } };
    if (error.code !== "23505") return { ok: false, status: 500, error: error.message };
    // Someone else added a version at the same moment; read again and take the next number.
  }
  return { ok: false, status: 409, error: "Another version was added at the same time. Try again." };
}

export async function recordReview(
  sb: Sb,
  tenantId: string,
  claimId: string,
  input: { versionId: string; decision: "verified" | "disputed"; note?: string | null; reviewerId: string | null; reviewerEmail: string | null },
): Promise<WriteResult<{ reviewId: string }>> {
  if (input.decision !== "verified" && input.decision !== "disputed") return { ok: false, status: 400, error: "decision must be verified or disputed" };
  if (input.decision === "disputed" && !clean(input.note)) return { ok: false, status: 400, error: "A note explaining the dispute is required" };

  const { data: claim } = await sb.from("claims").select("id, retired_at").eq("id", claimId).eq("tenant_id", tenantId).maybeSingle();
  if (!claim) return { ok: false, status: 404, error: "Claim not found" };
  if (claim.retired_at) return { ok: false, status: 409, error: "This claim is retired" };

  const { data: latest } = await sb
    .from("claim_versions")
    .select("id, version, created_by_email")
    .eq("claim_id", claimId)
    .order("version", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!latest) return { ok: false, status: 404, error: "Claim has no version" };
  if (latest.id !== input.versionId) {
    return { ok: false, status: 409, error: `Version ${input.versionId} is no longer the current one (current is v${latest.version}). Review the current version.` };
  }

  // The person who recorded the figure cannot also be the one who verifies it.
  const author = (latest.created_by_email as string | null)?.toLowerCase();
  if (input.decision === "verified" && author && input.reviewerEmail && author === input.reviewerEmail.toLowerCase()) {
    return { ok: false, status: 403, error: "A second person must verify this figure: you recorded this version." };
  }

  const { data, error } = await sb
    .from("claim_reviews")
    .insert({
      tenant_id: tenantId,
      claim_id: claimId,
      claim_version_id: latest.id,
      decision: input.decision,
      note: clean(input.note),
      reviewer_user_id: input.reviewerId,
      reviewer_email: input.reviewerEmail,
    })
    .select("id")
    .single();
  if (error) return { ok: false, status: 500, error: error.message };
  return { ok: true, value: { reviewId: data.id } };
}

export async function setRetired(sb: Sb, tenantId: string, claimId: string, retired: boolean): Promise<WriteResult<null>> {
  const { data, error } = await sb
    .from("claims")
    .update({ retired_at: retired ? new Date().toISOString() : null })
    .eq("id", claimId)
    .eq("tenant_id", tenantId)
    .select("id")
    .maybeSingle();
  if (error) return { ok: false, status: 500, error: error.message };
  if (!data) return { ok: false, status: 404, error: "Claim not found" };
  return { ok: true, value: null };
}
