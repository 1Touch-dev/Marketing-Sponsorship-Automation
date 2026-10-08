import assert from "node:assert/strict";
import test from "node:test";
import { checkPlaybook, defaultPlaybook, PLAYBOOKS, RELATIONSHIP_PLAYBOOKS, type OutreachActor } from "../lib/playbooks/definitions";
import { relationshipEmailPrompt } from "../lib/playbooks/prompt";
import { relationshipEmailViolations } from "../lib/playbooks/guard";
import { resolveDefaultSender } from "../lib/email/template-engine";
import { hasPriorOutbound, loadOutreachContext, stampEmail } from "../lib/playbooks/store";

const human: OutreachActor = { kind: "human", email: "rep@club.com" };
const agent: OutreachActor = { kind: "agent", name: "outreach-agent" };
const base = { stage: "directory" as const, firstTouch: true, hasApprovedProposal: false, detail: null as string | null };

test("the three relationship-first playbooks need no proposal; only the pitch does", () => {
  assert.deepEqual([...RELATIONSHIP_PLAYBOOKS], ["conversation", "invitation", "introduction"]);
  for (const p of RELATIONSHIP_PLAYBOOKS) assert.equal(PLAYBOOKS[p].requiresProposal, false);
  assert.equal(PLAYBOOKS.pitch.requiresProposal, true);
  assert.equal(PLAYBOOKS.pitch.relationshipFirst, false);
});

test("the default first touch to an account nobody has qualified is a conversation, even with a proposal ready", () => {
  assert.equal(defaultPlaybook({ stage: "directory", firstTouch: true, hasApprovedProposal: true }).playbook, "conversation");
  assert.equal(defaultPlaybook({ stage: "researched", firstTouch: true, hasApprovedProposal: true }).playbook, "conversation");
  assert.equal(defaultPlaybook({ stage: "directory", firstTouch: true, hasApprovedProposal: false }).playbook, "conversation");
});

test("once a person has qualified the account, or it has been contacted, the pitch is the default", () => {
  assert.equal(defaultPlaybook({ stage: "qualified", firstTouch: true, hasApprovedProposal: true }).playbook, "pitch");
  assert.equal(defaultPlaybook({ stage: "directory", firstTouch: false, hasApprovedProposal: true }).playbook, "pitch");
  assert.equal(defaultPlaybook({ stage: "qualified", firstTouch: true, hasApprovedProposal: false }).playbook, "conversation", "no approved proposal means nothing to pitch");
  assert.ok(defaultPlaybook({ stage: "directory", firstTouch: true, hasApprovedProposal: false }).reason.length > 10);
});

test("relationship-first playbooks are open to everyone, agents included", () => {
  for (const actor of [human, agent]) {
    assert.equal(checkPlaybook({ ...base, playbook: "conversation", actor }).allowed, true);
  }
});

test("an invitation or an introduction needs facts a person supplies; the model never invents them", () => {
  const noDetail = checkPlaybook({ ...base, playbook: "invitation", actor: human });
  assert.equal(noDetail.allowed, false);
  assert.match(noDetail.reason ?? "", /event details/);
  assert.equal(checkPlaybook({ ...base, playbook: "invitation", detail: "   ", actor: human }).allowed, false);
  assert.equal(checkPlaybook({ ...base, playbook: "invitation", detail: "Jogo contra o Paraná, 15/11, camarote", actor: human }).allowed, true);
  assert.match(checkPlaybook({ ...base, playbook: "introduction", actor: human }).reason ?? "", /topic/);
});

test("a pitch needs an approved proposal", () => {
  const r = checkPlaybook({ ...base, playbook: "pitch", stage: "qualified", firstTouch: false, hasApprovedProposal: false, actor: human });
  assert.equal(r.allowed, false);
  assert.match(r.reason ?? "", /approved proposal/);
});

test("an agent cannot pitch an account no person has qualified, but can once one has", () => {
  const blocked = checkPlaybook({ ...base, playbook: "pitch", hasApprovedProposal: true, actor: agent });
  assert.equal(blocked.allowed, false);
  assert.match(blocked.reason ?? "", /no person has qualified/);
  assert.equal(checkPlaybook({ ...base, playbook: "pitch", stage: "researched", hasApprovedProposal: true, actor: agent }).allowed, false);
  assert.equal(checkPlaybook({ ...base, playbook: "pitch", stage: "qualified", hasApprovedProposal: true, actor: agent }).allowed, true);
});

test("a person may choose a pitch as the first contact, and the choice is recorded", () => {
  const r = checkPlaybook({ ...base, playbook: "pitch", hasApprovedProposal: true, actor: human });
  assert.equal(r.allowed, true);
  assert.match(r.note ?? "", /rep@club.com/);
  assert.match(r.note ?? "", /default was a conversation/);
  assert.equal(checkPlaybook({ ...base, playbook: "pitch", stage: "qualified", hasApprovedProposal: true, actor: human }).note, undefined, "no note when it is the default");
  assert.equal(checkPlaybook({ ...base, playbook: "pitch", firstTouch: false, hasApprovedProposal: true, actor: human }).note, undefined);
});

// ── the prompt ──────────────────────────────────────────────────────────────

test("the relationship prompt forbids proposals, prices and links, and keeps the model to supplied facts", () => {
  const { system, user } = relationshipEmailPrompt({ playbook: "conversation", companyName: "Acme Foods", industry: "Food", contactName: "Ana" });
  assert.match(system, /RELATIONSHIP email/);
  assert.match(system, /No proposal, no sponsorship package, no price/);
  assert.match(system, /No link, no attachment/);
  assert.match(system, /Under 120 words/);
  assert.match(system, /Do not invent facts about the company/);
  assert.match(system, /VERIFIED CLUB FIGURES: none are currently available/);
  assert.match(user, /Company: Acme Foods/);
  assert.match(user, /Contact name: Ana/);
  assert.ok(!/proposal link/i.test(user));
});

test("an invitation states exactly the details a person gave", () => {
  const detail = "Jogo contra o Paraná, 15/11 às 16h, camarote 4";
  const { user } = relationshipEmailPrompt({ playbook: "invitation", companyName: "Acme", detail });
  assert.ok(user.includes(detail));
  assert.match(user, /inventing nothing/);
  assert.match(user, /Ask them to reply to confirm/);
});

test("verified figures and a buyer brief pass through, the brief as background only", () => {
  const { system, user } = relationshipEmailPrompt({ playbook: "conversation", companyName: "Acme", verifiedClaims: "VERIFIED CLUB FIGURES (the ONLY club numbers you may state...):\n- Capacidade: 40.502", buyerBrief: "BUYER BRIEF: Objective: reach families" });
  assert.ok(system.includes("Capacidade: 40.502"));
  assert.match(user, /Background only \(do not quote it back to them\)[\s\S]*Objective: reach families/);
});

// ── the output guard ────────────────────────────────────────────────────────

test("the guard refuses a relationship email that carries a link, a price, a discount or a placeholder", () => {
  const rules = (t: string) => relationshipEmailViolations(t).map((v) => v.rule);
  assert.deepEqual(rules("Veja em https://clube.com/proposta"), ["contains a link"]);
  assert.ok(rules("Acesse www.clube.com.br").includes("contains a link"));
  assert.ok(rules("O investimento é de R$ 50.000").includes("mentions a price"));
  assert.ok(rules("custa 20 mil reais").includes("mentions a price"));
  assert.ok(rules("com 15% de retorno").includes("mentions a percentage or discount"));
  assert.ok(rules("Temos um desconto especial").includes("mentions a percentage or discount"));
  assert.ok(rules("Olá [Nome], tudo bem?").includes("contains a placeholder"));
  assert.ok(rules("Segue a proposta comercial em anexo").includes("refers to a proposal or package"));
});

test("a clean relationship email passes the guard", () => {
  const clean = "Olá Ana, sou da área comercial do Coritiba. Vi que a Acme Foods está crescendo no Paraná e fiquei curioso: o que vocês buscam em termos de presença junto às famílias da região? Se fizer sentido, adoraria conversar por 15 minutos. Abraço.";
  assert.deepEqual(relationshipEmailViolations(clean), []);
});

// ── store ───────────────────────────────────────────────────────────────────

function db(tables: Record<string, any[]>, errors: Record<string, any> = {}) {
  const updates: Array<{ table: string; patch: any }> = [];
  const from = (table: string) => {
    const rows = tables[table] ?? [];
    const c: any = {
      select: () => c, eq: () => c, in: () => c, not: () => c,
      maybeSingle: async () => ({ data: rows[0] ?? null, error: errors[table] ?? null }),
      order: async () => ({ data: rows, error: null }),
      then: (res: any) => res({ data: errors[table] ? null : rows, count: errors[table] ? null : rows.length, error: errors[table] ?? null }),
      update: (patch: any) => { updates.push({ table, patch }); const u: any = { eq: () => u, then: (res: any) => res({ error: errors[`${table}:update`] ?? null }) }; return u; },
    };
    return c;
  };
  return { from, updates };
}

test("an account is a first touch until an email to it has actually been sent", async () => {
  assert.equal(await hasPriorOutbound(db({ emails: [], proposals: [] }), "t", "co1"), false);
  assert.equal(await hasPriorOutbound(db({ emails: [{ id: "e1" }] }), "t", "co1"), true, "sent by its own company link");
  assert.equal(await hasPriorOutbound(db({ emails: [], proposals: [{ id: "p1" }] }), "t", "co1"), false);
});

test("the outreach context recommends a conversation for an unqualified first touch, and survives old schemas", async () => {
  const none = await loadOutreachContext(db({ companies: [] }), "t", "co1");
  assert.equal(none, null);
  const sb = db({ companies: [{ id: "co1", company_name: "Acme", industry: "Food" }], company_research: [], company_qualifications: [], emails: [], proposals: [] });
  const c = await loadOutreachContext(sb, "t", "co1");
  assert.deepEqual([c?.stage, c?.firstTouch, c?.hasApprovedProposal, c?.recommendation.playbook], ["directory", true, false, "conversation"]);
});

test("stamping an email never throws, before or after the migration", async () => {
  const ok = db({}, {});
  await stampEmail(ok, "t", "e1", { companyId: "co1", playbook: "pitch", note: "n" });
  assert.deepEqual(ok.updates[0].patch, { company_id: "co1", playbook: "pitch", playbook_note: "n" });
  await stampEmail(db({}, { "emails:update": { code: "42703", message: "column does not exist" } }), "t", "e1", { companyId: "co1", playbook: "pitch" });
  const broken = { from: () => { throw new Error("db down"); } };
  await stampEmail(broken, "t", "e1", { companyId: "co1", playbook: "pitch" });
});

test("the default sender is looked up for one tenant only, so another club's team member never signs the email", async () => {
  const filters: Array<[string, unknown]> = [];
  const make = (authRows: Array<{ decision: string; created_at: string }>) => ({
    from: (table: string) => {
      const c: any = {
        select: () => c, eq: (k: string, v: unknown) => { if (table === "team_members") filters.push([k, v]); return c; }, limit: () => c,
        maybeSingle: async () => ({ data: { id: "m1", full_name: "Ana Club A", title: "Gerente" }, error: null }),
        then: (res: any) => res({ data: authRows, error: null }),
      };
      return c;
    },
  }) as any;

  const signed = await resolveDefaultSender(make([{ decision: "granted", created_at: "2026-10-01" }]), "tenant-a");
  assert.deepEqual(filters.find(([k]) => k === "tenant_id"), ["tenant_id", "tenant-a"]);
  assert.deepEqual(signed, { senderName: "Ana Club A", senderTitle: "Gerente", memberId: "m1" });

  // Task 14: the email is only signed as a person while that person is an authorized sender.
  const revoked = await resolveDefaultSender(make([{ decision: "granted", created_at: "2026-10-01" }, { decision: "revoked", created_at: "2026-10-02" }]), "tenant-a");
  assert.deepEqual(revoked, { senderName: "Departamento Comercial", senderTitle: "", memberId: null });
  const never = await resolveDefaultSender(make([]), "tenant-a");
  assert.equal(never.memberId, null);

  const none = await resolveDefaultSender({ from: () => { throw new Error("db down"); } } as any, "tenant-a");
  assert.deepEqual(none, { senderName: "Departamento Comercial", senderTitle: "", memberId: null });
});
