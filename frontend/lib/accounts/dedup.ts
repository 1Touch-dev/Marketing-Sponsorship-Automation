/**
 * Telling the same company from a related one (Task 10).
 *
 * "Banco Itaú" and "Banco Itaú (operações PR)", "Volvo CE" and "Volvo do
 * Brasil", "Ambev Brasil" and "Ambev SA" all look alike, but some are one
 * entity entered twice and some are a parent and its subsidiary, which must
 * stay two accounts. So structure decides before names do:
 *
 *   1. an existing link (parent, sibling or marked duplicate) settles it
 *   2. a CNPJ settles it (same number = same entity, same first 8 digits =
 *      branches of one legal entity, different roots = different entities,
 *      however alike the names)
 *   3. only then website and name evidence, and a name match alone is never "high"
 *
 * Nothing here merges anything. It only classifies pairs for a person to decide.
 */

export interface CompanyKey {
  id: string;
  company_name: string;
  domain?: string | null;
  website?: string | null;
  cnpj?: string | null;
  parent_company_id?: string | null;
  duplicate_of_id?: string | null;
}

export type PairKind = "same_entity" | "related" | "distinct";
export type Confidence = "high" | "medium" | "low";

export interface PairVerdict {
  kind: PairKind;
  confidence: Confidence;
  reasons: string[];
}

const LEGAL_SUFFIXES = new Set(["sa", "s", "a", "ltda", "ltd", "me", "epp", "eireli", "cia", "inc", "llc", "gmbh"]);

/** Lower-case, accent-free, without parentheses ("(op PR)"), punctuation or legal suffixes. */
export function normalizeName(name: string): string {
  return name
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/\([^)]*\)/g, " ")
    .replace(/[^a-z0-9]+/g, " ")
    .split(" ")
    .filter((t) => t && !LEGAL_SUFFIXES.has(t))
    .join(" ")
    .trim();
}

/**
 * The parenthetical qualifier of a name: "(op PR)" and "(operação PR)" are the same
 * qualifier, "(planta PR)" is another, and no parenthesis is the company as a whole.
 */
export function qualifierOf(name: string): string {
  const groups = name.match(/\([^)]*\)/g) ?? [];
  return groups
    .map((g) =>
      g
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, " ")
        .split(" ")
        .filter(Boolean)
        .map((t) => (t === "operacao" || t === "operacoes" || t === "op" ? "op" : t))
        .join(" "),
    )
    .join(" ")
    .trim();
}

const SECOND_LEVEL = new Set(["com", "org", "net", "gov", "edu", "ind", "adv", "coop"]);

/** "https://www.itau.com.br/x" -> "itau.com.br"; null when there is no usable host. */
export function registrableDomain(input: string | null | undefined): string | null {
  if (!input) return null;
  let host = input.trim().toLowerCase();
  host = host.replace(/^[a-z]+:\/\//, "").split(/[/?#]/)[0].split(":")[0].replace(/^www\./, "");
  if (!host || !host.includes(".")) return null;
  const labels = host.split(".");
  if (labels.length <= 2) return host;
  const tld = labels[labels.length - 1];
  const sld = labels[labels.length - 2];
  const keep = tld.length === 2 && SECOND_LEVEL.has(sld) ? 3 : 2;
  return labels.slice(-keep).join(".");
}

export function normalizeCnpj(input: string | null | undefined): string | null {
  const digits = (input ?? "").replace(/\D/g, "");
  return digits.length === 14 ? digits : null;
}

export const cnpjRoot = (cnpj: string | null | undefined): string | null => normalizeCnpj(cnpj)?.slice(0, 8) ?? null;

const domainOf = (c: CompanyKey) => registrableDomain(c.domain) ?? registrableDomain(c.website);

/** True when every token of the shorter name starts the longer one (volvo / volvo do brasil). */
function nameContains(a: string, b: string): boolean {
  const [short, long] = a.length <= b.length ? [a, b] : [b, a];
  if (short.length < 3 || short === long) return false; // 3 keeps acronyms like WEG and JBS
  return long.startsWith(short + " ");
}

export function classifyPair(a: CompanyKey, b: CompanyKey): PairVerdict {
  const reasons: string[] = [];

  // 1. Structure already recorded.
  if (a.duplicate_of_id === b.id || b.duplicate_of_id === a.id) {
    return { kind: "same_entity", confidence: "high", reasons: ["already marked as a duplicate"] };
  }
  if (a.parent_company_id === b.id || b.parent_company_id === a.id) {
    return { kind: "related", confidence: "high", reasons: ["already linked as parent and subsidiary"] };
  }
  if (a.parent_company_id && a.parent_company_id === b.parent_company_id) {
    return { kind: "related", confidence: "high", reasons: ["already linked under the same parent"] };
  }

  // 2. Legal identity.
  const ca = normalizeCnpj(a.cnpj);
  const cb = normalizeCnpj(b.cnpj);
  if (ca && cb) {
    if (ca === cb) return { kind: "same_entity", confidence: "high", reasons: ["same CNPJ"] };
    if (ca.slice(0, 8) === cb.slice(0, 8)) {
      return { kind: "related", confidence: "high", reasons: ["same CNPJ root: branches of one legal entity"] };
    }
    return { kind: "distinct", confidence: "high", reasons: ["different CNPJ roots: different legal entities"] };
  }

  // 3. Website and name.
  const da = domainOf(a);
  const db = domainOf(b);
  const na = normalizeName(a.company_name);
  const nb = normalizeName(b.company_name);
  const sameName = na !== "" && na === nb;
  const sameDomain = !!da && da === db;

  // The same company name with a different qualifier is a different operation of it
  // ("Banco Itaú" / "Banco Itaú (operações PR)"): related, not a duplicate.
  if (sameName && qualifierOf(a.company_name) !== qualifierOf(b.company_name)) {
    return { kind: "related", confidence: "medium", reasons: ["same company name, different qualifier (an operation or plant of it)"] };
  }

  if (sameDomain && sameName) {
    return { kind: "same_entity", confidence: "high", reasons: ["same website and same name"] };
  }
  if (sameName) {
    if (da && db && da !== db) {
      return { kind: "related", confidence: "low", reasons: ["same name but different websites"] };
    }
    return { kind: "same_entity", confidence: "medium", reasons: ["same name (no website to confirm)"] };
  }
  if (sameDomain) {
    reasons.push(`share the website ${da}`);
    return { kind: "related", confidence: "medium", reasons };
  }
  if (nameContains(na, nb)) {
    return { kind: "related", confidence: "low", reasons: ["one name contains the other"] };
  }
  return { kind: "distinct", confidence: "low", reasons: [] };
}

export interface Candidate {
  company: CompanyKey;
  verdict: PairVerdict;
}

const RANK: Record<string, number> = { "same_entity:high": 0, "same_entity:medium": 1, "related:high": 2, "related:medium": 3, "related:low": 4 };

/** Everything in `index` that is, or may be, the same as or related to `probe`. */
export function findCandidates(probe: CompanyKey, index: CompanyKey[]): Candidate[] {
  const out: Candidate[] = [];
  for (const c of index) {
    if (c.id === probe.id) continue;
    const verdict = classifyPair(probe, c);
    if (verdict.kind !== "distinct") out.push({ company: c, verdict });
  }
  return out.sort((x, y) => (RANK[`${x.verdict.kind}:${x.verdict.confidence}`] ?? 9) - (RANK[`${y.verdict.kind}:${y.verdict.confidence}`] ?? 9));
}

/** What to do when creating `probe`: stop for a likely duplicate, warn for a relative, otherwise go ahead. */
export function creationDecision(candidates: Candidate[]): "block" | "warn" | "ok" {
  if (candidates.some((c) => c.verdict.kind === "same_entity")) return "block";
  if (candidates.length > 0) return "warn";
  return "ok";
}

/** Follows a "marked as duplicate of" pointer one hop, so a probe lands on the record people actually use. */
export function canonicalOf(company: CompanyKey, index: CompanyKey[]): CompanyKey {
  if (!company.duplicate_of_id) return company;
  return index.find((c) => c.id === company.duplicate_of_id) ?? company;
}

export interface DuplicateGroup {
  kind: "same_entity" | "related";
  members: CompanyKey[];
  reasons: string[];
}

/**
 * Groups the whole list for review. Pairs are only compared inside buckets
 * (same website, same CNPJ root, same first name token) so a large list stays cheap.
 * Records already marked as duplicates are left out: they have been decided.
 */
export function findGroups(companies: CompanyKey[]): DuplicateGroup[] {
  const live = companies.filter((c) => !c.duplicate_of_id);
  const buckets = new Map<string, CompanyKey[]>();
  const add = (k: string | null, c: CompanyKey) => {
    if (!k) return;
    const list = buckets.get(k) ?? [];
    list.push(c);
    buckets.set(k, list);
  };
  for (const c of live) {
    add(domainOf(c) && `d:${domainOf(c)}`, c);
    add(cnpjRoot(c.cnpj) && `c:${cnpjRoot(c.cnpj)}`, c);
    const first = normalizeName(c.company_name).split(" ")[0];
    add(first && first.length >= 2 ? `n:${first}` : null, c);
  }

  const seen = new Set<string>();
  const edges: Array<{ a: CompanyKey; b: CompanyKey; v: PairVerdict }> = [];
  for (const list of buckets.values()) {
    for (let i = 0; i < list.length; i++) {
      for (let j = i + 1; j < list.length; j++) {
        const key = [list[i].id, list[j].id].sort().join("|");
        if (seen.has(key)) continue;
        seen.add(key);
        const v = classifyPair(list[i], list[j]);
        if (v.kind !== "distinct") edges.push({ a: list[i], b: list[j], v });
      }
    }
  }

  // Join the pairs of each kind into groups: anything connected by a pair is one group.
  const groups: DuplicateGroup[] = [];
  for (const kind of ["same_entity", "related"] as const) {
    const root = new Map<string, string>();
    const rootOf = (id: string): string => {
      let r = id;
      while (root.has(r) && root.get(r) !== r) r = root.get(r) as string;
      return r;
    };
    const byId = new Map<string, CompanyKey>();
    const kindEdges = edges.filter((e) => e.v.kind === kind);
    for (const e of kindEdges) {
      byId.set(e.a.id, e.a);
      byId.set(e.b.id, e.b);
      if (!root.has(e.a.id)) root.set(e.a.id, e.a.id);
      if (!root.has(e.b.id)) root.set(e.b.id, e.b.id);
      root.set(rootOf(e.a.id), rootOf(e.b.id));
    }
    const members = new Map<string, CompanyKey[]>();
    for (const [id, c] of byId) {
      const r = rootOf(id);
      members.set(r, [...(members.get(r) ?? []), c]);
    }
    const reasons = new Map<string, Set<string>>();
    for (const e of kindEdges) {
      const r = rootOf(e.a.id);
      const set = reasons.get(r) ?? new Set<string>();
      e.v.reasons.forEach((x) => set.add(x));
      reasons.set(r, set);
    }
    for (const [r, list] of members) {
      groups.push({ kind, members: list.sort((x, y) => x.company_name.localeCompare(y.company_name)), reasons: Array.from(reasons.get(r) ?? []) });
    }
  }
  return groups.sort((x, y) => (x.kind === y.kind ? y.members.length - x.members.length : x.kind === "same_entity" ? -1 : 1));
}
