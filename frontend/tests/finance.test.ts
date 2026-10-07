import assert from "node:assert/strict";
import test from "node:test";
import {
  DEFAULT_SETTINGS, allowedActions, barterValue, classify, deriveLineStatus, summarise, validateEvent, validateLine, validateSettings,
  type AccountingSettings, type ClassifiedLine,
} from "../lib/finance/model";
import { createLine, linkProposalLines, listLines, loadSettings, loadSummary, recordEvent, saveSettings } from "../lib/finance/store";
import { db, type Tables } from "./helpers/fake-db";

const ev = (event_type: any, created_at: string) => ({ event_type, created_at });

// ── status ──────────────────────────────────────────────────────────────────

test("a line is planned until something is recorded; settled and voided are final", () => {
  assert.equal(deriveLineStatus([]), "planned");
  assert.equal(deriveLineStatus([ev("invoiced", "2026-10-01")]), "invoiced");
  assert.equal(deriveLineStatus([ev("invoiced", "2026-10-01"), ev("settled", "2026-10-09")]), "settled");
  assert.equal(deriveLineStatus([ev("settled", "2026-10-09"), ev("invoiced", "2026-10-01")]), "settled", "an invoice after the fact does not undo it");
  assert.equal(deriveLineStatus([ev("invoiced", "2026-10-01"), ev("voided", "2026-10-02")]), "voided");
});

test("only the right things can be recorded next: barter has no invoice, and settled or voided is final", () => {
  assert.deepEqual(allowedActions("cash", "planned"), ["invoice", "settle", "void"]);
  assert.deepEqual(allowedActions("barter", "planned"), ["settle", "void"]);
  assert.deepEqual(allowedActions("cash", "invoiced"), ["settle", "void"]);
  assert.deepEqual(allowedActions("cash", "settled"), []);
  assert.deepEqual(allowedActions("cash", "voided"), []);
});

// ── input ───────────────────────────────────────────────────────────────────

test("a line needs a kind, a label, a positive amount and a proposal or contract", () => {
  assert.deepEqual(validateLine({ kind: "cash", label: "Instalment 1", amount_brl: 50000, proposal_id: "p1" }), []);
  assert.deepEqual(validateLine({ kind: "barter", label: "Kits", amount_brl: "12000.50", contract_id: "k1", club_reference_value: 15000 }), []);
  const bad = validateLine({ kind: "gift", label: " ", amount_brl: -5 }).join(" | ");
  for (const w of ["cash or barter", "label", "positive amount", "proposal or a contract"]) assert.match(bad, new RegExp(w), w);
  assert.match(validateLine({ kind: "cash", label: "x", amount_brl: 1, proposal_id: "p", club_reference_value: 10 }).join(), /only barter has a club reference/);
  assert.match(validateLine({ kind: "cash", label: "x", amount_brl: 1, proposal_id: "p", barter_item_id: "b" }).join(), /only barter can be linked/);
  assert.match(validateLine({ kind: "cash", label: "x", amount_brl: 1, proposal_id: "p", due_date: "2026-02-31x" }).join(), /YYYY-MM-DD/);
  assert.match(validateLine({ kind: "barter", label: "x", amount_brl: 1, proposal_id: "p", club_reference_value: 0 }).join(), /club_reference_value/);
});

test("money and goods are recorded with a reference and the real date, never a future one", () => {
  const today = "2026-10-07";
  assert.deepEqual(validateEvent({ action: "settle", reference: "TED 5521-889", occurredOn: "2026-10-05" }, today), []);
  assert.match(validateEvent({ action: "settle", reference: "ok", occurredOn: "2026-10-05" }, today).join(), /5\+ characters/);
  assert.match(validateEvent({ action: "invoice", reference: "NF", occurredOn: "2026-10-05" }, today).join(), /3\+ characters/);
  assert.match(validateEvent({ action: "settle", reference: "TED 5521-889", occurredOn: "2026-12-01" }, today).join(), /future/);
  assert.match(validateEvent({ action: "settle", reference: "TED 5521-889" }, today).join(), /real date/);
  assert.match(validateEvent({ action: "void", reason: "no" }, today).join(), /reason/);
  assert.deepEqual(validateEvent({ action: "void", reason: "Entered against the wrong contract" }, today), []);
});

test("accounting rules are validated", () => {
  assert.deepEqual(validateSettings({ recognition_stage: "invoiced", barter_valuation_basis: "club_reference_value", contract_total_covers: "cash_only" }), []);
  assert.match(validateSettings({ recognition_stage: "whenever" }).join(), /recognition_stage/);
  assert.match(validateSettings({ barter_valuation_basis: "feeling" }).join(), /barter_valuation_basis/);
  assert.match(validateSettings({ contract_total_covers: "all" }).join(), /contract_total_covers/);
});

// ── where a line stands ─────────────────────────────────────────────────────

test("a draft deal is not revenue; what happened stays counted whatever becomes of the deal", () => {
  const c = (over: any) => classify({ status: "planned", contractId: null, contractStatus: null, proposalId: null, proposalStatus: null, ...over });
  assert.equal(c({ proposalId: "p", proposalStatus: "under_review" }), "proposed");
  assert.equal(c({ proposalId: "p", proposalStatus: "rejected" }), "lapsed");
  assert.equal(c({ contractId: "k", contractStatus: "active" }), "contracted");
  assert.equal(c({ contractId: "k", contractStatus: "active", status: "invoiced" }), "invoiced");
  assert.equal(c({ contractId: "k", contractStatus: "draft" }), "draft_contract");
  assert.equal(c({ contractId: "k", contractStatus: "terminated" }), "lapsed");
  assert.equal(c({ contractId: "k", contractStatus: "terminated", status: "settled" }), "settled", "money received stays received");
  assert.equal(c({ status: "voided", contractId: "k", contractStatus: "active" }), "voided");
  assert.equal(c({}), "orphan");
});

// ── the numbers ─────────────────────────────────────────────────────────────

let n = 0;
const line = (kind: "cash" | "barter", amount: number, bucket: ClassifiedLine["bucket"], over: Partial<ClassifiedLine> = {}): ClassifiedLine => ({
  id: `L${++n}`, company_id: "co1", proposal_id: bucket === "proposed" ? "p1" : null, contract_id: ["contracted", "invoiced", "settled", "draft_contract"].includes(bucket) ? "k1" : null, kind, label: "x", amount_brl: amount,
  due_date: null, club_reference_value: null, barter_item_id: null, status: bucket === "settled" ? "settled" : bucket === "invoiced" ? "invoiced" : bucket === "voided" ? "voided" : "planned",
  bucket, proposalStatus: bucket === "proposed" ? "under_review" : null, contractStatus: bucket === "draft_contract" ? "draft" : "active", ...over,
});
const contracts = [{ id: "k1", contract_number: "C-1", status: "active", total_value_brl: null as number | null }];

const portfolio = () => [
  line("cash", 1000, "proposed"), line("cash", 2000, "contracted"), line("cash", 3000, "invoiced"), line("cash", 4000, "settled"),
  line("cash", 500, "draft_contract"), line("cash", 700, "lapsed"), line("cash", 100, "voided"),
  line("barter", 10000, "proposed", { club_reference_value: 8000 }), line("barter", 20000, "contracted", { club_reference_value: 15000 }),
  line("barter", 30000, "settled", { club_reference_value: 25000 }), line("barter", 6000, "settled"), line("barter", 9000, "draft_contract", { club_reference_value: 7000 }),
];

test("cash is split into proposed, contracted, invoiced and settled, and drafts, lapsed and voided are kept out", () => {
  const s = summarise({ lines: portfolio(), settings: DEFAULT_SETTINGS, settingsAreDefault: true, contracts });
  assert.deepEqual([s.cash.proposed, s.cash.contracted, s.cash.invoiced, s.cash.settled], [1000, 2000, 3000, 4000]);
  assert.equal(s.cash.committed, 9000, "contracted + invoiced + settled; the draft deal's 500 is not in it");
  assert.equal(s.cash.draft_contract, 500);
  assert.deepEqual(s.cash.excluded, { voided: 100, lapsed: 700, orphan: 0 });
});

test("what counts as recognised follows the chosen stage; the safe default is money actually received", () => {
  const at = (stage: AccountingSettings["recognition_stage"]) => summarise({ lines: portfolio(), settings: { ...DEFAULT_SETTINGS, recognition_stage: stage }, settingsAreDefault: false, contracts });
  assert.equal(at("settled").cash.recognized, 4000);
  assert.equal(at("invoiced").cash.recognized, 7000);
  assert.equal(at("contracted").cash.recognized, 9000);
  assert.ok(at("settled").cash.recognized < at("contracted").cash.recognized);
  assert.equal(at("invoiced").barter.recognized, at("settled").barter.recognized, "barter has no invoice: it counts when received");
  assert.equal(summarise({ lines: [line("cash", 800, "draft_contract")], settings: { ...DEFAULT_SETTINGS, recognition_stage: "contracted" }, settingsAreDefault: false, contracts }).cash.recognized, 0, "a draft is never recognised, even at the most generous stage");
});

test("barter is valued on the chosen basis, and lines missing that value are left out and listed", () => {
  const agreed = summarise({ lines: portfolio(), settings: DEFAULT_SETTINGS, settingsAreDefault: true, contracts });
  assert.deepEqual([agreed.barter.proposed, agreed.barter.contracted, agreed.barter.settled], [10000, 20000, 36000]);
  assert.deepEqual(agreed.barter.unvalued_lines, []);
  const ref = summarise({ lines: portfolio(), settings: { ...DEFAULT_SETTINGS, barter_valuation_basis: "club_reference_value" }, settingsAreDefault: false, contracts });
  assert.deepEqual([ref.barter.proposed, ref.barter.contracted, ref.barter.settled], [8000, 15000, 25000]);
  assert.equal(ref.barter.unvalued_lines.length, 1, "the received line with no reference value");
  assert.equal(barterValue({ amount_brl: 5, club_reference_value: null }, "club_reference_value"), null);
});

test("savings are what received barter would have cost, counted once, never summed with cash or barter", () => {
  const s = summarise({ lines: portfolio(), settings: DEFAULT_SETTINGS, settingsAreDefault: true, contracts });
  assert.equal(s.savings.realized, 25000, "only the received line that has a reference value");
  assert.equal(s.savings.lines_realized, 1);
  assert.equal(s.savings.pending, 15000, "contracted but not yet received; the draft deal's 7000 is not in it");
  assert.equal(s.savings.unvalued_lines.length, 1, "received, but no one said what it would have cost");
  assert.ok(!("total" in s) && !("grand_total" in s.cash) && !("grand_total" in s.savings), "no field adds the three measures");
  assert.match(s.notes.join(" "), /Never add them together/);
  assert.match(s.notes.join(" "), /not been set by a person/);
});

test("a contract's own total is checked against the lines behind it, under the chosen rule", () => {
  const lines = [line("cash", 60000, "contracted"), line("barter", 40000, "contracted"), line("cash", 999, "voided")];
  const rec = (settings: AccountingSettings, total: number | null) => summarise({ lines, settings, settingsAreDefault: false, contracts: [{ id: "k1", contract_number: "C-1", status: "active", total_value_brl: total }] }).reconciliation[0];
  assert.equal(rec(DEFAULT_SETTINGS, 100000).result, "matches");
  assert.equal(rec(DEFAULT_SETTINGS, 60000).result, "lines_exceed_total");
  assert.equal(rec(DEFAULT_SETTINGS, 150000).result, "lines_short_of_total");
  assert.equal(rec(DEFAULT_SETTINGS, null).result, "no_total_recorded");
  assert.equal(rec({ ...DEFAULT_SETTINGS, contract_total_covers: "cash_only" }, 60000).result, "matches", "if the total is meant to be money only, barter is not in it");
  assert.equal(rec(DEFAULT_SETTINGS, 100000).lines_cash_brl, 60000, "the voided line is not counted");
});

test("what is missing is named: orphans, won proposals whose lines never reached the contract, and active contracts with no lines", () => {
  const lines = [
    line("cash", 100, "orphan", { proposal_id: null, contract_id: null }),
    line("cash", 200, "proposed", { proposal_id: "pWon", proposalStatus: "active_contract" }),
    line("cash", 300, "lapsed"),
  ];
  const s = summarise({ lines, settings: DEFAULT_SETTINGS, settingsAreDefault: true, contracts: [{ id: "kEmpty", contract_number: "C-9", status: "active", total_value_brl: null }, { id: "kDraft", contract_number: "C-8", status: "draft", total_value_brl: null }] });
  assert.equal(s.gaps.orphan_lines.length, 1);
  assert.deepEqual(s.gaps.won_proposals_with_unlinked_lines, ["pWon"]);
  assert.deepEqual(s.gaps.active_contracts_without_lines, ["kEmpty"], "a draft contract with no lines is not a gap");
  assert.equal(s.gaps.lapsed_lines.length, 1);
  assert.equal(s.reconciliation[0].result, "no_lines");
});

// ── the store, on an in-memory stand-in ─────────────────────────────────────

const T = "t";
const world = (over: Tables = {}): Tables => ({
  companies: [{ id: "co1", tenant_id: T, company_name: "Acme" }],
  contracts: [{ id: "k1", tenant_id: T, company_id: "co1", status: "active", contract_number: "C-1", total_value_brl: 100000 }, { id: "kd", tenant_id: T, company_id: "co1", status: "draft", contract_number: "C-2", total_value_brl: null }, { id: "kx", tenant_id: T, company_id: "co2", status: "active", contract_number: "C-3", total_value_brl: null }],
  proposals: [{ id: "p1", tenant_id: T, company_id: "co1", status: "under_review" }], barter_items: [{ id: "b1", tenant_id: T, current_price: 9000 }, { id: "b2", tenant_id: T, current_price: null }],
  value_lines: [], value_line_events: [], accounting_settings: [], ...over,
});

test("a line is checked against the company, contract, proposal and wishlist it points at", async () => {
  const sb = db(world());
  assert.equal(((await createLine(sb, T, "co1", { kind: "cash", label: "x", amount_brl: 1, proposal_id: "p1" }, "")) as any).status, 403);
  assert.equal(((await createLine(sb, T, "nope", { kind: "cash", label: "x", amount_brl: 1, proposal_id: "p1" }, "a@b.c")) as any).status, 404);
  assert.match(((await createLine(sb, T, "co1", { kind: "cash", label: "x", amount_brl: 1, contract_id: "kx" }, "a@b.c")) as any).error, /not linked to this company/);
  assert.equal(((await createLine(sb, T, "co1", { kind: "cash", label: "x", amount_brl: 1, contract_id: "zz" }, "a@b.c")) as any).status, 404);
  assert.equal(((await createLine(sb, T, "co1", { kind: "cash", label: "x", amount_brl: 0, proposal_id: "p1" }, "a@b.c")) as any).status, 400);
  const draft = await createLine(sb, T, "co1", { kind: "cash", label: "Instalment", amount_brl: 5000, contract_id: "kd" }, "a@b.c");
  assert.ok(draft.ok && /still a draft.*not counted as revenue/.test(draft.value.warnings[0]));
});

test("a barter line takes its reference value from the wishlist price when none is given, and says when it has none", async () => {
  const tables = world();
  const sb = db(tables);
  const a = await createLine(sb, T, "co1", { kind: "barter", label: "Kits", amount_brl: 12000, proposal_id: "p1", barter_item_id: "b1" }, "a@b.c");
  assert.ok(a.ok && /taken from the wishlist item's current price \(9000\)/.test(a.value.warnings[0]));
  assert.deepEqual([tables.value_lines[0].club_reference_value, tables.value_lines[0].reference_basis], [9000, "wishlist_price"]);
  const own = await createLine(sb, T, "co1", { kind: "barter", label: "Kits", amount_brl: 12000, proposal_id: "p1", barter_item_id: "b1", club_reference_value: 11000 }, "a@b.c");
  assert.ok(own.ok && own.value.warnings.length === 0);
  assert.deepEqual([tables.value_lines[1].club_reference_value, tables.value_lines[1].reference_basis], [11000, "entered"]);
  const none = await createLine(sb, T, "co1", { kind: "barter", label: "Goods", amount_brl: 3000, proposal_id: "p1", barter_item_id: "b2" }, "a@b.c");
  assert.ok(none.ok && /No club reference value/.test(none.value.warnings[0]));
  assert.equal(((await createLine(sb, T, "co1", { kind: "barter", label: "Goods", amount_brl: 3000, proposal_id: "p1", barter_item_id: "missing" }, "a@b.c")) as any).status, 404);
});

test("a proposed or draft amount cannot be invoiced or settled: drafts are not revenue", async () => {
  const tables = world();
  const sb = db(tables);
  const proposed = await createLine(sb, T, "co1", { kind: "cash", label: "Instalment 1", amount_brl: 50000, proposal_id: "p1" }, "a@b.c");
  const draft = await createLine(sb, T, "co1", { kind: "cash", label: "Instalment 1", amount_brl: 50000, contract_id: "kd" }, "a@b.c");
  const settle = { action: "settle" as const, reference: "TED 5521-889", occurredOn: "2026-10-05" };
  const r1 = await recordEvent(sb, T, (proposed as any).value.id, settle, "fin@club.com");
  assert.ok(!r1.ok && r1.status === 409 && /not revenue/.test(r1.error));
  const r2 = await recordEvent(sb, T, (draft as any).value.id, settle, "fin@club.com");
  assert.ok(!r2.ok && r2.status === 409 && /draft deal is not revenue/.test(r2.error));
  assert.equal(tables.value_line_events.length, 0, "nothing was recorded");
});

test("cash is invoiced then settled; barter is settled when received; a settled line cannot be voided or settled again", async () => {
  const tables = world();
  const sb = db(tables);
  const cash = (await createLine(sb, T, "co1", { kind: "cash", label: "Instalment 1", amount_brl: 50000, contract_id: "k1" }, "a@b.c") as any).value.id;
  const goods = (await createLine(sb, T, "co1", { kind: "barter", label: "Kits", amount_brl: 12000, contract_id: "k1", club_reference_value: 9000 }, "a@b.c") as any).value.id;
  assert.match(((await recordEvent(sb, T, goods, { action: "invoice", reference: "NF-1", occurredOn: "2026-10-01" }, "f@b.c")) as any).error, /cannot be invoiced/);
  assert.equal(((await recordEvent(sb, T, cash, { action: "invoice", reference: "NF", occurredOn: "2026-10-01" }, "f@b.c")) as any).status, 400, "the invoice number is too short");
  assert.ok((await recordEvent(sb, T, cash, { action: "invoice", reference: "NF-2026-114", occurredOn: "2026-10-01" }, "f@b.c")).ok);
  assert.match(((await recordEvent(sb, T, cash, { action: "invoice", reference: "NF-2026-115", occurredOn: "2026-10-01" }, "f@b.c")) as any).error, /cannot be invoiced/);
  assert.ok((await recordEvent(sb, T, cash, { action: "settle", reference: "TED 5521-889", occurredOn: "2026-10-05" }, "f@b.c")).ok);
  assert.match(((await recordEvent(sb, T, cash, { action: "void", reason: "Entered by mistake" }, "f@b.c")) as any).error, /cannot be voided/);
  assert.match(((await recordEvent(sb, T, cash, { action: "settle", reference: "TED 5521-889", occurredOn: "2026-10-05" }, "f@b.c")) as any).error, /cannot be settled/);
  assert.ok((await recordEvent(sb, T, goods, { action: "settle", reference: "Delivery note 8841", occurredOn: "2026-10-06" }, "f@b.c")).ok);
  const summary = await loadSummary(sb, T);
  assert.ok(summary.ok);
  if (!summary.ok) return;
  assert.deepEqual([summary.value.cash.settled, summary.value.cash.recognized, summary.value.barter.settled, summary.value.savings.realized], [50000, 50000, 12000, 9000]);
  const rec = summary.value.reconciliation.find((r) => r.contract_id === "k1")!;
  assert.deepEqual([rec.result, rec.expected_brl, rec.difference_brl], ["lines_short_of_total", 62000, 38000], "50000 cash + 12000 barter does not reach the 100000 total");
});

test("a wrong line is voided and what was voided is not counted", async () => {
  const tables = world();
  const sb = db(tables);
  const id = (await createLine(sb, T, "co1", { kind: "cash", label: "Instalment 1", amount_brl: 50000, contract_id: "k1" }, "a@b.c") as any).value.id;
  assert.equal(((await recordEvent(sb, T, id, { action: "void", reason: "no" }, "f@b.c")) as any).status, 400);
  assert.ok((await recordEvent(sb, T, id, { action: "void", reason: "Entered against the wrong contract" }, "f@b.c")).ok);
  const listed = await listLines(sb, T, { bucket: "voided" });
  assert.ok(listed.ok && listed.value.length === 1 && listed.value[0].actions.length === 0);
  const s = await loadSummary(sb, T);
  assert.ok(s.ok && s.value.cash.committed === 0 && s.value.cash.excluded.voided === 50000);
});

test("proposal lines move onto the contract (the same rows), once, and never onto another company's", async () => {
  const tables = world();
  const sb = db(tables);
  await createLine(sb, T, "co1", { kind: "cash", label: "Instalment 1", amount_brl: 50000, proposal_id: "p1" }, "a@b.c");
  await createLine(sb, T, "co1", { kind: "barter", label: "Kits", amount_brl: 12000, proposal_id: "p1" }, "a@b.c");
  assert.deepEqual(await linkProposalLines(sb, T, "p1", "k1", null), { linked: 0 }, "no company, no link");
  assert.deepEqual(await linkProposalLines(sb, T, "p1", "k1", "co1"), { linked: 2 });
  assert.equal(tables.value_lines.length, 2, "no new rows: the same two lines");
  assert.ok(tables.value_lines.every((l) => l.contract_id === "k1" && l.proposal_id === "p1"));
  assert.deepEqual(await linkProposalLines(sb, T, "p1", "k1", "co1"), { linked: 0 }, "a rerun links nothing more");
  assert.deepEqual(await linkProposalLines(sb, T, "p1", "kd", "co1"), { linked: 0 }, "lines already on a contract stay there");
  const s = await loadSummary(sb, T);
  assert.ok(s.ok && s.value.cash.proposed === 0 && s.value.cash.contracted === 50000, "proposed became contracted, not both");
});

test("the rules start as conservative defaults, are changed by a person, and change what counts", async () => {
  const tables = world();
  const sb = db(tables);
  const first = await loadSettings(sb, T);
  assert.ok(first.ok && first.value.isDefault && first.value.settings.recognition_stage === "settled");
  assert.equal(((await saveSettings(sb, T, { recognition_stage: "invoiced" }, "")) as any).status, 403);
  assert.equal(((await saveSettings(sb, T, { recognition_stage: "later" as any }, "a@b.c")) as any).status, 400);
  assert.equal(((await saveSettings(sb, T, {}, "a@b.c")) as any).status, 400);
  const cash = (await createLine(sb, T, "co1", { kind: "cash", label: "Instalment 1", amount_brl: 50000, contract_id: "k1" }, "a@b.c") as any).value.id;
  await recordEvent(sb, T, cash, { action: "invoice", reference: "NF-2026-114", occurredOn: "2026-10-01" }, "f@b.c");
  assert.equal(((await loadSummary(sb, T)) as any).value.cash.recognized, 0, "invoiced is not yet received");
  assert.ok((await saveSettings(sb, T, { recognition_stage: "invoiced", barter_tax_note: "  Pending advice  " }, "admin@club.com")).ok);
  const after = await loadSettings(sb, T);
  assert.ok(after.ok && !after.value.isDefault && after.value.updated_by === "admin@club.com" && after.value.settings.barter_tax_note === "Pending advice");
  assert.equal(((await loadSummary(sb, T)) as any).value.cash.recognized, 50000);
  assert.ok((await saveSettings(sb, T, { barter_valuation_basis: "club_reference_value" }, "admin@club.com")).ok);
  assert.equal(((await loadSettings(sb, T)) as any).value.settings.recognition_stage, "invoiced", "changing one rule keeps the others");
});

test("before the migration is applied, reading and writing say so instead of failing", async () => {
  const sb = db(world(), { missing: ["value_lines", "accounting_settings"] });
  for (const r of [await loadSummary(sb, T), await listLines(sb, T), await createLine(sb, T, "co1", { kind: "cash", label: "x", amount_brl: 1, proposal_id: "p1" }, "a@b.c")]) {
    assert.ok(!r.ok && r.status === 503 && /migration 0066/.test(r.error));
  }
});
