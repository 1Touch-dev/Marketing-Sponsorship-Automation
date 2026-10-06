import assert from "node:assert/strict";
import test from "node:test";
import {
  qualifierOf, canonicalOf, classifyPair, cnpjRoot, creationDecision, findCandidates, findGroups,
  normalizeCnpj, normalizeName, registrableDomain, type CompanyKey,
} from "../lib/accounts/dedup";
import { deriveStage, QUALIFYING_PIPELINE_STAGES } from "../lib/accounts/stage";
import { cleanResearch, validateResearch, type ResearchInput } from "../lib/accounts/research";
import { existingEntity, recordQualification } from "../lib/accounts/store";

let n = 0;
const co = (company_name: string, over: Partial<CompanyKey> = {}): CompanyKey => ({ id: `c${++n}`, company_name, ...over });

// ── names, domains, CNPJ ────────────────────────────────────────────────────

test("names are compared without accents, punctuation, parentheses or legal suffixes", () => {
  assert.equal(normalizeName("Banco Itaú S.A."), "banco itau");
  assert.equal(normalizeName("Tigre Tubos e Conexões (op PR)"), normalizeName("Tigre Tubos e Conexões (operação PR)"));
  assert.equal(normalizeName("Positivo Tecnologia LTDA"), "positivo tecnologia");
  assert.equal(normalizeName("Banco do Brasil"), "banco do brasil"); // "Brasil" is part of the name, not noise
});

test("a website reduces to its registrable domain", () => {
  assert.equal(registrableDomain("https://www.itau.com.br/empresas?x=1"), "itau.com.br");
  assert.equal(registrableDomain("ambev.com.br"), "ambev.com.br");
  assert.equal(registrableDomain("https://blog.example.com/a"), "example.com");
  assert.equal(registrableDomain("itau"), null);
  assert.equal(registrableDomain(null), null);
});

test("a CNPJ is 14 digits and its root is the first 8", () => {
  assert.equal(normalizeCnpj("60.701.190/0001-04"), "60701190000104");
  assert.equal(normalizeCnpj("123"), null);
  assert.equal(cnpjRoot("60.701.190/0001-04"), "60701190");
});

// ── same entity or related ──────────────────────────────────────────────────

test("structure outranks names: different CNPJ roots stay distinct even with identical names", () => {
  const a = co("Sicredi Paraná", { cnpj: "01234567000101" });
  const b = co("Sicredi Paraná", { cnpj: "76543210000199" });
  assert.equal(classifyPair(a, b).kind, "distinct");
});

test("the same CNPJ is the same entity; the same root with another branch number is related", () => {
  const hq = co("Volvo do Brasil", { cnpj: "43999264000100" });
  assert.equal(classifyPair(hq, co("Volvo Brasil Veículos", { cnpj: "43999264000100" })).kind, "same_entity");
  const branch = classifyPair(hq, co("Volvo Paraná", { cnpj: "43999264000282" }));
  assert.equal(branch.kind, "related");
  assert.match(branch.reasons.join(" "), /branches of one legal entity/);
});

test("a recorded parent link settles it: related, never a duplicate", () => {
  const parent = co("Grupo Boticário");
  const child = co("Grupo Boticário", { parent_company_id: parent.id });
  assert.equal(classifyPair(parent, child).kind, "related");
  assert.equal(classifyPair(child, parent).kind, "related");
  const sibling = co("O Boticário", { parent_company_id: parent.id });
  assert.equal(classifyPair(child, sibling).kind, "related");
});

test("a record marked as a duplicate is the same entity as the one it points to", () => {
  const keep = co("Ambev SA");
  const dupe = co("Ambev Brasil", { duplicate_of_id: keep.id });
  assert.equal(classifyPair(dupe, keep).kind, "same_entity");
  assert.equal(canonicalOf(dupe, [keep, dupe]).id, keep.id);
});

test("same name and same website is a high-confidence duplicate; same name alone is medium", () => {
  const a = co("Tigre Tubos e Conexões (op PR)", { website: "https://www.tigre.com.br" });
  assert.deepEqual(classifyPair(a, co("Tigre Tubos e Conexões (operação PR)", { website: "https://tigre.com.br/x" })), { kind: "same_entity", confidence: "high", reasons: ["same website and same name"] });
  const noSite = classifyPair(co("Grupo Massa"), co("Grupo Massa"));
  assert.equal(noSite.kind, "same_entity");
  assert.equal(noSite.confidence, "medium");
});

test("the same name on different websites is only a low-confidence relation", () => {
  const v = classifyPair(co("Aurora", { website: "https://aurora.com.br" }), co("Aurora", { website: "https://aurora.pt" }));
  assert.equal(v.kind, "related");
  assert.equal(v.confidence, "low");
});

test("a different operation of the same company is related, while op / operação PR is the same qualifier", () => {
  assert.equal(qualifierOf("Tigre (op PR)"), qualifierOf("Tigre (operação PR)"));
  assert.equal(qualifierOf("Tigre (operações PR)"), "op pr");
  assert.equal(qualifierOf("Banco Itaú"), "");
  const ops = classifyPair(co("Banco Itaú"), co("Banco Itaú (operações PR)"));
  assert.equal(ops.kind, "related");
  assert.equal(classifyPair(co("Renault do Brasil"), co("Renault do Brasil (planta PR)")).kind, "related");
  assert.equal(classifyPair(co("Mosaic Fertilizantes (op PR)"), co("Mosaic Fertilizantes (operação PR)")).kind, "same_entity");
});

test("a shared website with different names (Ambev Brasil / Ambev SA) is related for a person to decide, not auto-matched", () => {
  const v = classifyPair(co("Ambev Brasil", { domain: "ambev.com.br" }), co("Ambev SA", { website: "https://www.ambev.com.br" }));
  assert.equal(v.kind, "related");
  assert.equal(v.confidence, "medium");
});

test("one name containing another is a low-confidence relation, and short names do not match", () => {
  assert.equal(classifyPair(co("Volvo"), co("Volvo do Brasil")).kind, "related");
  assert.equal(classifyPair(co("Bo"), co("Bo Jesus")).kind, "distinct");
  assert.equal(classifyPair(co("WEG (operação PR)"), co("WEG Automação")).kind, "related", "three-letter acronyms still match");
  assert.equal(classifyPair(co("Hospital Pequeno Príncipe"), co("Hospital Santa Cruz")).kind, "distinct");
  assert.equal(classifyPair(co("Cooperativa COCARI"), co("Cooperativa COOPAGRI")).kind, "distinct");
});

// ── creation and review ─────────────────────────────────────────────────────

test("creating: a likely duplicate blocks, a relative only warns, a stranger goes ahead", () => {
  const index = [co("Banco Itaú", { website: "https://itau.com.br" }), co("Volvo do Brasil")];
  const dupe = findCandidates({ id: "(new)", company_name: "Banco Itaú S.A.", website: "https://www.itau.com.br" }, index);
  assert.equal(creationDecision(dupe), "block");
  const relative = findCandidates({ id: "(new)", company_name: "Volvo Paraná" }, index);
  assert.equal(creationDecision(relative), "ok"); // "volvo parana" does not start with a whole other name
  const prefix = findCandidates({ id: "(new)", company_name: "Volvo" }, index);
  assert.equal(creationDecision(prefix), "warn");
  assert.equal(creationDecision(findCandidates({ id: "(new)", company_name: "Totally New Co" }, index)), "ok");
});

test("agent code reuses the same entity but never an unrelated one or a mere relative", () => {
  const index = [co("Positivo Tecnologia", { website: "https://www.positivotecnologia.com.br" }), co("Volvo do Brasil")];
  assert.equal(existingEntity({ company_name: "Positivo Tecnologia LTDA", website: "https://positivotecnologia.com.br" }, index).existing?.company_name, "Positivo Tecnologia");
  const r = existingEntity({ company_name: "Volvo" }, index);
  assert.equal(r.existing, null);
  assert.equal(r.related.length, 1);
});

test("review groups separate one company entered twice from possible parent/subsidiary chains", () => {
  const list = [
    co("Tigre Tubos e Conexões (op PR)", { website: "https://tigre.com.br" }),
    co("Tigre Tubos e Conexões (operação PR)", { website: "https://tigre.com.br" }),
    co("Volvo CE (Construction Equipment)"),
    co("Volvo do Brasil"),
    co("Volvo Paraná"),
    co("Hospital Santa Cruz"),
    co("Marked", { duplicate_of_id: "x" }),
  ];
  assert.equal(findGroups([co("ZZ_Acme Foods", { cnpj: "11222333000181" }), co("ZZ_Acme Foods (operações PR)")]).length, 1, "short first tokens are still compared");
  const groups = findGroups(list);
  const same = groups.filter((g) => g.kind === "same_entity");
  assert.equal(same.length, 1);
  assert.equal(same[0].members.length, 2);
  assert.ok(groups.every((g) => !g.members.some((m) => m.company_name === "Hospital Santa Cruz")));
  assert.ok(groups.every((g) => !g.members.some((m) => m.company_name === "Marked")), "decided duplicates are not re-listed");
});

// ── stages ──────────────────────────────────────────────────────────────────

test("an account is a directory entry until cited research concludes, and qualified only by a qualification", () => {
  assert.equal(deriveStage({ research: null, qualification: null }), "directory");
  assert.equal(deriveStage({ research: { id: "r", recommendation: "pursue" }, qualification: null }), "researched");
  assert.equal(deriveStage({ research: { id: "r", recommendation: "needs_more_research" }, qualification: null }), "directory");
  assert.equal(deriveStage({ research: null, qualification: { decision: "qualified" } }), "qualified");
  assert.equal(deriveStage({ research: { id: "r", recommendation: "pursue" }, qualification: { decision: "qualified" } }), "qualified");
});

test("revoking or disqualifying drops an account back to what its research supports", () => {
  const research = { id: "r", recommendation: "park" };
  assert.equal(deriveStage({ research, qualification: { decision: "revoked" } }), "researched");
  assert.equal(deriveStage({ research: null, qualification: { decision: "disqualified" } }), "directory");
});

test("only the advanced pipeline columns count as a qualifying move", () => {
  for (const s of ["prospect", "contact_lead", "contacted", "competitor"]) assert.ok(!(QUALIFYING_PIPELINE_STAGES as readonly string[]).includes(s), s);
  for (const s of ["qualified", "diagnosis", "proposal_sent", "closed_won"]) assert.ok((QUALIFYING_PIPELINE_STAGES as readonly string[]).includes(s), s);
});

// ── research must be cited ──────────────────────────────────────────────────

const ok: ResearchInput = {
  summary: "Regional retailer growing in Paraná.",
  recommendation: "pursue",
  evidence: [{ claim: "Opened 12 stores in 2025", source_name: "Gazeta do Povo", source_url: "https://example.com/a", confidence: "medium" }],
  unverified: ["Marketing budget"],
};

test("research without a citation is refused", () => {
  assert.equal(validateResearch(ok), null);
  assert.match(validateResearch({ ...ok, evidence: [] }) ?? "", /at least one cited/);
  assert.match(validateResearch({ ...ok, evidence: [{ claim: "x" }] }) ?? "", /source name or link/);
  assert.match(validateResearch({ ...ok, evidence: [{ claim: "  ", source_name: "S" }] }) ?? "", /claim is required/);
  assert.match(validateResearch({ ...ok, evidence: [{ claim: "x", source_url: "not a link" }] }) ?? "", /not a valid link/);
  assert.match(validateResearch({ ...ok, evidence: [{ claim: "x", source_url: "ftp://a.b/c" }] }) ?? "", /http\(s\)/);
  assert.match(validateResearch({ ...ok, recommendation: "buy" as never }) ?? "", /recommendation/);
  assert.match(validateResearch({ ...ok, summary: " " }) ?? "", /summary/);
  assert.deepEqual(cleanResearch({ ...ok, summary: " x ", unverified: [" a ", ""] }).unverified, ["a"]);
});

// ── only a person qualifies ─────────────────────────────────────────────────

function ledgerStub(opts: { qualification?: { decision: string } | null; research?: { id: string; recommendation: string } | null }) {
  const inserted: Array<Record<string, unknown>> = [];
  const chain = (rows: unknown[]) => {
    const c: any = { select: () => c, eq: () => c, order: async () => ({ data: rows }), maybeSingle: async () => ({ data: { id: "co1" } }) };
    return c;
  };
  return {
    inserted,
    from: (t: string) => {
      if (t === "company_research") return chain(opts.research ? [{ id: opts.research.id, created_at: "2026-01-01", authored_by_kind: "agent", authored_by: "a", summary: "s", recommendation: opts.research.recommendation, evidence: [], unverified: [] }] : []);
      if (t === "company_qualifications") {
        const c = chain(opts.qualification ? [{ id: "q1", created_at: "2026-01-02", decision: opts.qualification.decision, actor_kind: "human", qualified_by_email: "x@y.z", reason: "r" }] : []);
        c.insert = (row: Record<string, unknown>) => {
          inserted.push(row);
          return { select: () => ({ single: async () => ({ data: { id: "new-q" } }) }) };
        };
        return c;
      }
      return chain([]);
    },
  };
}

test("a qualification needs a signed-in person and a reason, and is always recorded as human", async () => {
  const sb = ledgerStub({});
  const noActor = await recordQualification(sb, "t", "co1", { decision: "qualified", reason: "Budget confirmed on a call", actorEmail: "", actorUserId: null });
  assert.equal(!noActor.ok && noActor.status, 403);
  const noReason = await recordQualification(sb, "t", "co1", { decision: "qualified", reason: " ", actorEmail: "a@b.c", actorUserId: "u" });
  assert.equal(!noReason.ok && noReason.status, 400);
  const good = await recordQualification(sb, "t", "co1", { decision: "qualified", reason: "Budget confirmed on a call", actorEmail: "a@b.c", actorUserId: "u" });
  assert.equal(good.ok, true);
  assert.equal(sb.inserted[0].actor_kind, "human");
  assert.equal(sb.inserted[0].qualified_by_email, "a@b.c");
});

test("qualifying twice and revoking something never qualified are both refused", async () => {
  const already = ledgerStub({ qualification: { decision: "qualified" } });
  const twice = await recordQualification(already, "t", "co1", { decision: "qualified", reason: "again please", actorEmail: "a@b.c", actorUserId: null });
  assert.equal(!twice.ok && twice.status, 409);
  const revokeNothing = await recordQualification(ledgerStub({}), "t", "co1", { decision: "revoked", reason: "changed my mind", actorEmail: "a@b.c", actorUserId: null });
  assert.equal(!revokeNothing.ok && revokeNothing.status, 409);
  const revoke = await recordQualification(already, "t", "co1", { decision: "revoked", reason: "budget fell through", actorEmail: "a@b.c", actorUserId: null });
  assert.equal(revoke.ok, true);
});
