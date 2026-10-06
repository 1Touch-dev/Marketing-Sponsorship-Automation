import assert from "node:assert/strict";
import test from "node:test";
import { canVerifyClaim, deriveProof, verifyRevisions, type Evidence } from "../lib/contracts/proof";
import { buildQuoteLines, revisionChecksum } from "../lib/proposals/revisions";

let n = 0;
const ev = (evidence_type: Evidence["evidence_type"], source: Evidence["source"], extra: Partial<Evidence> = {}): Evidence => ({
  id: `e${++n}`, evidence_type, source, occurred_at: `2026-10-06T10:${String(n).padStart(2, "0")}:00Z`, ...extra,
});
const bound = () => ev("revision_bound", "platform", { revision_checksum: "abc" });

test("no evidence at all says so, and a frozen revision alone is only 'terms frozen'", () => {
  const none = deriveProof({ evidence: [], requiredSigners: [] });
  assert.deepEqual([none.stage, none.evidenceLevel, none.verified], ["no_evidence", "none", false]);
  const frozen = deriveProof({ evidence: [bound()], requiredSigners: [] });
  assert.deepEqual([frozen.stage, frozen.verified], ["terms_frozen", false]);
});

test("'marked active' is only a claim: no signature evidence is flagged as a gap", () => {
  const v = deriveProof({ evidence: [bound(), ev("activation_claimed", "manual", { actor_user_id: "u1" })], requiredSigners: [] });
  assert.deepEqual([v.stage, v.evidenceLevel, v.verified], ["activated_unverified", "claimed", false]);
  assert.ok(v.gaps.some((g) => /no signature evidence/i.test(g)));
});

test("provider proof needs the completed envelope; one signer is only partial", () => {
  const sent = [ev("signer_sent", "provider", { signer_email: "a@x.com" }), ev("signer_sent", "provider", { signer_email: "b@x.com" })];
  assert.equal(deriveProof({ evidence: [bound(), ...sent], requiredSigners: ["a@x.com", "b@x.com"] }).stage, "sent_for_signature");
  const one = deriveProof({ evidence: [bound(), ...sent, ev("signer_signed", "provider", { signer_email: "a@x.com" })], requiredSigners: ["a@x.com", "b@x.com"] });
  assert.deepEqual([one.stage, one.verified, one.signedBy], ["partially_signed", false, ["a@x.com"]]);
  const all = [bound(), ...sent, ev("signer_signed", "provider", { signer_email: "a@x.com" }), ev("signer_signed", "provider", { signer_email: "b@x.com" }), ev("envelope_completed", "provider")];
  const done = deriveProof({ evidence: all, requiredSigners: ["a@x.com", "b@x.com"] });
  assert.deepEqual([done.stage, done.evidenceLevel, done.verified], ["signed", "provider_verified", true]);
  assert.ok(done.gaps.some((g) => /signed document was not stored/i.test(g)));
  const withDoc = deriveProof({ evidence: [...all, ev("signed_document", "provider", { document_sha256: "h" })], requiredSigners: ["a@x.com", "b@x.com"] });
  assert.equal(withDoc.gaps.some((g) => /not stored/i.test(g)), false);
});

test("a provider that completes the envelope while signers are missing is trusted but flagged", () => {
  const v = deriveProof({ evidence: [bound(), ev("signer_signed", "provider", { signer_email: "a@x.com" }), ev("envelope_completed", "provider")], requiredSigners: ["a@x.com", "b@x.com"] });
  assert.equal(v.stage, "signed");
  assert.ok(v.gaps.some((g) => /not every required signer/i.test(g)));
});

test("manual signature: a claim alone is not proof; a different person verifying it is", () => {
  const claim = ev("manual_signature_claim", "manual", { actor_user_id: "u1", document_sha256: "doc-hash" });
  const claimed = deriveProof({ evidence: [bound(), claim], requiredSigners: [] });
  assert.deepEqual([claimed.stage, claimed.evidenceLevel, claimed.verified], ["signature_claimed", "claimed", false]);
  assert.ok(claimed.gaps.some((g) => /second person/i.test(g)));
  const verified = deriveProof({ evidence: [bound(), claim, ev("manual_verification", "manual", { actor_user_id: "u2", references_evidence_id: claim.id })], requiredSigners: [] });
  assert.deepEqual([verified.stage, verified.evidenceLevel, verified.verified], ["signed", "manually_verified", true]);
});

test("the same person verifying their own claim does not count", () => {
  const claim = ev("manual_signature_claim", "manual", { actor_user_id: "u1", document_sha256: "h" });
  const v = deriveProof({ evidence: [claim, ev("manual_verification", "manual", { actor_user_id: "u1", references_evidence_id: claim.id })], requiredSigners: [] });
  assert.equal(v.verified, false);
  assert.equal(v.stage, "signature_claimed");
  assert.ok(v.gaps.some((g) => /same person/i.test(g)));
  assert.equal(canVerifyClaim({ actor_user_id: "u1" }, "u1"), false);
  assert.equal(canVerifyClaim({ actor_user_id: "u1" }, "u2"), true);
  assert.equal(canVerifyClaim({ actor_user_id: null }, "u2"), false);
});

test("a claim with no signed document can never be verified; a rejected claim is void", () => {
  const noDoc = ev("manual_signature_claim", "manual", { actor_user_id: "u1" });
  const v = deriveProof({ evidence: [noDoc, ev("manual_verification", "manual", { actor_user_id: "u2", references_evidence_id: noDoc.id })], requiredSigners: [] });
  assert.equal(v.verified, false);
  assert.ok(v.gaps.some((g) => /no signed document/i.test(g)));
  const claim = ev("manual_signature_claim", "manual", { actor_user_id: "u1", document_sha256: "h" });
  const rejected = deriveProof({ evidence: [bound(), claim, ev("manual_rejection", "manual", { actor_user_id: "u2", references_evidence_id: claim.id })], requiredSigners: [] });
  assert.equal(rejected.stage, "terms_frozen");
});

test("declined and cancelled", () => {
  assert.equal(deriveProof({ evidence: [bound(), ev("signer_declined", "provider", { signer_email: "a@x.com" })], requiredSigners: ["a@x.com"] }).stage, "declined");
  assert.equal(deriveProof({ evidence: [bound()], requiredSigners: [], contractStatus: "cancelled" }).stage, "cancelled");
});

test("a contract with evidence but no bound revision is flagged", () => {
  const v = deriveProof({ evidence: [ev("activation_claimed", "manual", { actor_user_id: "u1" })], requiredSigners: [] });
  assert.ok(v.gaps.some((g) => /not bound to a frozen revision/i.test(g)));
});

test("revision integrity: untouched passes, any tamper is caught, old rows are 'cannot recompute'", () => {
  const lines = buildQuoteLines([{ id: "l1", inventory_id: "i1", quantity: 1, scope: "per_season", price_agreed: 1000 }]);
  const content = { executive_summary: "S", deliverables: ["x"] };
  const checksum = revisionChecksum({ title: "T", content, lines });
  const ok = verifyRevisions([{ revision_number: 1, title: "T", content, lines, checksum }]);
  assert.equal(ok[0].intact, true);
  const price = verifyRevisions([{ revision_number: 1, title: "T", content, lines: buildQuoteLines([{ id: "l1", inventory_id: "i1", quantity: 1, scope: "per_season", price_agreed: 1 }]), checksum }]);
  assert.equal(price[0].intact, false);
  const text = verifyRevisions([{ revision_number: 1, title: "T", content: { ...content, executive_summary: "edited" }, lines, checksum }]);
  assert.equal(text[0].intact, false);
  const title = verifyRevisions([{ revision_number: 1, title: "Other", content, lines, checksum }]);
  assert.equal(title[0].intact, false);
  assert.equal(verifyRevisions([{ revision_number: 1, title: null, content, lines, checksum }])[0].intact, null);
});
