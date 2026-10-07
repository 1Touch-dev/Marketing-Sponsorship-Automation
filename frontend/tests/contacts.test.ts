import assert from "node:assert/strict";
import test from "node:test";
import { detectOptOut, emailFromHeader, evaluateRecipient, isAuthorized, rolesAsOf, stripQuoted, type RoleRow, type SuppressionRow } from "../lib/contacts/model";
import { assignRole, checkRecipient, checkSend, endRole, filterRecipients, recordSuppression, setSenderAuthorization } from "../lib/contacts/store";

const sup = (decision: "suppressed" | "lifted", at: string, over: Partial<SuppressionRow> = {}): SuppressionRow => ({ decision, reason_code: "asked_to_stop", note: null, actor_kind: "human", actor: "rep@club.com", source: "manual", created_at: at, ...over });
const none = { emailRows: [], companyRows: [], channelChecks: [] };

test("an address nobody has flagged can be contacted, with a warning that it is unverified", () => {
  const v = evaluateRecipient(none);
  assert.deepEqual([v.allowed, v.channel], [true, "unverified"]);
  assert.match(v.warnings[0], /not been verified/);
});

test("a do-not-contact stops the send and says why, who and when", () => {
  const v = evaluateRecipient({ ...none, emailRows: [sup("suppressed", "2026-10-01T10:00:00Z", { note: "wrote us by phone", actor: "ana@club.com" })] });
  assert.equal(v.allowed, false);
  assert.equal(v.blocks[0].code, "suppressed_email");
  assert.match(v.blocks[0].message, /asked us to stop contacting them/);
  assert.match(v.blocks[0].message, /wrote us by phone/);
  assert.match(v.blocks[0].message, /ana@club.com on 2026-10-01/);
});

test("the newest decision wins, whatever order the rows arrive in: lifting reopens, suppressing again closes", () => {
  const rows = [sup("lifted", "2026-10-02T00:00:00Z", { note: "they wrote back asking for the proposal" }), sup("suppressed", "2026-10-01T00:00:00Z")];
  assert.equal(evaluateRecipient({ ...none, emailRows: rows }).allowed, true);
  assert.equal(evaluateRecipient({ ...none, emailRows: [...rows].reverse() }).allowed, true);
  assert.equal(evaluateRecipient({ ...none, emailRows: [...rows, sup("suppressed", "2026-10-03T00:00:00Z")] }).allowed, false);
});

test("a company on the list blocks everyone at it", () => {
  const v = evaluateRecipient({ ...none, companyRows: [sup("suppressed", "2026-10-01T00:00:00Z", { reason_code: "client_request" })] });
  assert.equal(v.allowed, false);
  assert.equal(v.blocks[0].code, "suppressed_company");
  assert.match(v.blocks[0].message, /account asked us not to contact them/);
});

test("a bounced or invalid address is blocked until a person verifies it again", () => {
  const bounced = { outcome: "bounced" as const, method: "delivery_event", checked_by: "provider", created_at: "2026-10-01T00:00:00Z" };
  assert.equal(evaluateRecipient({ ...none, channelChecks: [bounced] }).blocks[0].code, "bad_channel");
  assert.equal(evaluateRecipient({ ...none, channelChecks: [{ ...bounced, outcome: "invalid" }] }).allowed, false);
  const reverified = { outcome: "verified" as const, method: "person", checked_by: "rep@club.com", created_at: "2026-10-05T00:00:00Z" };
  const v = evaluateRecipient({ ...none, channelChecks: [bounced, reverified] });
  assert.deepEqual([v.allowed, v.channel], [true, "verified"]);
});

test("several reasons are all reported", () => {
  const v = evaluateRecipient({ emailRows: [sup("suppressed", "2026-10-01T00:00:00Z")], companyRows: [sup("suppressed", "2026-10-01T00:00:00Z")], channelChecks: [{ outcome: "bounced", method: "x", checked_by: "y", created_at: "2026-10-01T00:00:00Z" }] });
  assert.deepEqual(v.blocks.map((b) => b.code), ["suppressed_email", "suppressed_company", "bad_channel"]);
});

// ── roles ───────────────────────────────────────────────────────────────────

const role = (r: string, from: string, to: string | null): RoleRow => ({ id: `${r}${from}`, role: r as never, started_on: from, ended_on: to, note: null, assigned_by: "x", ended_by: to ? "x" : null, end_reason: to ? "left" : null });

test("roles are read as of a date: an ended role is history, a future one is not yet current", () => {
  const rows = [role("decision_maker", "2025-01-01", "2026-06-30"), role("billing", "2025-01-01", null), role("signatory", "2027-01-01", null)];
  const r = rolesAsOf(rows, "2026-10-07");
  assert.deepEqual(r.current.map((x) => x.role), ["billing"]);
  assert.equal(r.history.length, 3);
  assert.equal(r.history[0].role, "signatory", "history is newest first");
  assert.deepEqual(rolesAsOf(rows, "2026-01-01").current.map((x) => x.role).sort(), ["billing", "decision_maker"]);
});

// ── opt-out in a reply ──────────────────────────────────────────────────────

test("a reply that asks us to stop is an opt-out, in Portuguese and English", () => {
  for (const t of [
    "Por favor, não me envie mais e-mails.", "Pare de me enviar mensagens", "Não quero mais receber isso", "Me remova da lista, obrigado",
    "Favor descadastrar meu e-mail", "Cancelar minha inscrição", "Remova meu e-mail do cadastro", "unsubscribe", "Please remove me from your list",
    "Stop emailing me", "Do not contact me again", "don't email me", "take me off this list",
  ]) assert.equal(detectOptOut(t).optOut, true, t);
});

test("declining a pitch, asking a question or going on holiday is not an opt-out", () => {
  for (const t of [
    "Obrigado, mas não temos interesse neste momento.", "Not interested, thanks.", "Pode me enviar mais detalhes da proposta?",
    "Estou de férias até dia 20.", "Vou encaminhar para o time de marketing.", "Podemos marcar uma conversa na semana que vem?",
  ]) assert.equal(detectOptOut(t).optOut, false, t);
});

test("an opt-out phrase that is only in the quoted original is ignored", () => {
  const reply = "Ótimo, vamos conversar sim!\n\nEm qua, 7 de out. de 2026 às 10:00, Clube <a@clube.com> escreveu:\n> Se não quiser mais receber, responda: me remova da lista";
  assert.equal(detectOptOut(reply).optOut, false);
  assert.equal(stripQuoted(reply).includes("escreveu"), false);
  assert.equal(detectOptOut("> unsubscribe\nOK, pode enviar").optOut, false);
  assert.equal(detectOptOut("Não me envie mais nada.\n\nOn Tue, A wrote:\n> hi").optOut, true);
});

test("the sender's address is read from a From header", () => {
  assert.equal(emailFromHeader('"Ana Souza" <Ana@Acme.com>'), "ana@acme.com");
  assert.equal(emailFromHeader("bob@x.org"), "bob@x.org");
  assert.equal(emailFromHeader("no address here"), null);
});

test("a sender is authorized only while the newest decision says so", () => {
  assert.equal(isAuthorized([]), false);
  assert.equal(isAuthorized([{ decision: "granted", created_at: "2026-10-01" }]), true);
  assert.equal(isAuthorized([{ decision: "granted", created_at: "2026-10-01" }, { decision: "revoked", created_at: "2026-10-02" }]), false);
  assert.equal(isAuthorized([{ decision: "revoked", created_at: "2026-10-01" }, { decision: "granted", created_at: "2026-10-02" }]), true);
});

// ── the store, against an in-memory stand-in ────────────────────────────────

function db(tables: Record<string, any[]>, errors: Record<string, any> = {}) {
  const inserted: Array<{ table: string; row: any }> = [];
  const updated: Array<{ table: string; patch: any }> = [];
  const from = (table: string) => {
    const rows = () => tables[table] ?? [];
    const err = () => errors[table] ?? null;
    const c: any = {
      select: () => c, eq: () => c, ilike: () => c, in: () => c, is: () => c, not: () => c, order: () => c, limit: () => c,
      maybeSingle: async () => ({ data: err() ? null : rows()[0] ?? null, error: err() }),
      single: async () => ({ data: rows()[0] ?? null, error: null }),
      then: (res: any) => res({ data: err() ? null : rows(), error: err() }),
      insert: (row: any) => { inserted.push({ table, row }); const r = { id: `new-${inserted.length}`, ...row }; (tables[table] ??= []).push(r); const i: any = { select: () => i, single: async () => ({ data: r, error: errors[`${table}:insert`] ?? null }) }; return i; },
      update: (patch: any) => { updated.push({ table, patch }); const u: any = { eq: () => u, is: () => u, select: () => u, maybeSingle: async () => ({ data: rows()[0] ?? null, error: null }), then: (res: any) => res({ error: null }) }; return u; },
    };
    return c;
  };
  return { from, inserted, updated };
}
const human = { kind: "human" as const, email: "rep@club.com" };

test("a failure to read the lists closes the gate, and only a missing migration opens it", async () => {
  const missing = await checkRecipient(db({ contacts: [] }, { contact_suppressions: { code: "42P01", message: "relation does not exist" } }), "t", { email: "A@B.com", companyId: null });
  assert.deepEqual([missing.allowed, missing.enforced], [true, false]);
  const broken = await checkRecipient(db({ contacts: [] }, { contact_suppressions: { code: "XX000", message: "connection reset" } }), "t", { email: "a@b.com", companyId: null });
  assert.deepEqual([broken.allowed, broken.blocks[0].code], [false, "check_failed"]);
  const fine = await checkRecipient(db({ contacts: [], contact_suppressions: [], contact_channel_checks: [] }), "t", { email: "a@b.com", companyId: null });
  assert.deepEqual([fine.allowed, fine.enforced], [true, true]);
});

test("putting someone on the list: one subject, a real address, and repeating it changes nothing", async () => {
  const sb = db({ companies: [{ id: "co1" }], contact_suppressions: [] });
  assert.equal((await recordSuppression(sb, "t", { decision: "suppressed", reasonCode: "asked_to_stop", actor: human }) as any).status, 400);
  assert.equal((await recordSuppression(sb, "t", { email: "a@b.com", companyId: "co1", decision: "suppressed", reasonCode: "asked_to_stop", actor: human }) as any).status, 400);
  assert.equal((await recordSuppression(sb, "t", { email: "not an email", decision: "suppressed", reasonCode: "asked_to_stop", actor: human }) as any).status, 400);
  const ok = await recordSuppression(sb, "t", { email: " Ana@Acme.COM ", decision: "suppressed", reasonCode: "asked_to_stop", actor: human });
  assert.equal(ok.ok && ok.value.already, false);
  assert.equal(sb.inserted[0].row.email, "ana@acme.com", "the address is stored lower-case");
  const again = await recordSuppression(sb, "t", { email: "ana@acme.com", decision: "suppressed", reasonCode: "asked_to_stop", actor: { kind: "system", name: "reply-sync" } });
  assert.equal(again.ok && again.value.already, true);
  assert.equal(sb.inserted.filter((i) => i.table === "contact_suppressions").length, 1, "no duplicate row");
});

test("only a person, with a reason, can lift a do-not-contact, and only if it is on the list", async () => {
  const on = () => db({ contact_suppressions: [{ decision: "suppressed", created_at: "2026-10-01" }] });
  assert.equal((await recordSuppression(on(), "t", { email: "a@b.com", decision: "lifted", reasonCode: "other", note: "they asked us to write again", actor: { kind: "system", name: "bot" } }) as any).status, 403);
  assert.equal((await recordSuppression(on(), "t", { email: "a@b.com", decision: "lifted", reasonCode: "other", note: "no", actor: human }) as any).status, 400);
  assert.equal((await recordSuppression(db({ contact_suppressions: [] }), "t", { email: "a@b.com", decision: "lifted", reasonCode: "other", note: "they asked us to write again", actor: human }) as any).status, 409);
  const sb = on();
  assert.equal((await recordSuppression(sb, "t", { email: "a@b.com", decision: "lifted", reasonCode: "other", note: "they asked us to write again", actor: human })).ok, true);
  assert.equal(sb.inserted[0].row.decision, "lifted");
});

test("a company that does not exist cannot be put on the list", async () => {
  const r = await recordSuppression(db({ companies: [] }), "t", { companyId: "nope", decision: "suppressed", reasonCode: "client_request", actor: human });
  assert.equal(!r.ok && r.status, 404);
});

test("a role can be given once at a time, and ending it needs a reason", async () => {
  const held = db({ contacts: [{ id: "k1", company_id: "co1" }], contact_roles: [{ id: "r1", role: "billing", started_on: "2025-01-01", ended_on: null, note: null, assigned_by: "x", ended_by: null, end_reason: null }] });
  assert.equal((await assignRole(held, "t", "k1", { role: "billing", by: "rep@club.com" }) as any).status, 409);
  assert.equal((await assignRole(held, "t", "k1", { role: "signatory", by: "rep@club.com" })).ok, true);
  assert.equal((await assignRole(held, "t", "k1", { role: "wizard" as never, by: "rep@club.com" }) as any).status, 400);
  assert.equal((await assignRole(db({ contacts: [] }), "t", "k1", { role: "billing", by: "x@y.z" }) as any).status, 404);
  assert.equal((await endRole(held, "t", "k1", "r1", { reason: "", by: "x@y.z" }) as any).status, 400);
  assert.equal((await endRole(held, "t", "k1", "r1", { reason: "left the company", by: "x@y.z" })).ok, true);
});

test("authorizing a sender needs an active member, a person and a reason, and cannot repeat itself", async () => {
  const member = (authorized: boolean) => db({ team_members: [{ id: "m1", active: true }], sender_authorizations: authorized ? [{ decision: "granted", created_at: "2026-10-01" }] : [] });
  assert.equal((await setSenderAuthorization(member(false), "t", "m1", { decision: "granted", reason: "joined the sales team", actorEmail: "" }) as any).status, 403);
  assert.equal((await setSenderAuthorization(member(false), "t", "m1", { decision: "granted", reason: "ok", actorEmail: "a@b.c" }) as any).status, 400);
  assert.equal((await setSenderAuthorization(member(true), "t", "m1", { decision: "granted", reason: "joined the sales team", actorEmail: "a@b.c" }) as any).status, 409);
  assert.equal((await setSenderAuthorization(member(false), "t", "m1", { decision: "revoked", reason: "left the sales team", actorEmail: "a@b.c" }) as any).status, 409);
  assert.equal((await setSenderAuthorization(member(false), "t", "m1", { decision: "granted", reason: "joined the sales team", actorEmail: "a@b.c" })).ok, true);
  assert.equal((await setSenderAuthorization(member(true), "t", "m1", { decision: "revoked", reason: "left the sales team", actorEmail: "a@b.c" })).ok, true);
  const inactive = db({ team_members: [{ id: "m1", active: false }] });
  assert.equal((await setSenderAuthorization(inactive, "t", "m1", { decision: "granted", reason: "joined the sales team", actorEmail: "a@b.c" }) as any).status, 409);
});

test("an email signed as a person who is no longer authorized cannot be sent", async () => {
  const email = { recipient: "ana@acme.com", company_id: "co1", sender_member_id: "m1" };
  const revoked = db({ contact_suppressions: [], contact_channel_checks: [], sender_authorizations: [{ decision: "granted", created_at: "2026-10-01" }, { decision: "revoked", created_at: "2026-10-02" }] });
  const r = await checkSend(revoked, "t", email);
  assert.deepEqual([r.allowed, r.blocks.map((b) => b.code)], [false, ["sender_not_authorized"]]);
  const granted = db({ contact_suppressions: [], contact_channel_checks: [], sender_authorizations: [{ decision: "granted", created_at: "2026-10-01" }] });
  assert.equal((await checkSend(granted, "t", email)).allowed, true);
  const unsigned = db({ contact_suppressions: [], contact_channel_checks: [] });
  assert.equal((await checkSend(unsigned, "t", { recipient: "ana@acme.com", company_id: "co1", sender_member_id: null })).allowed, true, "an email signed as no one has no signer to check");
});

test("a newsletter list leaves out the people who may not be contacted, and says why", async () => {
  const sb = db({
    contact_suppressions: [{ subject_kind: "email", email: "stop@acme.com", company_id: null, decision: "suppressed", reason_code: "asked_to_stop", note: null, actor_kind: "human", actor: "x", source: "manual", created_at: "2026-10-01" }, { subject_kind: "company", email: null, company_id: "co9", decision: "suppressed", reason_code: "client_request", note: null, actor_kind: "human", actor: "x", source: "manual", created_at: "2026-10-01" }],
    contact_channel_checks: [{ value: "dead@acme.com", outcome: "bounced", method: "delivery_event", checked_by: "p", created_at: "2026-10-01" }],
    contacts: [{ email: "boss@bigco.com", company_id: "co9" }],
  });
  const r = await filterRecipients(sb, "t", ["ok@acme.com", "STOP@acme.com", "dead@acme.com", "boss@bigco.com", "ok@acme.com"]);
  assert.deepEqual(r.allowed, ["ok@acme.com"]);
  assert.deepEqual(r.skipped.map((s) => s.email).sort(), ["boss@bigco.com", "dead@acme.com", "stop@acme.com"]);
  assert.equal(r.enforced, true);
});
