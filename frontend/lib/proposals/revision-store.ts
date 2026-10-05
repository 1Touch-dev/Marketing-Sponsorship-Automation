import {
  buildQuoteLines,
  compareToApproved,
  quoteTotal,
  revisionChecksum,
  type Drift,
  type LineRow,
  type Snapshot,
} from "./revisions";

type Sb = any;

const BASE_LINE_COLUMNS = "id, inventory_id, quantity, scope, unit_type, currency, price_agreed, inventory_items(name)";
const FULL_LINE_COLUMNS = `${BASE_LINE_COLUMNS}, discount_pct, discount_authorized_by, tax_treatment, period_label`;

/** True when the error means migration 0052 has not been applied yet. */
export function isMissingMigration(err: { message?: string; code?: string } | null | undefined): boolean {
  if (!err) return false;
  const m = (err.message ?? "").toLowerCase();
  return (
    err.code === "42P01" ||
    err.code === "42703" ||
    err.code === "PGRST205" ||
    err.code === "PGRST204" ||
    m.includes("does not exist") ||
    m.includes("could not find") ||
    m.includes("schema cache")
  );
}

export async function loadSnapshot(sb: Sb, tenantId: string, proposalId: string): Promise<{ snapshot: Snapshot; status: string } | null> {
  const { data: proposal } = await sb
    .from("proposals")
    .select("id, title, content, status")
    .eq("id", proposalId)
    .eq("tenant_id", tenantId)
    .maybeSingle();
  if (!proposal) return null;

  let res = await sb.from("proposal_inventory_items").select(FULL_LINE_COLUMNS).eq("proposal_id", proposalId).eq("tenant_id", tenantId);
  if (res.error && isMissingMigration(res.error)) {
    res = await sb.from("proposal_inventory_items").select(BASE_LINE_COLUMNS).eq("proposal_id", proposalId).eq("tenant_id", tenantId);
  }

  const rows = ((res.data ?? []) as Array<LineRow & { inventory_items?: { name: string } | { name: string }[] | null }>).map((r) => {
    const inv = Array.isArray(r.inventory_items) ? r.inventory_items[0] : r.inventory_items;
    return { ...r, name: inv?.name ?? null };
  });

  return {
    status: (proposal as { status: string }).status,
    snapshot: {
      title: (proposal as { title: string | null }).title,
      content: ((proposal as { content: Record<string, unknown> | null }).content ?? {}) as Record<string, unknown>,
      lines: buildQuoteLines(rows),
    },
  };
}

export type FrozenRevision = { id: string; revision_number: number; checksum: string; total_brl: number; created: boolean };

export type FreezeResult =
  | { ok: true; revision: FrozenRevision }
  | { ok: false; skipped: "migration_missing" | "not_found" | "error"; error?: string };

/**
 * Freezes the proposal's current commercial terms as a new immutable
 * revision. If the latest revision already has the same checksum, that one is
 * returned instead of creating a duplicate.
 */
export async function freezeRevision(
  sb: Sb,
  tenantId: string,
  proposalId: string,
  opts: { reason: string; userId?: string | null },
): Promise<FreezeResult> {
  const loaded = await loadSnapshot(sb, tenantId, proposalId);
  if (!loaded) return { ok: false, skipped: "not_found" };
  const { snapshot } = loaded;
  const checksum = revisionChecksum(snapshot);

  const { data: latest, error: latestErr } = await sb
    .from("proposal_revisions")
    .select("id, revision_number, checksum, total_brl")
    .eq("proposal_id", proposalId)
    .order("revision_number", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (latestErr) {
    return isMissingMigration(latestErr) ? { ok: false, skipped: "migration_missing" } : { ok: false, skipped: "error", error: latestErr.message };
  }
  if (latest && (latest as { checksum: string }).checksum === checksum) {
    const l = latest as { id: string; revision_number: number; checksum: string; total_brl: number | string };
    return { ok: true, revision: { id: l.id, revision_number: l.revision_number, checksum: l.checksum, total_brl: Number(l.total_brl), created: false } };
  }

  const nextNumber = ((latest as { revision_number: number } | null)?.revision_number ?? 0) + 1;
  const total = quoteTotal(snapshot.lines);
  const { data: inserted, error: insErr } = await sb
    .from("proposal_revisions")
    .insert({
      tenant_id: tenantId,
      proposal_id: proposalId,
      revision_number: nextNumber,
      content: snapshot.content,
      lines: snapshot.lines,
      total_brl: total,
      currency: "BRL",
      checksum,
      reason: opts.reason,
      created_by: opts.userId ?? null,
    })
    .select("id, revision_number, checksum, total_brl")
    .single();
  if (insErr || !inserted) {
    return isMissingMigration(insErr) ? { ok: false, skipped: "migration_missing" } : { ok: false, skipped: "error", error: insErr?.message };
  }
  const i = inserted as { id: string; revision_number: number; checksum: string; total_brl: number | string };
  return { ok: true, revision: { id: i.id, revision_number: i.revision_number, checksum: i.checksum, total_brl: Number(i.total_brl), created: true } };
}

/** Freezes and binds the proposal's approval to that revision. */
export async function approveRevision(
  sb: Sb,
  tenantId: string,
  proposalId: string,
  opts: { reason: string; userId?: string | null },
): Promise<FreezeResult> {
  const frozen = await freezeRevision(sb, tenantId, proposalId, opts);
  if (!frozen.ok) return frozen;
  const { error } = await sb
    .from("proposals")
    .update({ approved_revision_id: frozen.revision.id })
    .eq("id", proposalId)
    .eq("tenant_id", tenantId);
  if (error) return isMissingMigration(error) ? { ok: false, skipped: "migration_missing" } : { ok: false, skipped: "error", error: error.message };
  return frozen;
}

export type DriftCheck =
  | { ok: true; drift: Drift; approvedRevisionId: string | null; status: string }
  | { ok: false; skipped: "migration_missing" | "not_found" };

/** Compares the proposal's current terms with the revision its approval is bound to. */
export async function checkProposalDrift(sb: Sb, tenantId: string, proposalId: string): Promise<DriftCheck> {
  const loaded = await loadSnapshot(sb, tenantId, proposalId);
  if (!loaded) return { ok: false, skipped: "not_found" };

  const { data: prop, error } = await sb
    .from("proposals")
    .select("approved_revision_id")
    .eq("id", proposalId)
    .eq("tenant_id", tenantId)
    .maybeSingle();
  if (error) return isMissingMigration(error) ? { ok: false, skipped: "migration_missing" } : { ok: false, skipped: "not_found" };

  const approvedRevisionId = (prop as { approved_revision_id: string | null } | null)?.approved_revision_id ?? null;
  let approvedChecksum: string | null = null;
  if (approvedRevisionId) {
    const { data: rev } = await sb.from("proposal_revisions").select("checksum").eq("id", approvedRevisionId).maybeSingle();
    approvedChecksum = (rev as { checksum: string } | null)?.checksum ?? null;
  }
  return { ok: true, drift: compareToApproved(approvedChecksum, loaded.snapshot), approvedRevisionId, status: loaded.status };
}
