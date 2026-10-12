type Sb = any;
type Rec = Record<string, unknown>;

/**
 * The wording a sponsor is shown for an approved proposal: the frozen revision the approval is bound to
 * (`proposals.approved_revision_id`), never the live row. A save that changes approved wording clears the approval
 * for staff (migration 0052); this is the matching rule for sponsors, so text edited after approval cannot reach a
 * sponsor before it has been approved again.
 *
 * What a revision freezes is the title, the content and the quote lines. Pricing tiers and strategy variants are not part
 * of it (see BLOCKERS_REGISTER P7-01), so they are still read from the live row.
 *
 * A proposal approved before revisions existed has none. It is shown as it always was and says so (`approval_frozen:
 * false`) until staff freeze it (`POST /api/proposals/freeze-approved`), rather than disappearing from every sponsor.
 */
export interface FrozenRevision {
  id: string;
  proposal_id: string;
  revision_number: number;
  title: string | null;
  content: Rec;
  created_at: string | null;
}

const isRec = (v: unknown): v is Rec => !!v && typeof v === "object" && !Array.isArray(v);

/** The approved revision of each proposal that has one, keyed by proposal id. A revision that belongs to another proposal or club is ignored. */
export async function loadFrozenRevisions(sb: Sb, tenantId: string, rows: Array<{ id: string; approved_revision_id?: string | null }>): Promise<Map<string, FrozenRevision>> {
  const out = new Map<string, FrozenRevision>();
  const ids = Array.from(new Set(rows.map((r) => r.approved_revision_id).filter((v): v is string => typeof v === "string" && v.length > 0)));
  if (ids.length === 0) return out;
  // `title` arrived with migration 0055; before it the column is absent, and the title is then read from the content.
  let res = await sb.from("proposal_revisions").select("id, proposal_id, revision_number, title, content, created_at").in("id", ids).eq("tenant_id", tenantId);
  if (res.error) res = await sb.from("proposal_revisions").select("id, proposal_id, revision_number, content, created_at").in("id", ids).eq("tenant_id", tenantId);
  if (res.error) return out;
  const byId = new Map((res.data as FrozenRevision[]).map((r) => [r.id, r]));
  for (const row of rows) {
    const rev = row.approved_revision_id ? byId.get(row.approved_revision_id) : undefined;
    if (rev && rev.proposal_id === row.id) out.set(row.id, { ...rev, content: isRec(rev.content) ? rev.content : {} });
  }
  return out;
}

/**
 * The row as a sponsor should see it: title, content and version from the frozen revision when there is one. The result
 * still goes through the sponsor allow-list; this only decides WHICH wording that list is applied to.
 */
export function withFrozen<T extends Rec>(row: T, frozen: FrozenRevision | undefined): T & { approval_frozen: boolean; approved_revision_number: number | null } {
  if (!frozen) return { ...row, approval_frozen: false, approved_revision_number: null };
  const contentTitle = typeof frozen.content.title === "string" ? frozen.content.title : null;
  return {
    ...row,
    title: frozen.title ?? contentTitle ?? row.title,
    content: frozen.content,
    version: frozen.revision_number,
    approval_frozen: true,
    approved_revision_number: frozen.revision_number,
  };
}

/**
 * An approval that points at a revision which cannot be used (gone, another proposal's, another club's) is not the same as
 * one with no revision at all. Nothing is known about what was approved, so the sponsor is shown nothing rather than the
 * live text.
 */
export const approvalIsBroken = (row: { approved_revision_id?: string | null }, frozen: FrozenRevision | undefined): boolean => !!row.approved_revision_id && !frozen;
