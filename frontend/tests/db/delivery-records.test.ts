import assert from "node:assert/strict";
import test from "node:test";
import { freshDb, refusal } from "./harness";
import { pgClient } from "../helpers/pg-from";
import { acceptedProofs, currentProofEvent, safeFileName, sniffContentType } from "../../lib/delivery/proof";
import { acceptAsSponsor, currentSponsorAcceptances } from "../../lib/delivery/sponsor-accept";
import { groupByMatch, loadMatchLinks, loadMatches, setObligationMatch } from "../../lib/delivery/match";
import { imageLogoStatus, isPrivateAddress, isSafeLogoUrl, listLogoVersions, logoVersionFields } from "../../lib/delivery/logo-versions";
import { internalKeys, sponsorObligation } from "../../lib/portal/safe-view";

const T1 = "00000000-0000-0000-0000-000000000001";
const T2 = "00000000-0000-0000-0000-000000000002";
const A = "a0000000-0000-4000-8000-00000000000a";
const B = "b0000000-0000-4000-8000-00000000000b";

const seed = `
  INSERT INTO public.tenants (id, name) VALUES ('${T2}', 'Second club');
  ALTER TABLE public.companies ADD COLUMN logo_url text, ADD COLUMN logo_source text;
  CREATE TABLE public.matches (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), match_date date NOT NULL, opponent text NOT NULL, competition text, home_away text NOT NULL DEFAULT 'home');
  ALTER TABLE public.obligations ADD COLUMN contract_id uuid, ADD COLUMN kind text DEFAULT 'deliverable', ADD COLUMN quantity int, ADD COLUMN unit text, ADD COLUMN due_date date DEFAULT '2026-12-01';
  CREATE TABLE public.obligation_events (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id uuid NOT NULL, obligation_id uuid NOT NULL REFERENCES public.obligations(id) ON DELETE CASCADE,
    event_type text NOT NULL, evidence_kind text, evidence_ref text, note text, reason text, actor_email text NOT NULL, created_at timestamptz NOT NULL DEFAULT clock_timestamp());
  CREATE TABLE public.image_generation_jobs (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id uuid NOT NULL, company_id uuid, proposal_id uuid, job_type text, display_label text, status text DEFAULT 'completed', created_at timestamptz DEFAULT now());
  INSERT INTO public.companies (id, tenant_id, company_name, logo_url, logo_source) VALUES ('${A}', '${T1}', 'Sponsor A', 'https://a.example/logo-1.png', 'logo_dev'), ('${B}', '${T1}', 'Sponsor B', NULL, NULL);
`;

async function world() {
  const db = await freshDb(["0074_delivery_records.sql"], { seed });
  const sb = pgClient(db);
  const q = async <T = any>(sql: string, params: unknown[] = []) => (await db.query(sql, params)).rows as T[];
  const obligation = async (company = A, tenant = T1, title = "LED boards") => (await q<{ id: string }>("INSERT INTO public.obligations (tenant_id, company_id, title) VALUES ($1, $2, $3) RETURNING id", [tenant, company, title]))[0].id;
  const event = async (obligationId: string, type: string, by = "staff@club.com", kind: string | null = null, ref: string | null = null) =>
    (await q<{ id: string }>("INSERT INTO public.obligation_events (tenant_id, obligation_id, event_type, evidence_kind, evidence_ref, actor_email) VALUES ($1, $2, $3, $4, $5, $6) RETURNING id", [T1, obligationId, type, kind, ref, by]))[0].id;
  const file = async (obligationId: string, company = A) =>
    (await q<{ id: string }>("INSERT INTO public.obligation_proof_files (tenant_id, obligation_id, company_id, storage_path, file_name, size_bytes, sha256, content_type, uploaded_by) VALUES ($1, $2, $3, $4, 'photo.png', 1000, $5, 'image/png', 'staff@club.com') RETURNING id", [T1, obligationId, company, `p/${Math.random()}`, "a".repeat(64)]))[0].id;
  /** delivered, proof given, accepted by a second person */
  const accepted = async (kind: "link" | "statement" | "file" = "link", ref = "https://club.com/proof/1") => {
    const o = await obligation();
    await event(o, "delivered");
    const ref2 = kind === "file" ? await file(o) : ref;
    const proof = await event(o, "evidenced", "staff@club.com", kind, ref2);
    await event(o, "accepted", "checker@club.com");
    return { o, proof, ref: ref2 };
  };
  return { db, sb, q, obligation, event, file, accepted };
}

// ── logo versions ───────────────────────────────────────────────────────────

test("every logo change is kept as the next version, whichever route made it, and old ones stay", async () => {
  const w = await world();
  // the logo that was already there when the migration ran is version 1
  assert.deepEqual((await listLogoVersions(w.sb, T1, A)).map((v) => [v.version_number, v.logo_url]), [[1, "https://a.example/logo-1.png"]]);
  await w.q("UPDATE public.companies SET logo_url = 'https://a.example/logo-2.png', logo_source = 'manual_upload' WHERE id = $1", [A]);
  await w.q("UPDATE public.companies SET company_name = 'Sponsor A Ltd' WHERE id = $1", [A]);                  // not a logo change
  await w.q("UPDATE public.companies SET logo_url = 'https://a.example/logo-2.png' WHERE id = $1", [A]);       // same logo again
  await w.q("UPDATE public.companies SET logo_url = NULL WHERE id = $1", [A]);                                  // removed: nothing to record
  await w.q("UPDATE public.companies SET logo_url = 'https://a.example/logo-3.png' WHERE id = $1", [A]);
  const versions = await listLogoVersions(w.sb, T1, A);
  assert.deepEqual(versions.map((v) => [v.version_number, v.logo_url]), [[3, "https://a.example/logo-3.png"], [2, "https://a.example/logo-2.png"], [1, "https://a.example/logo-1.png"]]);
  assert.equal(versions.find((v) => v.version_number === 2)?.source, "manual_upload");
  // a new company with a logo starts at 1; one with none has none
  assert.equal((await listLogoVersions(w.sb, T1, B)).length, 0);
  await w.q("UPDATE public.companies SET logo_url = 'https://b.example/b.png' WHERE id = $1", [B]);
  assert.equal((await listLogoVersions(w.sb, T1, B)).length, 1);
});

test("a logo version cannot be rewritten or removed; only its archive details are filled in, once", async () => {
  const w = await world();
  const [v] = await w.q<{ id: string }>("SELECT id FROM public.company_logo_versions WHERE company_id = $1", [A]);
  assert.match(await refusal(w.db, "UPDATE public.company_logo_versions SET logo_url = 'https://evil.example/x.png' WHERE id = $1", [v.id]), /record of what was used/);
  assert.match(await refusal(w.db, "DELETE FROM public.company_logo_versions WHERE id = $1", [v.id]), /cannot be deleted/);
  await w.q("UPDATE public.company_logo_versions SET stored_path = 'logos/a/v1.png', sha256 = $2, archived_at = now() WHERE id = $1", [v.id, "b".repeat(64)]);
  assert.match(await refusal(w.db, "UPDATE public.company_logo_versions SET stored_path = 'logos/a/other.png' WHERE id = $1", [v.id]), /record of what was used/);
  assert.match(await refusal(w.db, "UPDATE public.company_logo_versions SET sha256 = $2 WHERE id = $1", [v.id, "c".repeat(64)]), /record of what was used/);
  // deleting the company takes its versions with it
  await w.q("DELETE FROM public.companies WHERE id = $1", [A]);
  assert.equal((await w.q("SELECT 1 FROM public.company_logo_versions WHERE company_id = $1", [A])).length, 0);
});

test("images made from a replaced logo are flagged out of date; ones made from the current logo are not; old ones are unknown", async () => {
  const w = await world();
  const v1 = (await logoVersionFields(w.sb, T1, A, "https://a.example/logo-1.png")).source_logo_version_id;
  assert.ok(v1);
  assert.deepEqual(await logoVersionFields(w.sb, T1, A, "https://not-ours.example/x.png"), {}, "a logo that was not one of ours records nothing");
  assert.deepEqual(await logoVersionFields(w.sb, T1, null, "https://a.example/logo-1.png"), {});
  const job = (label: string, version: string | null, status = "completed") =>
    w.q("INSERT INTO public.image_generation_jobs (tenant_id, company_id, job_type, display_label, status, source_logo_version_id) VALUES ($1, $2, 'jersey_mockup_official', $3, $4, $5)", [T1, A, label, status, version]);
  await job("made from v1", v1 as string);
  await job("made before versions existed", null);
  await w.q("UPDATE public.companies SET logo_url = 'https://a.example/logo-2.png' WHERE id = $1", [A]);
  const v2 = (await logoVersionFields(w.sb, T1, A, "https://a.example/logo-2.png")).source_logo_version_id as string;
  await job("made from v2", v2);
  await job("rejected one", v1 as string, "rejected");
  const status = await imageLogoStatus(w.sb, T1, A);
  assert.ok(status.ok);
  assert.equal(status.value.current_version, 2);
  assert.deepEqual(status.value.stale.map((s) => [s.display_label, s.used_version]), [["made from v1", 1]]);
  assert.equal(status.value.current, 1);
  assert.equal(status.value.unknown, 1);
});

test("a logo address inside our own network is never fetched", async () => {
  for (const ip of ["127.0.0.1", "10.1.2.3", "192.168.0.5", "172.20.0.1", "169.254.169.254", "::1", "fd00::1"]) assert.equal(isPrivateAddress(ip), true, ip);
  for (const ip of ["8.8.8.8", "142.250.1.1", "2606:4700::1111"]) assert.equal(isPrivateAddress(ip), false, ip);
  for (const url of ["http://localhost/x.png", "http://127.0.0.1/x.png", "http://169.254.169.254/latest/meta-data", "ftp://example.com/x.png", "file:///etc/passwd", "not a url", "http://service.internal/x.png"]) assert.equal(await isSafeLogoUrl(url), false, url);
  assert.equal(await isSafeLogoUrl("https://1.1.1.1/logo.png"), true);
});

// ── proof ───────────────────────────────────────────────────────────────────

test("a file is recognised by its bytes, not by what the client says, and its name is made safe", () => {
  assert.equal(sniffContentType(Buffer.from("%PDF-1.7 and more bytes"))?.ext, "pdf");
  assert.equal(sniffContentType(Buffer.concat([Buffer.from([0x89]), Buffer.from("PNG\r\n\x1a\n and more")]))?.ext, "png");
  assert.equal(sniffContentType(Buffer.from([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3, 4, 5, 6, 7, 8]))?.ext, "jpg");
  assert.equal(sniffContentType(Buffer.from("<html><script>alert(1)</script></html>")), null, "html is not accepted as proof");
  assert.equal(sniffContentType(Buffer.from("MZ\x90\x00\x03\x00\x00\x00\x04\x00\x00\x00\xff\xff")), null, "an executable is not accepted");
  assert.equal(safeFileName("../../etc/passwd.png", "png"), "passwd.png");
  assert.equal(safeFileName("Relatório final (v2).pdf", "pdf"), "Relatorio-final-v2.pdf");
  assert.equal(safeFileName("   ", "pdf"), "proof.pdf");
});

test("file proof has to be a file uploaded for that obligation, and stored files cannot be changed", async () => {
  const w = await world();
  const o = await w.obligation();
  const other = await w.obligation(A, T1, "Another item");
  await w.event(o, "delivered");
  assert.match(await refusal(w.db, "INSERT INTO public.obligation_events (tenant_id, obligation_id, event_type, evidence_kind, evidence_ref, actor_email) VALUES ($1, $2, 'evidenced', 'file', 'https://x.example/f.pdf', 'a@b.co')", [T1, o]), /uploaded for this obligation/);
  assert.match(await refusal(w.db, "INSERT INTO public.obligation_events (tenant_id, obligation_id, event_type, evidence_kind, evidence_ref, actor_email) VALUES ($1, $2, 'evidenced', 'file', $3, 'a@b.co')", [T1, o, "6d95718d-b22a-4d37-9215-989d212bf1ba"]), /uploaded for this obligation/);
  const f = await w.file(other);
  assert.match(await refusal(w.db, "INSERT INTO public.obligation_events (tenant_id, obligation_id, event_type, evidence_kind, evidence_ref, actor_email) VALUES ($1, $2, 'evidenced', 'file', $3, 'a@b.co')", [T1, o, f]), /uploaded for this obligation/, "another item's file will not do");
  const mine = await w.file(o);
  await w.event(o, "evidenced", "staff@club.com", "file", mine); // accepted
  assert.match(await refusal(w.db, "UPDATE public.obligation_proof_files SET sha256 = $2 WHERE id = $1", [mine, "d".repeat(64)]), /immutable/);
  assert.match(await refusal(w.db, "DELETE FROM public.obligation_proof_files WHERE id = $1", [mine]), /cannot be deleted/);
  // a file for the wrong sponsor's obligation is refused
  assert.match(await refusal(w.db, "INSERT INTO public.obligation_proof_files (tenant_id, obligation_id, company_id, storage_path, file_name, size_bytes, sha256, uploaded_by) VALUES ($1, $2, $3, 'p/x', 'f.png', 5, $4, 'a@b.co')", [T1, o, B, "a".repeat(64)]), /own club and sponsor/);
});

test("a sponsor is shown the accepted proof itself, and only once the club has accepted it", async () => {
  const w = await world();
  const link = await w.accepted("link", "https://club.com/photos/led.jpg");
  const stmt = await w.accepted("statement", "Shown on the LED in all 19 home games, confirmed by match operations");
  const file = await w.accepted("file");
  const unaccepted = await w.obligation(A, T1, "Not yet accepted");
  await w.event(unaccepted, "delivered"); await w.event(unaccepted, "evidenced", "staff@club.com", "link", "https://club.com/x");
  const jsLink = await w.obligation(A, T1, "Odd link");
  await w.event(jsLink, "delivered"); await w.event(jsLink, "evidenced", "staff@club.com", "link", "javascript:alert(1)");
  await w.event(jsLink, "accepted", "checker@club.com");

  const proofs = await acceptedProofs(w.sb, T1, [link.o, stmt.o, file.o, unaccepted, jsLink]);
  assert.equal(proofs.get(link.o)?.link, "https://club.com/photos/led.jpg");
  assert.equal(proofs.get(stmt.o)?.statement, "Shown on the LED in all 19 home games, confirmed by match operations");
  assert.deepEqual(proofs.get(file.o)?.file && { name: proofs.get(file.o)!.file!.name, size: proofs.get(file.o)!.file!.size_bytes }, { name: "photo.png", size: 1000 });
  assert.equal(proofs.has(unaccepted), false, "proof not yet accepted by the club is not shown");
  assert.equal(proofs.has(jsLink), false, "only a web address is ever handed out as a link");

  // reopened work shows nothing until it is proven and accepted again
  await w.event(link.o, "reopened", "boss@club.com");
  assert.equal((await acceptedProofs(w.sb, T1, [link.o])).has(link.o), false);

  // what goes to the sponsor carries none of the club's own words
  const shown = sponsorObligation({ id: link.o, title: "LED", status: "accepted", proof: "attached", proof_detail: { ...proofs.get(stmt.o), proof_event_id: stmt.proof, recorded_by: "staff@club.com" }, can_accept: true });
  assert.deepEqual(internalKeys(shown), []);
  assert.ok(!JSON.stringify(shown).includes("staff@club.com") && !JSON.stringify(shown).includes(stmt.proof), "no club person, no internal ids");
  assert.equal((shown.proof_detail as any).kind, "statement");
  assert.equal(sponsorObligation({ id: "x", status: "evidenced", proof_detail: proofs.get(stmt.o), can_accept: true }).proof_detail, null, "and nothing before the club has accepted");
  assert.equal(sponsorObligation({ id: "x", status: "evidenced", can_accept: true }).can_accept, false);
});

// ── sponsor acceptance ──────────────────────────────────────────────────────

test("a sponsor accepts the proof it was shown: recorded once, under its own contact, without changing the club's status", async () => {
  const w = await world();
  const a = await w.accepted();
  const first = await acceptAsSponsor(w.sb, { tenantId: T1, companyId: A, email: "Ana@A.com", obligationId: a.o, note: "  Looks right  " });
  assert.ok(first.ok && !first.value.already);
  assert.equal(first.ok && first.value.acceptance.accepted_by, "ana@a.com");
  assert.equal(first.ok && first.value.acceptance.note, "Looks right");
  const second = await acceptAsSponsor(w.sb, { tenantId: T1, companyId: A, email: "ana@a.com", obligationId: a.o });
  assert.ok(second.ok && second.value.already && second.value.acceptance.id === (first.ok && first.value.acceptance.id), "accepting twice is accepting once");
  assert.equal((await w.q("SELECT 1 FROM public.obligation_sponsor_acceptances")).length, 1);
  // the club's own ledger is untouched: no new event was written
  assert.deepEqual((await w.q<{ event_type: string }>("SELECT event_type FROM public.obligation_events WHERE obligation_id = $1 ORDER BY created_at", [a.o])).map((e) => e.event_type), ["delivered", "evidenced", "accepted"]);
  const current = await currentSponsorAcceptances(w.sb, T1, A, await acceptedProofs(w.sb, T1, [a.o]));
  assert.equal(current.get(a.o)?.accepted_by, "ana@a.com");
});

test("a sponsor cannot accept what is not theirs, not yet accepted by the club, or no longer current", async () => {
  const w = await world();
  const mine = await w.accepted();
  // another sponsor's item looks like one that does not exist
  const wrong = await acceptAsSponsor(w.sb, { tenantId: T1, companyId: B, email: "bob@b.com", obligationId: mine.o });
  assert.ok(!wrong.ok && wrong.status === 404);
  const missing = await acceptAsSponsor(w.sb, { tenantId: T1, companyId: A, email: "ana@a.com", obligationId: "6d95718d-b22a-4d37-9215-989d212bf1ba" });
  assert.ok(!missing.ok && missing.status === 404);
  // the club has not accepted it yet
  const early = await w.obligation(); await w.event(early, "delivered"); await w.event(early, "evidenced", "staff@club.com", "link", "https://club.com/p");
  const tooSoon = await acceptAsSponsor(w.sb, { tenantId: T1, companyId: A, email: "ana@a.com", obligationId: early });
  assert.ok(!tooSoon.ok && tooSoon.status === 409);
  // accepted, then the work is reopened and proven again: the earlier acceptance is of proof that has been replaced
  const ok = await acceptAsSponsor(w.sb, { tenantId: T1, companyId: A, email: "ana@a.com", obligationId: mine.o });
  assert.ok(ok.ok);
  await w.event(mine.o, "reopened", "boss@club.com");
  await w.event(mine.o, "delivered"); const newer = await w.event(mine.o, "evidenced", "staff@club.com", "link", "https://club.com/proof/2"); await w.event(mine.o, "accepted", "checker@club.com");
  const proofs = await acceptedProofs(w.sb, T1, [mine.o]);
  assert.equal(proofs.get(mine.o)?.proof_event_id, newer);
  assert.equal((await currentSponsorAcceptances(w.sb, T1, A, proofs)).size, 0, "the old acceptance does not carry over to new proof");
  const again = await acceptAsSponsor(w.sb, { tenantId: T1, companyId: A, email: "ana@a.com", obligationId: mine.o });
  assert.ok(again.ok && !again.value.already, "the new proof can be accepted");
});

test("the database refuses an acceptance of proof that is not current, or of an item that is not the sponsor's", async () => {
  const w = await world();
  const a = await w.accepted();
  const stale = a.proof;
  await w.event(a.o, "reopened", "boss@club.com"); await w.event(a.o, "delivered"); await w.event(a.o, "evidenced", "staff@club.com", "link", "https://club.com/proof/new");
  assert.match(await refusal(w.db, "INSERT INTO public.obligation_sponsor_acceptances (tenant_id, obligation_id, company_id, proof_event_id, accepted_by) VALUES ($1, $2, $3, $4, 'ana@a.com')", [T1, a.o, A, stale]), /no longer current/);
  assert.match(await refusal(w.db, "INSERT INTO public.obligation_sponsor_acceptances (tenant_id, obligation_id, company_id, proof_event_id, accepted_by) VALUES ($1, $2, $3, $4, 'bob@b.com')", [T1, a.o, B, stale]), /of its own/);
  const delivered = (await w.q<{ id: string }>("SELECT id FROM public.obligation_events WHERE obligation_id = $1 AND event_type = 'delivered' LIMIT 1", [a.o]))[0].id;
  assert.match(await refusal(w.db, "INSERT INTO public.obligation_sponsor_acceptances (tenant_id, obligation_id, company_id, proof_event_id, accepted_by) VALUES ($1, $2, $3, $4, 'ana@a.com')", [T1, a.o, A, delivered]), /accepting its proof/);
  // (the new proof is not accepted by the club yet, but the database only asks that it is the proof that stands)
  const current = (await w.q<{ id: string }>("SELECT id FROM public.obligation_events WHERE obligation_id = $1 AND event_type = 'evidenced' ORDER BY created_at DESC LIMIT 1", [a.o]))[0].id;
  assert.match(await refusal(w.db, "INSERT INTO public.obligation_sponsor_acceptances (tenant_id, obligation_id, company_id, proof_event_id, accepted_by) VALUES ($1, $2, $3, $4, 'Ana@A.com')", [T1, a.o, A, current]), /accepted_by/i, "the contact is stored in lower case");
});

test("an acceptance is a permanent record: it cannot be edited or deleted", async () => {
  const w = await world();
  const a = await w.accepted();
  const done = await acceptAsSponsor(w.sb, { tenantId: T1, companyId: A, email: "ana@a.com", obligationId: a.o });
  assert.ok(done.ok);
  const id = done.ok ? done.value.acceptance.id : "";
  assert.match(await refusal(w.db, "UPDATE public.obligation_sponsor_acceptances SET accepted_by = 'someone@else.com' WHERE id = $1", [id]), /immutable/);
  assert.match(await refusal(w.db, "DELETE FROM public.obligation_sponsor_acceptances WHERE id = $1", [id]), /cannot be deleted/);
});

// ── a match on an obligation ────────────────────────────────────────────────

test("work can be placed under a match and grouped by it, without moving any date", async () => {
  const w = await world();
  const [m1, m2] = [
    (await w.q<{ id: string }>("INSERT INTO public.matches (match_date, opponent, competition) VALUES ('2026-11-08', 'Athletico', 'Série B') RETURNING id"))[0].id,
    (await w.q<{ id: string }>("INSERT INTO public.matches (match_date, opponent, competition) VALUES ('2026-10-25', 'Paraná', 'Série B') RETURNING id"))[0].id,
  ];
  const [o1, o2, o3] = [await w.obligation(A, T1, "LED game 1"), await w.obligation(A, T1, "LED game 2"), await w.obligation(A, T1, "Season banner")];
  const before = (await w.q<{ id: string; due_date: string }>("SELECT id, due_date::text FROM public.obligations ORDER BY id"));
  assert.ok((await setObligationMatch(w.sb, T1, o1, m1)).ok);
  assert.ok((await setObligationMatch(w.sb, T1, o2, m2)).ok);
  const links = await loadMatchLinks(w.sb, T1, [o1, o2, o3]);
  assert.deepEqual([links.get(o1), links.get(o2), links.has(o3)], [m1, m2, false]);
  const groups = groupByMatch([o1, o2, o3].map((id) => ({ id, match_id: links.get(id) ?? null })), await loadMatches(w.sb, [m1, m2]));
  assert.deepEqual(groups.map((g) => g.match?.opponent ?? null), ["Paraná", "Athletico", null], "soonest match first, work with no match last");
  assert.deepEqual(before, await w.q("SELECT id, due_date::text FROM public.obligations ORDER BY id"), "no date moved");
  // taking it out again, and refusing a match that does not exist or an obligation of another club
  assert.ok((await setObligationMatch(w.sb, T1, o1, null)).ok);
  assert.equal((await loadMatchLinks(w.sb, T1, [o1])).has(o1), false);
  const nomatch = await setObligationMatch(w.sb, T1, o1, "6d95718d-b22a-4d37-9215-989d212bf1ba");
  assert.ok(!nomatch.ok && nomatch.status === 404);
  const foreign = await setObligationMatch(w.sb, T2, o1, m1);
  assert.ok(!foreign.ok && foreign.status === 404, "another club's obligation looks like one that does not exist");
});

test("the proof that stands is the last one given since the work was last reopened", () => {
  const e = (id: string, event_type: string, t: number) => ({ id, obligation_id: "o", event_type, evidence_kind: "link", evidence_ref: "https://x.co", created_at: new Date(1_000_000 + t).toISOString() }) as any;
  assert.equal(currentProofEvent([e("a", "evidenced", 1), e("b", "evidenced", 2)])?.id, "b");
  assert.equal(currentProofEvent([e("a", "evidenced", 1), e("r", "reopened", 2)]), null);
  assert.equal(currentProofEvent([e("a", "evidenced", 1), e("r", "reopened", 2), e("c", "evidenced", 3)])?.id, "c");
  assert.equal(currentProofEvent([]), null);
});
