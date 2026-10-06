import assert from "node:assert/strict";
import test from "node:test";
import { evaluateClaim, daysUntil, type ClaimVersionFacts, type ReviewFact } from "../lib/claims/status";
import { toSponsorClaims, verifiedClaimsPromptBlock, sourcesFootnote, displayValue } from "../lib/claims/sponsor-claims";
import { recordReview, validateVersionInput, type RegistryEntry } from "../lib/claims/store";
import { documentClaimKeys, documentClaimsReport } from "../lib/claims/document-claims";
import { extractFigures, findUnsourcedFigures } from "../lib/claims/figure-scan";
import { resolveKpiTemplate } from "../lib/proposals/kpi-templates";
import { buildClubContext, CORITIBA_CLUB_CONTEXT_INPUT, proposalPrompt } from "../lib/bedrock/prompts";

const NOW = new Date("2026-10-06T12:00:00Z");

const clean: ClaimVersionFacts = {
  source_kind: "official_club",
  source_ref: "Coritiba FC annual report 2025",
  effective_date: "2026-01-01",
  expires_at: "2026-12-31",
  owner: "Marketing director",
};
const verified: ReviewFact = { decision: "verified", created_at: "2026-02-01T10:00:00Z" };

const evalWith = (version: Partial<ClaimVersionFacts>, reviews: ReviewFact[] = [verified], retired = false) =>
  evaluateClaim({ version: { ...clean, ...version }, reviews, retired, now: NOW });

test("a sourced, owned, in-date, verified claim is current and usable", () => {
  const r = evalWith({});
  assert.equal(r.state, "current");
  assert.equal(r.usable, true);
  assert.deepEqual(r.reasons, []);
});

test("a claim nobody has reviewed is not usable, however complete it looks", () => {
  const r = evalWith({}, []);
  assert.equal(r.state, "unreviewed");
  assert.equal(r.usable, false);
});

test("every missing piece of provenance makes a claim unsupported and says which", () => {
  for (const [patch, word] of [
    [{ source_ref: null }, "source"],
    [{ source_ref: "   " }, "source"],
    [{ source_kind: "unknown" as const }, "source type"],
    [{ owner: null }, "owner"],
    [{ effective_date: null }, "effective date"],
    [{ expires_at: null }, "expiry date"],
  ] as const) {
    const r = evalWith(patch);
    assert.equal(r.state, "unsupported", JSON.stringify(patch));
    assert.equal(r.usable, false);
    assert.ok(r.reasons.some((x) => x.includes(word)), `${JSON.stringify(patch)} → ${r.reasons}`);
  }
});

test("a claim stops being usable the day after it expires, not on the day itself", () => {
  assert.equal(evalWith({ expires_at: "2026-10-06" }).usable, true);
  const gone = evalWith({ expires_at: "2026-10-05" });
  assert.equal(gone.state, "expired");
  assert.equal(gone.usable, false);
  assert.equal(gone.daysToExpiry, -1);
});

test("a claim near its expiry is flagged but stays usable", () => {
  const r = evalWith({ expires_at: "2026-10-20" });
  assert.equal(r.state, "expiring_soon");
  assert.equal(r.usable, true);
  assert.equal(evalWith({ expires_at: "2026-11-05" }).state, "expiring_soon"); // exactly 30 days out
  assert.equal(evalWith({ expires_at: "2026-11-05" }).daysToExpiry, 30);
  assert.equal(evalWith({ expires_at: "2026-11-06" }).state, "current"); // 31 days out
});

test("the latest review wins: a later dispute removes a claim, a later verification restores it", () => {
  const disputed: ReviewFact = { decision: "disputed", created_at: "2026-03-01T10:00:00Z" };
  assert.equal(evalWith({}, [verified, disputed]).state, "disputed");
  assert.equal(evalWith({}, [verified, disputed]).usable, false);
  const again: ReviewFact = { decision: "verified", created_at: "2026-04-01T10:00:00Z" };
  assert.equal(evalWith({}, [verified, disputed, again]).state, "current");
});

test("a retired claim is never usable, and retirement outranks every other state", () => {
  const r = evalWith({}, [verified], true);
  assert.equal(r.state, "retired");
  assert.equal(r.usable, false);
});

test("a figure that is not effective yet is scheduled, not usable", () => {
  const r = evalWith({ effective_date: "2026-11-01", expires_at: "2027-11-01" });
  assert.equal(r.state, "scheduled");
  assert.equal(r.usable, false);
});

test("an internal estimate can be used once verified, but is marked as an estimate", () => {
  const r = evalWith({ source_kind: "internal_estimate" });
  assert.equal(r.usable, true);
  assert.equal(r.isEstimate, true);
});

test("daysUntil counts whole UTC days", () => {
  assert.equal(daysUntil("2026-10-06", NOW), 0);
  assert.equal(daysUntil("2026-10-07", NOW), 1);
  assert.equal(daysUntil("2026-10-05", NOW), -1);
});

// ── what a sponsor may see ──────────────────────────────────────────────────

function entry(key: string, value: string, over: Partial<ClaimVersionFacts> = {}, reviews: ReviewFact[] = [verified]): RegistryEntry {
  const version = { ...clean, ...over };
  return {
    id: `id-${key}`,
    key,
    category: "club",
    label: key,
    retired_at: null,
    versionCount: 1,
    reviews: [],
    current: { ...version, id: `v-${key}`, claim_id: `id-${key}`, version: 1, value, unit: null, description: null, source_url: null, created_by_email: null, created_at: "2026-01-01" },
    evaluation: evaluateClaim({ version, reviews, retired: false, now: NOW }),
  };
}

const registry = [
  entry("club.avg_attendance", "23 mil"),
  entry("club.members", "36 mil", {}, []), // unreviewed
  entry("club.social_followers_total", "1.5M+", { expires_at: "2026-01-01" }), // expired
  entry("city.idh", "0,823", { source_kind: "internal_estimate" }),
];
const sponsor = toSponsorClaims(registry);

test("only usable claims reach a sponsor-facing page; the rest are withheld with reasons", () => {
  assert.deepEqual(Object.keys(sponsor.claims).sort(), ["city.idh", "club.avg_attendance"]);
  assert.deepEqual(sponsor.withheld.map((w) => [w.key, w.state]).sort(), [["club.members", "unreviewed"], ["club.social_followers_total", "expired"]]);
  assert.ok(sponsor.withheld.every((w) => w.reasons.length > 0));
});

test("an estimate is labelled as one wherever it is shown", () => {
  assert.equal(displayValue(sponsor.claims["city.idh"]), "0,823 (estimativa)");
  assert.equal(displayValue(sponsor.claims["club.avg_attendance"]), "23 mil");
});

test("a source footnote names each source once, with the date its figure is from", () => {
  const note = sourcesFootnote(Object.values(sponsor.claims));
  assert.equal(note, "Fontes: Coritiba FC annual report 2025 (dados de 2026-01-01)");
  assert.equal(sourcesFootnote([]), "");
});

test("KPI cards show only claims that are usable, and cite their sources", () => {
  const kpi = resolveKpiTemplate("sponsorship_standard", { clubName: "Coritiba FC", stadium_name: "Couto Pereira" }, sponsor.claims);
  const values = [...kpi.heroStats.map((s) => s.value), ...kpi.metrics.map((m) => m.value)];
  assert.ok(values.includes("23 mil"));
  assert.ok(!values.some((v) => v.includes("1.5M") || v.includes("36 mil")), `withheld figure leaked: ${values}`);
  assert.match(kpi.sourcesNote, /^Fontes: /);
});

test("with no usable claim the KPI cards fall back to the tenant's configured facts, never to stale figures", () => {
  const kpi = resolveKpiTemplate("awareness", { clubName: "Coritiba FC", founded_year: 1909, stadium_name: "Couto Pereira" }, {});
  assert.equal(kpi.id, "generic");
  assert.equal(kpi.sourcesNote, "");
  const text = JSON.stringify(kpi);
  for (const stale of ["1,5M", "38.000", "40.502", "25.000", "3,7M", "0,823"]) assert.ok(!text.includes(stale), `hardcoded ${stale} is back`);
});

test("document claims report says what was shown, withheld and never registered", () => {
  const keys = documentClaimKeys("sponsorship_standard");
  const report = documentClaimsReport(sponsor, keys);
  assert.deepEqual(report.shown.map((s) => s.key).sort(), ["city.idh", "club.avg_attendance"]);
  assert.deepEqual(report.withheld.map((w) => w.key).sort(), ["club.members", "club.social_followers_total"]);
  assert.ok(report.unregistered.includes("club.partner_brands"));
  assert.equal(report.shown.length + report.withheld.length + report.unregistered.length, keys.length);
});

// ── the AI prompt ───────────────────────────────────────────────────────────

test("the AI is told it has no figures when none are verified, and the Coritiba default carries none", () => {
  const none = verifiedClaimsPromptBlock([]);
  assert.match(none, /none are currently available/);
  const ctx = buildClubContext(CORITIBA_CLUB_CONTEXT_INPUT);
  for (const stale of ["1.5M", "15,000", "30,000"]) assert.ok(!ctx.includes(stale), `club context still contains ${stale}`);
  const { system } = proposalPrompt({ company: { company_name: "Acme" }, campaign: { title: "T" }, tenant: CORITIBA_CLUB_CONTEXT_INPUT });
  assert.match(system, /VERIFIED CLUB FIGURES: none are currently available/);
});

test("verified figures are handed to the AI with their source and date, and nothing else", () => {
  const block = verifiedClaimsPromptBlock(Object.values(sponsor.claims));
  assert.match(block, /club\.avg_attendance: 23 mil \(source: Coritiba FC annual report 2025; as of 2026-01-01\)/);
  assert.ok(!block.includes("36 mil") && !block.includes("1.5M"));
  const { system } = proposalPrompt({ company: { company_name: "Acme" }, campaign: { title: "T" }, tenant: CORITIBA_CLUB_CONTEXT_INPUT, verifiedClaims: block });
  assert.ok(system.includes("23 mil"));
  assert.ok(!system.includes("none are currently available"));
});

// ── writing ─────────────────────────────────────────────────────────────────

test("version input must carry a value, a known source type and sane dates", () => {
  const ok = { value: "1", source_kind: "official_club" as const };
  assert.equal(validateVersionInput(ok), null);
  assert.match(validateVersionInput({ ...ok, value: "  " }) ?? "", /value/);
  assert.match(validateVersionInput({ ...ok, source_kind: "guess" as never }) ?? "", /source_kind/);
  assert.match(validateVersionInput({ ...ok, expires_at: "31/12/2026" }) ?? "", /YYYY-MM-DD/);
  assert.match(validateVersionInput({ ...ok, effective_date: "2026-05-01", expires_at: "2026-04-01" }) ?? "", /before/);
});

/** Minimal chainable stand-in for the two reads and one insert recordReview makes. */
function reviewStub(claim: unknown, latest: unknown) {
  const inserted: unknown[] = [];
  const chain = (result: unknown) => {
    const c: any = { select: () => c, eq: () => c, order: () => c, limit: () => c, maybeSingle: async () => ({ data: result }) };
    return c;
  };
  return {
    inserted,
    from: (table: string) => {
      if (table === "claims") return chain(claim);
      if (table === "claim_versions") return chain(latest);
      return {
        insert: (row: unknown) => {
          inserted.push(row);
          return { select: () => ({ single: async () => ({ data: { id: "review-1" } }) }) };
        },
      };
    },
  };
}

test("the person who recorded a figure cannot be the one who verifies it", async () => {
  const sb = reviewStub({ id: "c1", retired_at: null }, { id: "v2", version: 2, created_by_email: "Writer@Club.com" });
  const r = await recordReview(sb, "t1", "c1", { versionId: "v2", decision: "verified", reviewerId: "u1", reviewerEmail: "writer@club.com" });
  assert.equal(r.ok, false);
  assert.equal(!r.ok && r.status, 403);
  assert.equal(sb.inserted.length, 0);
  const other = await recordReview(sb, "t1", "c1", { versionId: "v2", decision: "verified", reviewerId: "u2", reviewerEmail: "checker@club.com" });
  assert.equal(other.ok, true);
  assert.equal(sb.inserted.length, 1);
});

test("a review of an older version is refused, so verifying v1 cannot approve a changed v2", async () => {
  const sb = reviewStub({ id: "c1", retired_at: null }, { id: "v2", version: 2, created_by_email: "a@b.c" });
  const r = await recordReview(sb, "t1", "c1", { versionId: "v1", decision: "verified", reviewerId: "u2", reviewerEmail: "checker@club.com" });
  assert.equal(!r.ok && r.status, 409);
  assert.equal(sb.inserted.length, 0);
});

test("a dispute needs a reason, and a retired claim cannot be reviewed", async () => {
  const sb = reviewStub({ id: "c1", retired_at: null }, { id: "v1", version: 1, created_by_email: null });
  const noNote = await recordReview(sb, "t1", "c1", { versionId: "v1", decision: "disputed", reviewerId: "u", reviewerEmail: "x@y.z" });
  assert.equal(!noNote.ok && noNote.status, 400);
  const retired = reviewStub({ id: "c1", retired_at: "2026-01-01" }, { id: "v1", version: 1, created_by_email: null });
  const r = await recordReview(retired, "t1", "c1", { versionId: "v1", decision: "verified", reviewerId: "u", reviewerEmail: "x@y.z" });
  assert.equal(!r.ok && r.status, 409);
});

// ── figures written into free text ──────────────────────────────────────────

test("the scanner finds audience-style figures and ignores money, years and small counts", () => {
  const text = "Audiências que superam 1 milhão de telespectadores por partida; 35% de torcida feminina; 50.000+ impressões; R$ 300.000 de investimento; temporada 2026; fase M1–M2; 25 jogos em casa; 90+ minutos.";
  const found = extractFigures(text).map((f) => f.value).sort((a, b) => a - b);
  assert.deepEqual(found, [35, 50000, 1000000]);
});

test("number formats read the way they are written in Portuguese and English", () => {
  const v = (t: string) => extractFigures(t).map((f) => f.value);
  assert.deepEqual(v("1,5 milhão de seguidores"), [1_500_000]);
  assert.deepEqual(v("1.5M+ seguidores"), [1_500_000]);
  assert.deepEqual(v("1.95 milhões"), [1_950_000]);
  assert.deepEqual(v("40.502 lugares"), [40_502]);
  assert.deepEqual(v("23 mil torcedores"), [23_000]);
  assert.deepEqual(v("18.000–28.000 por jogo"), [18_000, 28_000]);
});

test("a figure in the text is supported only when a usable claim states the same number", () => {
  const claims = ["23 mil", "1.5M+", "18.000–28.000"];
  const fields = {
    executive_summary: "Com 1,5 milhão de seguidores e 23.000 torcedores no estádio, mais de 1 milhão de telespectadores por partida.",
    campaign_rationale: "Público entre 18.000 e 28.000 e 35% de mulheres.",
  };
  const unsourced = findUnsourcedFigures(fields, claims);
  assert.deepEqual(unsourced.map((u) => u.figure).sort(), ["1 milhão", "35%"]);
  assert.ok(unsourced.every((u) => u.context.length > 0 && u.field));
});

test("with no usable claim, every audience figure in the text is flagged", () => {
  const unsourced = findUnsourcedFigures({ executive_summary: "1,5 milhão de seguidores" }, []);
  assert.equal(unsourced.length, 1);
});

test("colour codes are not figures", () => {
  assert.deepEqual(extractFigures("Verde Coxa #005742 e código 005742"), []);
});
