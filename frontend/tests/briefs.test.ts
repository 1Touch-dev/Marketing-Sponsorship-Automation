import assert from "node:assert/strict";
import test from "node:test";
import { BRIEF_MAX_AGE_DAYS, briefPromptBlock, cleanBrief, evaluateGate, gateMessage, validateBrief, type BriefInput, type BriefRow } from "../lib/briefs/model";
import { checkDiscoveryGate, DiscoveryGateError, saveBrief } from "../lib/briefs/store";
import { proposalPrompt, CORITIBA_CLUB_CONTEXT_INPUT } from "../lib/bedrock/prompts";

const quick: BriefInput = {
  level: "quick", objective: "Reach families in Curitiba before the new season", period_start: "2026-11-01", period_end: "2027-10-31",
  contact_name: "Ana Souza", contact_email: "ana@acme.com", next_action: "Send the rate card", next_action_due: "2026-10-20",
};
const full: BriefInput = {
  ...quick, level: "full", why_sponsor: "Expanding in Paraná", why_package: "Stadium visibility fits a family brand",
  evidence: [{ claim: "Opened 3 stores in 2025", source_name: "Gazeta do Povo", source_url: "https://example.com/n", confidence: "medium" }],
  unverified: ["Marketing budget", "Who signs"],
};
const row = (b: BriefInput, over: Partial<BriefRow> = {}): BriefRow => ({ ...b, id: "b1", author_email: "rep@club.com", created_at: "2026-10-07T10:00:00Z", evidence: b.evidence ?? [], unverified: b.unverified ?? [], ...over });

test("a quick brief needs the four discovery fields, and nothing else", () => {
  assert.equal(validateBrief(quick), null);
  assert.match(validateBrief({ ...quick, objective: "  " }) ?? "", /objective/);
  assert.match(validateBrief({ ...quick, contact_name: "" }) ?? "", /point of contact/);
  assert.match(validateBrief({ ...quick, next_action: "" }) ?? "", /next action/);
  assert.match(validateBrief({ ...quick, period_start: "" }) ?? "", /period_start/);
  assert.match(validateBrief({ ...quick, period_end: "31/12/2026" }) ?? "", /period_end/);
  assert.match(validateBrief({ ...quick, period_end: "2026-10-31", period_start: "2026-11-01" }) ?? "", /before/);
  assert.match(validateBrief({ ...quick, contact_email: "not-an-email" }) ?? "", /email/);
  assert.match(validateBrief({ ...quick, next_action_due: "tomorrow" }) ?? "", /next_action_due/);
});

test("a full brief also needs why-sponsor, why-package and a cited piece of evidence", () => {
  assert.equal(validateBrief(full), null);
  assert.match(validateBrief({ ...full, why_sponsor: " " }) ?? "", /why_sponsor/);
  assert.match(validateBrief({ ...full, why_package: null }) ?? "", /why_package/);
  assert.match(validateBrief({ ...full, evidence: [] }) ?? "", /at least one cited/);
  assert.match(validateBrief({ ...full, evidence: [{ claim: "x" }] }) ?? "", /source name or link/);
  assert.match(validateBrief({ ...full, evidence: [{ claim: "x", source_url: "ftp://a.b" }] }) ?? "", /http\(s\)/);
  assert.match(validateBrief({ ...full, evidence: [{ claim: "x", source_name: "S", confidence: "sure" as never }] }) ?? "", /confidence/);
});

test("cleaning trims text and drops empty optional fields", () => {
  const c = cleanBrief({ ...full, objective: "  Reach families  ", contact_email: " ", unverified: [" a ", ""] });
  assert.equal(c.objective, "Reach families");
  assert.equal(c.contact_email, null);
  assert.deepEqual(c.unverified, ["a"]);
});

test("the gate is closed with no brief, naming the four discovery fields, and open with a recent one", () => {
  const none = evaluateGate(null);
  assert.equal(none.ok, false);
  assert.deepEqual(none.missing, ["objective", "period", "point of contact", "next action"]);
  const ok = evaluateGate({ id: "b1", level: "quick", created_at: "2026-10-07T10:00:00Z" }, new Date("2026-10-08T10:00:00Z"));
  assert.deepEqual([ok.ok, ok.level, ok.briefId], [true, "quick", "b1"]);
});

test("a brief goes stale after 90 days, exactly at the boundary", () => {
  const made = "2026-01-01T00:00:00Z";
  const day = (n: number) => new Date(new Date(made).getTime() + n * 86_400_000);
  assert.equal(evaluateGate({ id: "b", level: "full", created_at: made }, day(BRIEF_MAX_AGE_DAYS)).ok, true);
  const stale = evaluateGate({ id: "b", level: "full", created_at: made }, day(BRIEF_MAX_AGE_DAYS + 1));
  assert.equal(stale.ok, false);
  assert.match(stale.missing[0], /91 days old/);
});

test("the refusal tells the person where to add a brief", () => {
  const msg = gateMessage("Acme", "co-9", evaluateGate(null));
  assert.match(msg, /Acme/);
  assert.match(msg, /\/companies\/co-9\/brief/);
});

test("the prompt block never lets the brief or research set a price", () => {
  for (const b of [row(quick), row(full)]) assert.match(briefPromptBlock(b), /Prices come from the rate card[\s\S]*do not invent, adjust or imply a price/);
});

test("a quick brief tells the model there is no research, so it keeps sponsor facts general", () => {
  const block = briefPromptBlock(row(quick));
  assert.match(block, /Objective: Reach families/);
  assert.match(block, /Point of contact: Ana Souza \(ana@acme.com\)/);
  assert.match(block, /No cited research is on file/);
  assert.ok(!block.includes("STILL UNVERIFIED"));
});

test("a full brief keeps uncertain claims uncertain and lists what is unverified", () => {
  const block = briefPromptBlock(row(full));
  assert.match(block, /Opened 3 stores in 2025 \(source: Gazeta do Povo, https:\/\/example.com\/n; confidence: medium\)/);
  assert.match(block, /only when its confidence is high/);
  assert.match(block, /STILL UNVERIFIED[\s\S]*Marketing budget[\s\S]*Who signs/);
  assert.ok(!block.includes("No cited research is on file"));
});

test("the brief reaches the proposal prompt, and nothing is added without one", () => {
  const base = { company: { company_name: "Acme" }, campaign: { title: "T" }, tenant: CORITIBA_CLUB_CONTEXT_INPUT };
  const withBrief = proposalPrompt({ ...base, buyerBrief: briefPromptBlock(row(full)) });
  assert.ok(withBrief.user.includes("BUYER BRIEF"));
  assert.ok(withBrief.user.includes("Reach families in Curitiba"));
  assert.ok(!proposalPrompt(base).user.includes("BUYER BRIEF"));
});

// ── store ───────────────────────────────────────────────────────────────────

function db(opts: { companies?: any[]; briefs?: any[]; briefsError?: { code?: string; message: string } | null }) {
  const inserted: any[] = [];
  const from = (table: string) => {
    const rows = table === "companies" ? opts.companies ?? [] : opts.briefs ?? [];
    const err = table === "proposal_briefs" ? opts.briefsError ?? null : null;
    const c: any = {
      select: () => c, eq: () => c, order: () => c,
      maybeSingle: async () => ({ data: rows[0] ?? null, error: null }),
      single: async () => ({ data: rows[0] ?? null, error: null }),
      then: (res: any) => res({ data: err ? null : rows, error: err }),
      insert: (row: any) => { inserted.push({ table, row }); const i: any = { select: () => i, single: async () => ({ data: { id: "new-brief" }, error: null }) }; return i; },
    };
    return c;
  };
  return { from, inserted };
}

test("only a signed-in person can write a brief, and an invalid one is refused before saving", async () => {
  const sb = db({ companies: [{ id: "co1" }] });
  const noAuthor = await saveBrief(sb, "t", "co1", quick, "");
  assert.equal(!noAuthor.ok && noAuthor.status, 403);
  const bad = await saveBrief(sb, "t", "co1", { ...quick, objective: "" }, "rep@club.com");
  assert.equal(!bad.ok && bad.status, 400);
  assert.equal(sb.inserted.length, 0);
  const noCompany = await saveBrief(db({ companies: [] }), "t", "co1", quick, "rep@club.com");
  assert.equal(!noCompany.ok && noCompany.status, 404);
  const ok = await saveBrief(sb, "t", "co1", full, "rep@club.com");
  assert.equal(ok.ok, true);
  assert.equal(sb.inserted[0].row.author_email, "rep@club.com");
  assert.equal(sb.inserted[0].row.level, "full");
});

test("the gate stays closed when the brief cannot be read, and only opens when briefs are not set up at all", async () => {
  const notSetUp = await checkDiscoveryGate(db({ briefsError: { code: "42P01", message: 'relation "proposal_briefs" does not exist' } }), "t", "co1", "Acme");
  assert.deepEqual([notSetUp.ok, notSetUp.enforced], [true, false]);
  const broken = await checkDiscoveryGate(db({ briefsError: { code: "XX000", message: "connection reset" } }), "t", "co1", "Acme");
  assert.deepEqual([broken.ok, broken.enforced], [false, true]);
  assert.match(broken.message ?? "", /connection reset/);
  const empty = await checkDiscoveryGate(db({ briefs: [] }), "t", "co1", "Acme");
  assert.equal(empty.ok, false);
  assert.match(empty.message ?? "", /point of contact/);
  const fresh = await checkDiscoveryGate(db({ briefs: [row(quick, { created_at: new Date().toISOString() })] }), "t", "co1", "Acme");
  assert.equal(fresh.ok, true);
  assert.equal(fresh.brief?.id, "b1");
});

test("code that generates outside a route can throw a typed error that answers 409", () => {
  const e = new DiscoveryGateError("needs a brief", ["objective"]);
  assert.deepEqual([e.status, e.code, e.missing], [409, "discovery_brief_required", ["objective"]]);
  assert.ok(e instanceof Error);
});
