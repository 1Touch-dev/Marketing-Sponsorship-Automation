import assert from "node:assert/strict";
import test from "node:test";
import {
  assembleRecap, deriveRecapStatus, gap, issueProblems, measuredFromReach, modeledFromVariants, reconcileCommitments, recapChecksum, recapPromptBlock, recommendRenewal,
  separationProblems, stableStringify, type Financial, type ObligationFact, type ReachRow, type Recap,
} from "../lib/recap/model";
import { buildRecap, getIssued, issueRecap, listIssued, renewalBasis } from "../lib/recap/store";
import { db, type Tables } from "./helpers/fake-db";

const TODAY = "2026-10-07";
let n = 0;
const ob = (status: ObligationFact["status"], over: Partial<ObligationFact> = {}): ObligationFact => ({
  id: `o${++n}`, title: `Item ${n}`, kind: "deliverable", quantity: 1, unit: "per_season", allocation_id: null, due_date: "2026-12-01", owner_email: "ana@club.com", status, proof: "none", moved: false, ...over,
});
const none: Financial = { recorded: false, cash: { committed: 0, invoiced: 0, settled: 0 }, barter: { committed: 0, received: 0 }, savings_realized: 0, note: "" };
const money: Financial = { recorded: true, cash: { committed: 80000, invoiced: 80000, settled: 50000 }, barter: { committed: 25000, received: 25000 }, savings_realized: 9000, note: "" };
const contract = { id: "k1", contract_number: "C-1", title: "Acme", company_id: "co1", start_date: "2025-11-01", end_date: "2026-09-30", status: "active" };
const reachRow = (over: Partial<ReachRow> = {}): ReachRow => ({ match_id: "m1", match_date: "2026-03-01", opponent: "Rival", official_views: 1000, unofficial_fan_views: 500, rival_account_views: 0, media_tv_radio_views: 20000, source_notes: "Club analytics export, 2 Mar", ...over });

// ── commitments ─────────────────────────────────────────────────────────────

test("sold, scheduled, delivered, evidenced and accepted are counted as a funnel, with the waived and the open apart", () => {
  const { commitments: c } = reconcileCommitments([
    ob("open"), ob("open", { due_date: "2026-09-01" }), ob("delivered"), ob("evidenced", { proof: "attached" }), ob("accepted", { proof: "attached" }), ob("waived"),
  ], TODAY);
  assert.deepEqual([c.sold, c.scheduled, c.delivered, c.evidenced, c.accepted, c.waived, c.open, c.overdue], [6, 6, 3, 2, 1, 1, 2, 1]);
});

test("every missing piece of proof becomes a named gap, none skipped", () => {
  const items = [
    ob("open", { due_date: "2026-09-01", title: "Late LED" }), ob("open", { title: "Future banner" }), ob("delivered", { title: "Claimed kit" }),
    ob("evidenced", { proof: "stated", title: "Statement only" }), ob("evidenced", { proof: "attached", title: "Proved, unaccepted" }), ob("accepted", { proof: "attached", title: "Done" }), ob("waived", { title: "Dropped" }),
  ];
  const { gaps, commitments } = reconcileCommitments(items, TODAY);
  const kinds = (t: string) => gaps.filter((g) => g.message.includes(t)).map((g) => g.kind);
  assert.deepEqual(kinds("Late LED"), ["not_delivered_overdue"]);
  assert.deepEqual(kinds("Future banner"), [], "not yet due is not a gap");
  assert.deepEqual(kinds("Claimed kit"), ["missing_proof"]);
  assert.deepEqual(kinds("Statement only").sort(), ["not_accepted", "weak_proof"]);
  assert.deepEqual(kinds("Proved, unaccepted"), ["not_accepted"]);
  assert.deepEqual(kinds("Done"), []);
  assert.deepEqual(kinds("Dropped"), [], "a waiver is explicit, not a gap");
  assert.ok(gaps.filter((g) => g.blocking).every((g) => ["not_delivered_overdue", "missing_proof"].includes(g.kind)));
  assert.equal(commitments.lines.find((l) => l.title === "Claimed kit")!.gaps[0], "missing_proof");
  assert.ok(gaps.every((g) => g.fix.length > 10), "each gap says what closes it");
  assert.deepEqual(reconcileCommitments([], TODAY).gaps.map((g) => g.kind), ["no_obligations"]);
});

// ── measured and modeled ────────────────────────────────────────────────────

test("measured results come only from sourced reach; unsourced reach is left out and named", () => {
  const rows = [reachRow(), reachRow({ match_id: "m2", opponent: "Other", source_notes: null, official_views: 999999 })];
  const past = [{ id: "m1", opponent: "Rival", match_date: "2026-03-01" }, { id: "m2", opponent: "Other", match_date: "2026-03-08" }, { id: "m3", opponent: "Third", match_date: "2026-03-15" }];
  const { measured, gaps } = measuredFromReach(rows, past);
  assert.equal(measured.find((f) => f.id === "reach:official_views")!.value, 1000, "the unsourced 999999 is not in it");
  assert.ok(measured.every((f) => f.basis === "measured" && f.source && /Club analytics export/.test(f.source)));
  assert.ok(!measured.some((f) => f.id === "reach:rival_account_views"), "a zero total is not a figure");
  const kinds = gaps.map((g) => g.kind).sort();
  assert.deepEqual(kinds, ["matches_without_reach", "unsourced_measure"]);
});

test("no reach at all is an explicit gap, not an empty section", () => {
  assert.deepEqual(measuredFromReach([], []).gaps.map((g) => g.kind), ["no_outcome_data"]);
  const noneSourced = measuredFromReach([reachRow({ source_notes: " " })], [{ id: "m1", opponent: "Rival", match_date: "2026-03-01" }]);
  assert.equal(noneSourced.measured.length, 0);
  assert.ok(noneSourced.gaps.some((g) => g.kind === "no_outcome_data") && noneSourced.gaps.some((g) => g.kind === "unsourced_measure"));
});

test("an AI-written reach estimate is modeled, labelled as an estimate, and can never sit in the measured list", () => {
  const modeled = modeledFromVariants([{ label: "Família", estimated_reach: "Approximately 2 million impressions" }, { label: "No estimate" }, { estimated_reach: "  " }]);
  assert.equal(modeled.length, 1);
  assert.deepEqual([modeled[0].basis, modeled[0].unit], ["modeled", null]);
  assert.match(modeled[0].note!, /not a result/);
  assert.deepEqual(separationProblems([], modeled), []);
  assert.match(separationProblems(modeled, []).join(), /is modeled but sits in the measured list/);
  assert.match(separationProblems([{ ...modeled[0], basis: "measured", source: null }], []).join(), /without a source/);
  assert.match(separationProblems([], [{ ...modeled[0], basis: "measured" }]).join(), /is measured but sits in the modeled list/);
  assert.deepEqual(modeledFromVariants("not a list"), []);
});

// ── the recap ───────────────────────────────────────────────────────────────

const recapOf = (over: any = {}): Recap => assembleRecap({
  contract, today: TODAY, obligations: [], reach: [], pastMatches: [], variants: null, financial: none, signature: null, ...over,
});

test("a recap is not ready without obligations, in progress while the contract runs, and complete only with nothing blocking", () => {
  assert.equal(recapOf().status, "not_ready");
  const running = recapOf({ contract: { ...contract, end_date: "2027-09-30" }, obligations: [ob("open")] });
  assert.equal(running.status, "in_progress");
  const withGap = recapOf({ obligations: [ob("delivered")] });
  assert.equal(withGap.status, "ready_with_gaps");
  const done = recapOf({ obligations: [ob("accepted", { proof: "attached" }), ob("waived")], reach: [reachRow()], pastMatches: [{ id: "m1", opponent: "Rival", match_date: "2026-03-01" }], financial: money, signature: { stage: "signed", label: "Signed", verified: true } });
  assert.equal(done.status, "complete");
  assert.equal(done.gap_count, 0);
  assert.equal(deriveRecapStatus({ commitments: done.commitments, endDate: null, blockingGaps: 0, today: TODAY }), "in_progress", "no end date: still running");
});

test("the recap names the other things that are missing: unproven signature and unrecorded money", () => {
  const r = recapOf({ obligations: [ob("accepted", { proof: "attached" })], reach: [reachRow()], pastMatches: [{ id: "m1", opponent: "Rival", match_date: "2026-03-01" }], signature: { stage: "signature_claimed", label: "Signature claimed", verified: false } });
  assert.deepEqual(r.gaps.map((g) => g.kind).sort(), ["no_value_recorded", "signature_unproven"]);
  assert.equal(r.blocking_gap_count, 0);
  assert.equal(r.status, "complete", "non-blocking gaps are shown but do not stop a recap being complete");
  assert.equal(r.gap_count, 2);
});

test("measured and modeled stay in separate lists all the way through the recap", () => {
  const r = recapOf({ obligations: [ob("accepted", { proof: "attached" })], reach: [reachRow()], pastMatches: [{ id: "m1", opponent: "Rival", match_date: "2026-03-01" }], variants: [{ label: "A", estimated_reach: "About 3 million" }] });
  assert.ok(r.measured.length > 0 && r.modeled.length === 1);
  assert.deepEqual(separationProblems(r.measured, r.modeled), []);
  assert.ok(!JSON.stringify(r.measured).includes("3 million"));
});

test("a recap with gaps cannot be issued without a written acknowledgement; one with none needs nothing", () => {
  const gappy = recapOf({ obligations: [ob("delivered")] });
  assert.match(issueProblems(gappy, null).join(), /needs a written acknowledgement/);
  assert.match(issueProblems(gappy, "ok").join(), /10\+ characters/);
  assert.deepEqual(issueProblems(gappy, "Sponsor will be told proof is still being collected"), []);
  assert.match(issueProblems(recapOf(), "Sponsor will be told").join(), /nothing to recap/);
  const clean = recapOf({ obligations: [ob("accepted", { proof: "attached" })], reach: [reachRow()], pastMatches: [{ id: "m1", opponent: "Rival", match_date: "2026-03-01" }], financial: money, signature: { stage: "signed", label: "Signed", verified: true } });
  assert.deepEqual(issueProblems(clean, null), []);
});

test("the checksum ignores key order and changes with content", () => {
  assert.equal(stableStringify({ b: 1, a: [2, { d: 4, c: 3 }] }), stableStringify({ a: [2, { c: 3, d: 4 }], b: 1 }));
  const r = recapOf({ obligations: [ob("delivered")] });
  assert.match(recapChecksum(r), /^[0-9a-f]{64}$/);
  assert.equal(recapChecksum(r), recapChecksum(JSON.parse(JSON.stringify(r))));
  assert.notEqual(recapChecksum(r), recapChecksum({ ...r, gap_count: 99 }));
});

// ── the renewal case ────────────────────────────────────────────────────────

test("the strength of a renewal case follows the proof, and nothing proven means no case", () => {
  const proven = (k: number) => Array.from({ length: k }, () => ob("accepted", { proof: "attached" }));
  const strong = recommendRenewal(recapOf({ obligations: proven(10), reach: [reachRow()], pastMatches: [{ id: "m1", opponent: "Rival", match_date: "2026-03-01" }] }));
  assert.equal(strong.tier, "strong_case");
  const noOutcome = recommendRenewal(recapOf({ obligations: proven(10) }));
  assert.equal(noOutcome.tier, "supported_with_caveats", "all delivered but nothing measured is not a strong case");
  const half = recommendRenewal(recapOf({ obligations: [...proven(5), ...Array.from({ length: 5 }, () => ob("delivered"))] }));
  assert.equal(half.tier, "supported_with_caveats");
  assert.equal(half.proven, 5);
  const weak = recommendRenewal(recapOf({ obligations: [...proven(1), ...Array.from({ length: 9 }, () => ob("open"))] }));
  assert.equal(weak.tier, "insufficient_evidence");
  assert.equal(recommendRenewal(recapOf()).tier, "insufficient_evidence");
  assert.equal(recommendRenewal(recapOf({ obligations: [ob("waived"), ob("waived")] })).tier, "insufficient_evidence", "waived work is not delivery");
});

test("the text given to the drafting model carries facts and prohibitions, and no estimate as a result", () => {
  const r = recapOf({ obligations: [ob("accepted", { proof: "attached", title: "LED" }), ob("delivered", { title: "Claimed kit" })], reach: [reachRow()], pastMatches: [{ id: "m1", opponent: "Rival", match_date: "2026-03-01" }], variants: [{ label: "A", estimated_reach: "About 3 million" }] });
  const block = recapPromptBlock(r, recommendRenewal(r));
  assert.match(block, /MEASURED: Views on the club's official channels = 1,000/);
  assert.match(block, /1 of 2 delivered with documented proof/);
  assert.match(block, /MUST NOT say:.*"Claimed kit" was delivered/);
  assert.match(block, /MUST NOT say:.*About 3 million.*as a result/);
  assert.ok(!/MEASURED:.*3 million/.test(block));
  const waivedBlock = recapPromptBlock(recapOf({ obligations: [ob("accepted", { proof: "attached" }), ob("waived")] }), recommendRenewal(recapOf({ obligations: [ob("accepted", { proof: "attached" }), ob("waived")] })));
  assert.match(waivedBlock, /MUST NOT say:.*"in full" \(1 was waived by agreement\)/);
  const empty = recapPromptBlock(recapOf({ obligations: [ob("accepted", { proof: "attached" })] }), recommendRenewal(recapOf({ obligations: [ob("accepted", { proof: "attached" })] })));
  assert.match(empty, /Do not state any reach, audience or impact number/);
});

// ── the store, on an in-memory stand-in ─────────────────────────────────────

const T = "t";
const world = (over: Tables = {}): Tables => ({
  contracts: [{ id: "k1", tenant_id: T, contract_number: "C-1", title: "Acme 2026", company_id: "co1", status: "active", start_date: "2026-01-01", end_date: "2026-09-30", proposal_id: "p1" }],
  proposals: [{ id: "p1", tenant_id: T, strategy_variants: [{ label: "Família", estimated_reach: "About 3 million impressions" }] }],
  obligations: [
    { id: "a", tenant_id: T, contract_id: "k1", company_id: "co1", title: "LED", kind: "deliverable", quantity: 1, unit: "per_season", allocation_id: null, source_key: "x1", due_date: "2026-09-30", owner_email: "ana@club.com", created_at: "2026-01-01" },
    { id: "b", tenant_id: T, contract_id: "k1", company_id: "co1", title: "Kit", kind: "deliverable", quantity: 1, unit: "per_season", allocation_id: null, source_key: "x2", due_date: "2026-09-30", owner_email: "ana@club.com", created_at: "2026-01-02" },
  ],
  obligation_events: [
    { obligation_id: "a", event_type: "delivered", actor_email: "ana@club.com", created_at: "2026-05-01" },
    { obligation_id: "a", event_type: "evidenced", evidence_kind: "link", evidence_ref: "https://club.com/p", actor_email: "ana@club.com", created_at: "2026-05-02" },
    { obligation_id: "a", event_type: "accepted", actor_email: "bia@club.com", created_at: "2026-05-03" },
    { obligation_id: "b", event_type: "delivered", actor_email: "ana@club.com", created_at: "2026-05-01" },
  ],
  matches: [
    { id: "m1", tenant_id: T, match_date: "2026-03-01", opponent: "Rival", match_media_reach: [{ official_views: 1000, unofficial_fan_views: 0, rival_account_views: 0, media_tv_radio_views: 20000, source_notes: "Club analytics export" }] },
    { id: "m2", tenant_id: T, match_date: "2026-04-01", opponent: "Other", match_media_reach: [] },
    { id: "m3", tenant_id: T, match_date: "2027-03-01", opponent: "Future", match_media_reach: [] },
  ],
  value_lines: [], value_line_events: [], sponsor_recaps: [], ...over,
});

test("the live recap is built from obligations, their proof, recorded reach and the proposal's estimates, each in its place", async () => {
  const r = await buildRecap(db(world()), T, "k1");
  assert.ok(r.ok);
  if (!r.ok) return;
  const v = r.value;
  assert.deepEqual([v.commitments.sold, v.commitments.evidenced, v.commitments.accepted, v.commitments.delivered], [2, 1, 1, 2]);
  assert.equal(v.status, "ready_with_gaps");
  assert.deepEqual(v.gaps.filter((g) => g.blocking).map((g) => g.kind), ["missing_proof"]);
  assert.equal(v.measured.find((f) => f.id === "reach:official_views")!.value, 1000);
  assert.ok(v.gaps.some((g) => g.kind === "matches_without_reach" && /1 of 2/.test(g.message)), "the future match is not counted as played");
  assert.equal(v.modeled[0].basis, "modeled");
  assert.ok(!v.measured.some((f) => /3 million/.test(String(f.value))));
});

test("a contract that cannot be recapped says why", async () => {
  assert.equal(((await buildRecap(db(world({ contracts: [] })), T, "k1")) as any).status, 404);
  assert.match(((await buildRecap(db(world({ contracts: [{ id: "k1", tenant_id: T, company_id: null, status: "active" }] })), T, "k1")) as any).error, /not linked to a company/);
  const missing = await buildRecap(db(world(), { missing: ["obligations"] }), T, "k1");
  assert.ok(!missing.ok && missing.status === 503 && /migration 0064/.test(missing.error));
});

test("issuing needs a person and, for a recap with gaps, a written acknowledgement; each issue is the next version", async () => {
  const tables = world();
  const sb = db(tables);
  assert.equal(((await issueRecap(sb, T, "k1", "x", "")) as any).status, 403);
  const refused = await issueRecap(sb, T, "k1", null, "adm@club.com");
  assert.ok(!refused.ok && refused.status === 400 && /acknowledgement/.test(refused.error));
  assert.equal(tables.sponsor_recaps.length, 0);
  const v1 = await issueRecap(sb, T, "k1", "Sponsor is told the kit proof is still being collected", "adm@club.com");
  assert.ok(v1.ok && v1.value.version === 1 && v1.value.gaps_acknowledged && /^[0-9a-f]{64}$/.test(v1.value.checksum));
  const v2 = await issueRecap(sb, T, "k1", "Second issue after more proof arrives", "adm@club.com");
  assert.ok(v2.ok && v2.value.version === 2);
  assert.equal(tables.sponsor_recaps[0].content.measured.every((f: any) => f.basis === "measured" && f.source), true);
  const list = await listIssued(sb, T, { contractId: "k1" });
  assert.ok(list.ok && list.value.length === 2);
});

test("an issued recap is shown as it was issued, and tampering with the stored content is detected", async () => {
  const tables = world();
  const sb = db(tables);
  const issued = await issueRecap(sb, T, "k1", "Sponsor is told the kit proof is still being collected", "adm@club.com");
  assert.ok(issued.ok);
  if (!issued.ok) return;
  const id = tables.sponsor_recaps[0].id;
  const ok = await getIssued(sb, T, id);
  assert.ok(ok.ok && ok.value.intact && ok.value.content.commitments.sold === 2);
  tables.sponsor_recaps[0].content.commitments.sold = 99;
  const bad = await getIssued(sb, T, id);
  assert.ok(bad.ok && !bad.value.intact);
  assert.equal(((await getIssued(sb, T, "nope")) as any).status, 404);
});

test("a contract with no obligations cannot be recapped or issued", async () => {
  const sb = db(world({ obligations: [], obligation_events: [] }));
  const r = await issueRecap(sb, T, "k1", "Sponsor is told nothing yet", "adm@club.com");
  assert.ok(!r.ok && r.status === 409 && /nothing to recap/.test(r.error));
});

test("the renewal basis is the recap's own reading, with a checksum of what it rested on", async () => {
  const proven = world();
  const b = await renewalBasis(db(proven), T, "k1");
  assert.ok(b.ok);
  if (!b.ok) return;
  assert.equal(b.value.recommendation.tier, "supported_with_caveats", "1 of 2 proven");
  assert.match(b.value.promptBlock, /MUST NOT say:.*"Kit" was delivered/);
  assert.match(b.value.checksum, /^[0-9a-f]{64}$/);
  const none = await renewalBasis(db(world({ obligation_events: [] })), T, "k1");
  assert.ok(none.ok && none.value.recommendation.tier === "insufficient_evidence");
});

test("gap() builds blocking and informational gaps from one table", () => {
  assert.equal(gap("missing_proof", "o1", "x").blocking, true);
  assert.equal(gap("weak_proof", "o1", "x").blocking, false);
});
