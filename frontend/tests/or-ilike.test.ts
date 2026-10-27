import assert from "node:assert/strict";
import test from "node:test";
import { buildListTextSearchOr, ilikeClause, sanitizeSearchTerm } from "../lib/search/or-ilike";

const ALPHA = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
const BRAVO = "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb";

test("sanitizeSearchTerm strips PostgREST wildcards", () => {
  assert.equal(sanitizeSearchTerm("  QA E2E Test Alpha  "), "QA E2E Test Alpha");
  assert.equal(sanitizeSearchTerm("%Alpha_"), "Alpha");
});

test("ilike quotes a term that contains spaces", () => {
  assert.equal(ilikeClause("title", "CoxaNaRede"), "title.ilike.%CoxaNaRede%");
  assert.equal(ilikeClause("title", "QA E2E Test Alpha"), 'title.ilike."%QA E2E Test Alpha%"');
});

test("list text search or uses company_id.in and never companies.company_name", () => {
  const or = buildListTextSearchOr({
    term: "QA E2E Test Alpha",
    columns: ["title", "summary"],
    companyIds: [ALPHA, BRAVO],
  });
  assert.ok(or);
  assert.match(or!, /title\.ilike\."%QA E2E Test Alpha%"/);
  assert.match(or!, /summary\.ilike\."%QA E2E Test Alpha%"/);
  assert.match(or!, new RegExp(`company_id\\.in\\.\\(${ALPHA},${BRAVO}\\)`));
  assert.equal(or!.includes("companies.company_name"), false);
});

test("list text search or still matches titles when no company ids match", () => {
  const or = buildListTextSearchOr({
    term: "CoxaNaRede",
    columns: ["title", "summary"],
    companyIds: [],
  });
  assert.equal(or, "title.ilike.%CoxaNaRede%,summary.ilike.%CoxaNaRede%");
  assert.equal(or!.includes("companies.company_name"), false);
  assert.equal(or!.includes("company_id.in"), false);
});

test("blank or wildcard-only terms produce no filter", () => {
  assert.equal(buildListTextSearchOr({ term: "   ", columns: ["title"] }), null);
  assert.equal(buildListTextSearchOr({ term: "%_%", columns: ["title"] }), null);
});
