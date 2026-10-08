import assert from "node:assert/strict";
import test from "node:test";
import {
  actorProblems, agentActor, canActAsApprover, externalActor, finalizeActor, internalActor, isDecisionAction, personActor, serviceActor, userActor, userOrService,
} from "../lib/identity/actor";
import { logFingerprint } from "../lib/identity/privacy";
import { auditRow, insertAudit } from "../lib/audit/log";

const U1 = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const U2 = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const user = { id: U1, email: "Ana@Club.com", full_name: "Ana Souza", role: "sales_rep" };
const admin = { ...user, id: U2, role: "admin" };

test("a person is recorded as a person: id, role and email, never as a service", () => {
  const a = userActor(user);
  assert.deepEqual([a.kind, a.id, a.email, a.role, a.userId, a.label], ["human", U1, "ana@club.com", "sales_rep", U1, "Ana Souza"]);
  assert.deepEqual(actorProblems(a), []);
});

test("an agent is its own actor, names who it acted for, and is never mistaken for that person", () => {
  const a = agentActor("renewal-agent", { onBehalfOf: "Ana@Club.com", version: 3, runId: "run-9" });
  assert.deepEqual([a.kind, a.id, a.onBehalfOf], ["agent", "agent:renewal-agent@v3", "ana@club.com"]);
  assert.match(a.label, /renewal-agent agent \(run run-9\)/);
  assert.equal(a.userId, undefined, "it has no user id of its own to borrow");
  assert.equal(agentActor("x-agent").onBehalfOf, null, "an unattended run acts for nobody");
  assert.throws(() => agentActor("  "), /needs the agent's name/);
});

test("services and outside parties have their own kinds and ids", () => {
  assert.deepEqual([serviceActor("documenso-sync").kind, serviceActor("documenso-sync").id], ["service", "service:documenso-sync"]);
  assert.deepEqual([externalActor("email recipient", "email:abc").kind, externalActor("email recipient", "email:abc").id], ["external", "external:email:abc"]);
  assert.equal(externalActor("a lead form").id, "external:a lead form");
  assert.throws(() => serviceActor(""), /needs the service's name/);
  assert.throws(() => externalActor(" "), /needs a label/);
});

test("a decision is recorded as an approver only when the person is allowed to decide", () => {
  for (const action of ["proposal.approve", "proposal.reject", "obligation.accept", "recap.issued", "contract.signature_verified", "claim.verified", "proposal.revision_requested"]) {
    assert.ok(isDecisionAction(action), action);
  }
  for (const action of ["proposal.edited", "company.created", "proposal.approval_invalidated", "email.sent", "obligation.deliver"]) assert.ok(!isDecisionAction(action), action);
  assert.equal(finalizeActor(userActor(admin), "proposal.approve").kind, "approver");
  assert.equal(finalizeActor(userActor({ ...user, role: "approver" }), "obligation.accept").kind, "approver");
  assert.equal(finalizeActor(userActor(user), "proposal.approve").kind, "human", "a sales rep making the call is not an approver");
  assert.equal(finalizeActor(userActor(admin), "proposal.edited").kind, "human", "an admin editing is an ordinary action");
  assert.equal(finalizeActor(agentActor("renewal-agent"), "proposal.approve").kind, "agent", "an agent can never become an approver");
  assert.ok(canActAsApprover("admin") && canActAsApprover("approver") && !canActAsApprover("viewer") && !canActAsApprover(null));
});

test("a malformed actor is caught", () => {
  assert.match(actorProblems(null).join(), /required/);
  assert.match(actorProblems({ kind: "agent", id: "renewal", label: "x" }).join(), /agent id starts with agent:/);
  assert.match(actorProblems({ kind: "service", id: "x", label: "x" }).join(), /service id starts with service:/);
  assert.match(actorProblems({ kind: "external", id: "x", label: "x" }).join(), /external id starts with external:/);
  assert.match(actorProblems({ kind: "human", id: "x", label: "x" }).join(), /user id or an email/);
  assert.match(actorProblems({ kind: "robot" as never, id: "x", label: "x" }).join(), /kind must be one of/);
  assert.match(actorProblems({ kind: "service", id: " ", label: " " }).join(), /needs an id.*needs a label/);
});

test("a person known only by an email or an id can still be named", () => {
  assert.equal(personActor({}), null);
  assert.deepEqual([personActor({ email: "Bia@Club.com" })!.id, personActor({ email: "Bia@Club.com" })!.email], ["user:bia@club.com", "bia@club.com"]);
  assert.equal(personActor({ id: "u-7" })!.id, "u-7");
  assert.deepEqual(actorProblems(personActor({ email: "bia@club.com" })), []);
});

test("an unattended caller is a service, named from a header only as a label", () => {
  const req = (h: Record<string, string>) => new Request("http://x/y", { headers: h });
  assert.equal(internalActor(req({})).id, "service:internal-api");
  assert.equal(internalActor(req({ "x-service-name": "n8n nightly" })).id, "service:n8n nightly");
  assert.equal(internalActor(req({ "x-service-name": "<script>" })).id, "service:internal-api", "an odd name is ignored");
  assert.equal(userOrService(user, req({})).kind, "human");
  assert.equal(userOrService(null, req({ "x-service-name": "cron" })).id, "service:cron");
  assert.equal(userOrService(null, req({}), "stripe webhook").id, "service:stripe webhook");
});

test("a fingerprint is stable, short, case-insensitive and does not contain the value", () => {
  const a = logFingerprint("203.0.113.9");
  assert.match(a!, /^[0-9a-f]{16}$/);
  assert.equal(a, logFingerprint(" 203.0.113.9 "));
  assert.equal(logFingerprint("Bea@Sponsor.com"), logFingerprint("bea@sponsor.com"));
  assert.notEqual(logFingerprint("a@b.com"), logFingerprint("c@d.com"));
  assert.equal(logFingerprint(null), null);
  assert.ok(!a!.includes("203"));
});

// ── the audit writer ────────────────────────────────────────────────────────

const T = "11111111-1111-1111-1111-111111111111";
const ENTITY = "22222222-2222-2222-2222-222222222222";

test("an audit row spells out who did it", () => {
  const row = auditRow({ actor: userActor(user), entity_type: "company", entity_id: ENTITY, action: "company.created", metadata: { n: 1 }, request_id: "req-1" }, T);
  assert.deepEqual(
    [row.tenant_id, row.actor_kind, row.actor_id, row.actor_role, row.actor_email, row.performed_by, row.request_id, row.entity_id],
    [T, "human", U1, "sales_rep", "ana@club.com", null, "req-1", ENTITY],
  );
  const agent = auditRow({ actor: agentActor("outreach-agent", { onBehalfOf: "ana@club.com" }), entity_type: "email", action: "agent.tool.send_email" }, T);
  assert.deepEqual([agent.actor_kind, agent.on_behalf_of, agent.performed_by, agent.actor_email], ["agent", "ana@club.com", null, null]);
  assert.equal(auditRow({ actor: userActor(admin), entity_type: "proposal", action: "proposal.approve" }, T).actor_kind, "approver");
  assert.equal(auditRow({ actor: userActor(user), entity_type: "x", action: "x.y", entity_id: "not-a-uuid" }, T).entity_id, null, "a non-UUID entity id is dropped, not stored");
});

const fakeSb = (outcomes: Array<{ error: { code?: string; message: string } | null }>) => {
  const inserted: any[] = [];
  return { inserted, from: () => ({ insert: async (row: any) => { inserted.push(row); return outcomes.shift() ?? { error: null }; } }) };
};

test("an entry is stored, and an entry with no usable actor is refused", async () => {
  const sb = fakeSb([]);
  assert.deepEqual(await insertAudit(sb, T, { actor: userActor(user), entity_type: "company", action: "company.created" }), { ok: true });
  assert.equal(sb.inserted[0].actor_kind, "human");
  const bad = await insertAudit(sb, T, { actor: { kind: "agent", id: "renewal", label: "x" }, entity_type: "company", action: "x.y" });
  assert.ok(!bad.ok && /invalid actor/.test(bad.error!));
  assert.equal(sb.inserted.length, 1, "nothing was written for the bad actor");
});

test("before the migration the entry is still stored, with the actor kept in its metadata", async () => {
  for (const code of ["PGRST204", "42703"]) {
    const sb = fakeSb([{ error: { code, message: "Could not find the 'actor_kind' column of 'audit_logs' in the schema cache" } }]);
    const r = await insertAudit(sb, T, { actor: agentActor("renewal-agent", { onBehalfOf: "ana@club.com" }), entity_type: "proposal", action: "agent.renewal.drafted", metadata: { x: 1 }, request_id: "r1" });
    assert.deepEqual(r, { ok: true, degraded: true });
    const fallback = sb.inserted[1];
    for (const c of ["actor_kind", "actor_id", "actor_label", "actor_role", "on_behalf_of", "request_id"]) assert.ok(!(c in fallback), `${c} is not sent`);
    assert.deepEqual(fallback.metadata.actor, { kind: "agent", id: "agent:renewal-agent", label: "renewal-agent agent", role: null, on_behalf_of: "ana@club.com" });
    assert.equal(fallback.metadata.x, 1);
  }
});

test("any other database error is reported, not hidden by the fallback", async () => {
  const sb = fakeSb([{ error: { code: "P0001", message: "an audit entry needs an actor" } }]);
  const r = await insertAudit(sb, T, { actor: userActor(user), entity_type: "x", action: "x.y" });
  assert.deepEqual([r.ok, r.error], [false, "an audit entry needs an actor"]);
  assert.equal(sb.inserted.length, 1);
});
