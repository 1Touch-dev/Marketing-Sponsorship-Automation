import { isMissingMigration } from "../proposals/revision-store";
import { deriveStage, type AccountStage } from "./stage";
import { canonicalOf, findCandidates, normalizeCnpj, type Candidate, type CompanyKey } from "./dedup";
import { cleanResearch, validateResearch, type ResearchInput } from "./research";

type Sb = any;

export type WriteResult<T> = { ok: true; value: T } | { ok: false; status: number; error: string };

const RELATIONSHIPS = ["subsidiary", "division", "operation", "brand", "branch"] as const;
export type Relationship = (typeof RELATIONSHIPS)[number];

// ── stage ──────────────────────────────────────────────────────────────────

export interface StageView {
  stage: AccountStage;
  research: { id: string; created_at: string; authored_by_kind: string; authored_by: string; summary: string; recommendation: string; evidence: unknown[]; unverified: unknown[] } | null;
  qualification: { id: string; created_at: string; decision: string; actor_kind: string; qualified_by_email: string; reason: string } | null;
  history: Array<{ at: string; kind: "research" | "qualification"; detail: string; by: string }>;
}

export async function loadStage(sb: Sb, tenantId: string, companyId: string): Promise<WriteResult<StageView>> {
  const [r, q] = await Promise.all([
    sb.from("company_research").select("id, created_at, authored_by_kind, authored_by, summary, recommendation, evidence, unverified").eq("tenant_id", tenantId).eq("company_id", companyId).order("created_at", { ascending: false }),
    sb.from("company_qualifications").select("id, created_at, decision, actor_kind, qualified_by_email, reason").eq("tenant_id", tenantId).eq("company_id", companyId).order("created_at", { ascending: false }),
  ]);
  for (const res of [r, q]) if (res.error) return { ok: false, status: isMissingMigration(res.error) ? 503 : 500, error: isMissingMigration(res.error) ? "Account stages are not set up yet (migration 0058)." : res.error.message };

  const research = (r.data ?? [])[0] ?? null;
  const qualification = (q.data ?? [])[0] ?? null;
  const history = [
    ...(r.data ?? []).map((x: any) => ({ at: x.created_at, kind: "research" as const, detail: `${x.recommendation}: ${x.summary}`, by: `${x.authored_by} (${x.authored_by_kind})` })),
    ...(q.data ?? []).map((x: any) => ({ at: x.created_at, kind: "qualification" as const, detail: `${x.decision}: ${x.reason}`, by: `${x.qualified_by_email}${x.actor_kind === "grandfathered" ? " (grandfathered)" : ""}` })),
  ].sort((a, b) => (a.at < b.at ? 1 : -1));

  return { ok: true, value: { stage: deriveStage({ research, qualification }), research, qualification, history } };
}

// ── research (agents and people) ───────────────────────────────────────────

export async function recordResearch(
  sb: Sb,
  tenantId: string,
  companyId: string,
  input: ResearchInput & { kind: "agent" | "human"; by: string },
): Promise<WriteResult<{ id: string }>> {
  const bad = validateResearch(input);
  if (bad) return { ok: false, status: 400, error: bad };
  const { data: company } = await sb.from("companies").select("id").eq("id", companyId).eq("tenant_id", tenantId).maybeSingle();
  if (!company) return { ok: false, status: 404, error: "Company not found" };

  const clean = cleanResearch(input);
  const { data, error } = await sb
    .from("company_research")
    .insert({ tenant_id: tenantId, company_id: companyId, authored_by_kind: input.kind, authored_by: input.by, ...clean })
    .select("id")
    .single();
  if (error) return { ok: false, status: isMissingMigration(error) ? 503 : 500, error: error.message };
  return { ok: true, value: { id: data.id } };
}

/** Best-effort write for agent code paths: research that cannot be stored never blocks the agent. */
export async function recordAgentResearch(sb: Sb, tenantId: string, companyId: string, agent: string, input: ResearchInput): Promise<void> {
  try {
    await recordResearch(sb, tenantId, companyId, { ...input, kind: "agent", by: agent });
  } catch {
    /* the company is still saved as a directory entry */
  }
}

// ── qualification (people only) ────────────────────────────────────────────

export async function recordQualification(
  sb: Sb,
  tenantId: string,
  companyId: string,
  input: { decision: "qualified" | "disqualified" | "revoked"; reason: string; researchId?: string | null; actorEmail: string; actorUserId: string | null },
): Promise<WriteResult<{ id: string }>> {
  if (!["qualified", "disqualified", "revoked"].includes(input.decision)) return { ok: false, status: 400, error: "decision must be qualified, disqualified or revoked" };
  if (!input.actorEmail) return { ok: false, status: 403, error: "A qualification must be made by a signed-in person." };
  if (!input.reason || input.reason.trim().length < 5) return { ok: false, status: 400, error: "A reason is required: why is this a real sales opportunity (or why not)?" };

  const current = await loadStage(sb, tenantId, companyId);
  if (!current.ok) return current;
  const wasQualified = current.value.qualification?.decision === "qualified";
  if (input.decision === "qualified" && wasQualified) return { ok: false, status: 409, error: "This account is already qualified." };
  if (input.decision === "revoked" && !wasQualified) return { ok: false, status: 409, error: "Only a qualified account can have its qualification revoked." };

  const { data: company } = await sb.from("companies").select("id").eq("id", companyId).eq("tenant_id", tenantId).maybeSingle();
  if (!company) return { ok: false, status: 404, error: "Company not found" };

  const { data, error } = await sb
    .from("company_qualifications")
    .insert({
      tenant_id: tenantId,
      company_id: companyId,
      decision: input.decision,
      actor_kind: "human",
      qualified_by_email: input.actorEmail,
      qualified_by_user: input.actorUserId,
      reason: input.reason.trim(),
      research_id: input.researchId ?? current.value.research?.id ?? null,
    })
    .select("id")
    .single();
  if (error) return { ok: false, status: 500, error: error.message };
  return { ok: true, value: { id: data.id } };
}

// ── structure: parent, duplicate, CNPJ ─────────────────────────────────────

const KEY_COLUMNS = "id, company_name, domain, website, cnpj, parent_company_id, duplicate_of_id";
const KEY_COLUMNS_LEGACY = "id, company_name, domain, website";

/** Every company of a tenant in the shape the duplicate check needs. Works before migration 0058 too. */
export async function loadCompanyIndex(sb: Sb, tenantId: string): Promise<CompanyKey[]> {
  let res = await sb.from("companies").select(KEY_COLUMNS).eq("tenant_id", tenantId).limit(10000);
  if (res.error && isMissingMigration(res.error)) {
    res = await sb.from("companies").select(KEY_COLUMNS_LEGACY).eq("tenant_id", tenantId).limit(10000);
  }
  return (res.data ?? []) as CompanyKey[];
}

/**
 * For code that creates companies on its own (agents, imports): the record a
 * new organization already is, if it is the same entity as one on file.
 * Related companies (a subsidiary, a sibling) do NOT count: they are separate
 * accounts and are reported back for a person to link.
 */
export function existingEntity(probe: Omit<CompanyKey, "id">, index: CompanyKey[]): { existing: CompanyKey | null; related: Candidate[] } {
  const cands = findCandidates({ id: "(new)", ...probe }, index);
  const same = cands.find((c) => c.verdict.kind === "same_entity");
  return { existing: same ? canonicalOf(same.company, index) : null, related: cands.filter((c) => c.verdict.kind === "related") };
}

async function getCompany(sb: Sb, tenantId: string, id: string): Promise<CompanyKey | null> {
  const { data } = await sb.from("companies").select(KEY_COLUMNS).eq("id", id).eq("tenant_id", tenantId).maybeSingle();
  return (data as CompanyKey | null) ?? null;
}

export async function setStructure(
  sb: Sb,
  tenantId: string,
  companyId: string,
  patch: { parent_company_id?: string | null; relationship_to_parent?: Relationship | null; duplicate_of_id?: string | null; cnpj?: string | null },
): Promise<WriteResult<CompanyKey>> {
  const company = await getCompany(sb, tenantId, companyId);
  if (!company) return { ok: false, status: 404, error: "Company not found" };
  const update: Record<string, unknown> = {};

  if ("cnpj" in patch) {
    if (patch.cnpj === null || patch.cnpj === "") update.cnpj = null;
    else {
      const c = normalizeCnpj(patch.cnpj);
      if (!c) return { ok: false, status: 400, error: "cnpj must have 14 digits" };
      update.cnpj = c;
    }
  }

  if ("parent_company_id" in patch) {
    const pid = patch.parent_company_id;
    if (pid === null) {
      update.parent_company_id = null;
      update.relationship_to_parent = null;
    } else if (pid) {
      if (pid === companyId) return { ok: false, status: 400, error: "A company cannot be its own parent." };
      const rel = patch.relationship_to_parent;
      if (!rel || !RELATIONSHIPS.includes(rel)) return { ok: false, status: 400, error: `relationship_to_parent must be one of ${RELATIONSHIPS.join(", ")}` };
      const parent = await getCompany(sb, tenantId, pid);
      if (!parent) return { ok: false, status: 404, error: "Parent company not found" };
      if (parent.duplicate_of_id) return { ok: false, status: 409, error: "That company is marked as a duplicate; link to the record it duplicates." };
      // No cycles: walk up from the parent; the company must not appear.
      let cursor: CompanyKey | null = parent;
      for (let depth = 0; cursor && depth < 25; depth++) {
        if (cursor.id === companyId) return { ok: false, status: 409, error: "That would make a company its own ancestor." };
        cursor = cursor.parent_company_id ? await getCompany(sb, tenantId, cursor.parent_company_id) : null;
      }
      update.parent_company_id = pid;
      update.relationship_to_parent = rel;
    }
  }

  if ("duplicate_of_id" in patch) {
    const did = patch.duplicate_of_id;
    if (did === null) update.duplicate_of_id = null;
    else if (did) {
      if (did === companyId) return { ok: false, status: 400, error: "A company cannot be a duplicate of itself." };
      const target = await getCompany(sb, tenantId, did);
      if (!target) return { ok: false, status: 404, error: "The company it duplicates was not found" };
      if (target.duplicate_of_id) return { ok: false, status: 409, error: "That company is itself marked as a duplicate; use the record it points to." };
      const { count } = await sb.from("companies").select("id", { count: "exact", head: true }).eq("tenant_id", tenantId).eq("parent_company_id", companyId);
      if ((count ?? 0) > 0) return { ok: false, status: 409, error: "This company has subsidiaries linked to it. Move them to the other record first." };
      update.duplicate_of_id = did;
    }
  }

  if (Object.keys(update).length === 0) return { ok: false, status: 400, error: "Nothing to change" };
  const { data, error } = await sb.from("companies").update(update).eq("id", companyId).eq("tenant_id", tenantId).select(KEY_COLUMNS).single();
  if (error) return { ok: false, status: isMissingMigration(error) ? 503 : 500, error: isMissingMigration(error) ? "Company structure is not set up yet (migration 0058)." : error.message };
  return { ok: true, value: data as CompanyKey };
}
