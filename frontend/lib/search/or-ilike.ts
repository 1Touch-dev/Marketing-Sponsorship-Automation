type Sb = any;

/** Strip PostgREST wildcard characters so a search term cannot widen the match. */
export function sanitizeSearchTerm(raw: string): string {
  return raw.replace(/[%_]/g, "").trim();
}

/** Quote the ilike pattern when the term has spaces or quotes, so `.or()` stays one clause. */
export function ilikeClause(column: string, term: string): string {
  const pattern = `%${term}%`;
  if (/[\s,"]/.test(term)) {
    return `${column}.ilike."${pattern.replace(/"/g, '\\"')}"`;
  }
  return `${column}.ilike.${pattern}`;
}

/**
 * Text search for a list table. Only columns on that table — never `companies.company_name`
 * inside `.or()`, which PostgREST treats as a broken filter and returns zero rows.
 */
export function buildListTextSearchOr(input: {
  term: string;
  columns: string[];
  companyIds?: string[];
}): string | null {
  const term = sanitizeSearchTerm(input.term);
  if (!term) return null;

  const parts = input.columns.filter(Boolean).map((column) => ilikeClause(column, term));
  const ids = (input.companyIds ?? []).filter((id) => /^[0-9a-f-]{36}$/i.test(id));
  if (ids.length > 0) parts.push(`company_id.in.(${ids.join(",")})`);
  return parts.length > 0 ? parts.join(",") : null;
}

export async function matchingCompanyIds(sb: Sb, tenantId: string, term: string): Promise<string[]> {
  const safe = sanitizeSearchTerm(term);
  if (!safe) return [];

  const { data, error } = await sb
    .from("companies")
    .select("id")
    .eq("tenant_id", tenantId)
    .ilike("company_name", `%${safe}%`)
    .limit(200);

  if (error || !data) return [];
  return (data as Array<{ id: string }>).map((row) => row.id).filter(Boolean);
}
