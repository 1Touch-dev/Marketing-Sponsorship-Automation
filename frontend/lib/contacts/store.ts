import { isMissingMigration } from "../proposals/revision-store";
import type { WriteResult } from "../accounts/store";
import {
  CHANNELS, CONTACT_ROLES, SUPPRESSION_REASONS, evaluateRecipient, isAuthorized, latest, normalizeEmail, rolesAsOf,
  type AuthorizationRow, type Block, type Channel, type ChannelCheckRow, type ContactRole, type RecipientVerdict, type RoleRow,
  type SuppressionReason, type SuppressionRow,
} from "./model";

type Sb = any;

const notSetUp = "Contact standing is not set up yet (migration 0062).";
const today = () => new Date().toISOString().slice(0, 10);

// ── can this recipient be contacted? ────────────────────────────────────────

export interface RecipientCheck extends RecipientVerdict {
  /** False when migration 0062 is not applied: nothing can be recorded yet, so nothing is blocked. */
  enforced: boolean;
}

async function companyOfEmail(sb: Sb, tenantId: string, email: string): Promise<string | null> {
  const { data } = await sb.from("contacts").select("company_id").eq("tenant_id", tenantId).ilike("email", email).not("company_id", "is", null).limit(1).maybeSingle();
  return (data?.company_id as string | undefined) ?? null;
}

/**
 * The one question every send and every draft asks first. A failure to read the
 * ledgers closes the gate: not being able to check never counts as permission.
 */
export async function checkRecipient(sb: Sb, tenantId: string, input: { email: string; companyId?: string | null }): Promise<RecipientCheck> {
  const email = normalizeEmail(input.email);
  const companyId = input.companyId ?? (await companyOfEmail(sb, tenantId, email));

  const [byEmail, byCompany, checks] = await Promise.all([
    sb.from("contact_suppressions").select("decision, reason_code, note, actor_kind, actor, source, created_at").eq("tenant_id", tenantId).eq("subject_kind", "email").eq("email", email),
    companyId
      ? sb.from("contact_suppressions").select("decision, reason_code, note, actor_kind, actor, source, created_at").eq("tenant_id", tenantId).eq("subject_kind", "company").eq("company_id", companyId)
      : Promise.resolve({ data: [], error: null }),
    sb.from("contact_channel_checks").select("outcome, method, checked_by, created_at").eq("tenant_id", tenantId).eq("channel", "email").ilike("value", email),
  ]);

  for (const r of [byEmail, byCompany, checks]) {
    if (r.error) {
      if (isMissingMigration(r.error)) return { allowed: true, enforced: false, blocks: [], warnings: [], channel: "unverified" };
      return { allowed: false, enforced: true, blocks: [{ code: "check_failed", message: `Could not check whether ${email} may be contacted (${r.error.message}).` }], warnings: [], channel: "unverified" };
    }
  }
  return { ...evaluateRecipient({ emailRows: (byEmail.data ?? []) as SuppressionRow[], companyRows: (byCompany.data ?? []) as SuppressionRow[], channelChecks: (checks.data ?? []) as ChannelCheckRow[] }), enforced: true };
}

// ── do not contact ──────────────────────────────────────────────────────────

export type SuppressionActor = { kind: "human"; email: string } | { kind: "system"; name: string };

export async function recordSuppression(
  sb: Sb,
  tenantId: string,
  input: { email?: string | null; companyId?: string | null; decision: "suppressed" | "lifted"; reasonCode: SuppressionReason; note?: string | null; actor: SuppressionActor; source?: string },
): Promise<WriteResult<{ id: string | null; already: boolean }>> {
  const hasEmail = !!input.email?.trim();
  if (hasEmail === !!input.companyId) return { ok: false, status: 400, error: "Give exactly one of an email address or a company." };
  if (!SUPPRESSION_REASONS.includes(input.reasonCode)) return { ok: false, status: 400, error: `reason_code must be one of ${SUPPRESSION_REASONS.join(", ")}` };
  if (input.decision === "lifted") {
    if (input.actor.kind !== "human") return { ok: false, status: 403, error: "Only a person can lift a do-not-contact." };
    if (!input.note || input.note.trim().length < 5) return { ok: false, status: 400, error: "Say why it is being lifted (at least a short reason)." };
  }
  if (input.actor.kind === "human" && !input.actor.email) return { ok: false, status: 403, error: "A signed-in person is required." };

  const email = hasEmail ? normalizeEmail(input.email as string) : null;
  if (email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return { ok: false, status: 400, error: "That is not a valid email address." };
  if (input.companyId) {
    const { data: c } = await sb.from("companies").select("id").eq("id", input.companyId).eq("tenant_id", tenantId).maybeSingle();
    if (!c) return { ok: false, status: 404, error: "Company not found" };
  }

  let q = sb.from("contact_suppressions").select("decision, created_at").eq("tenant_id", tenantId);
  q = email ? q.eq("subject_kind", "email").eq("email", email) : q.eq("subject_kind", "company").eq("company_id", input.companyId);
  const { data: history, error: hErr } = await q;
  if (hErr) return { ok: false, status: isMissingMigration(hErr) ? 503 : 500, error: isMissingMigration(hErr) ? notSetUp : hErr.message };
  const current = latest((history ?? []) as Array<{ decision: string; created_at: string }>)?.decision === "suppressed";

  if (input.decision === "suppressed" && current) return { ok: true, value: { id: null, already: true } }; // idempotent
  if (input.decision === "lifted" && !current) return { ok: false, status: 409, error: "That is not currently on the do-not-contact list." };

  const { data, error } = await sb
    .from("contact_suppressions")
    .insert({
      tenant_id: tenantId,
      subject_kind: email ? "email" : "company",
      email,
      company_id: email ? null : input.companyId,
      decision: input.decision,
      reason_code: input.reasonCode,
      note: input.note?.trim() || null,
      actor_kind: input.actor.kind,
      actor: input.actor.kind === "human" ? input.actor.email : input.actor.name,
      source: input.source ?? "manual",
    })
    .select("id")
    .single();
  if (error) return { ok: false, status: 500, error: error.message };
  return { ok: true, value: { id: data.id, already: false } };
}

export interface CurrentSuppression { subject_kind: "email" | "company"; email: string | null; company_id: string | null; company_name: string | null; reason_code: string; note: string | null; actor: string; actor_kind: string; source: string; since: string }

/** Everyone and every company currently on the do-not-contact list. */
export async function listCurrentSuppressions(sb: Sb, tenantId: string): Promise<WriteResult<CurrentSuppression[]>> {
  const { data, error } = await sb.from("contact_suppressions").select("subject_kind, email, company_id, decision, reason_code, note, actor_kind, actor, source, created_at").eq("tenant_id", tenantId).order("created_at", { ascending: false }).limit(5000);
  if (error) return { ok: false, status: isMissingMigration(error) ? 503 : 500, error: isMissingMigration(error) ? notSetUp : error.message };
  const newest = new Map<string, any>();
  for (const r of data ?? []) { const k = r.subject_kind === "email" ? `e:${r.email}` : `c:${r.company_id}`; if (!newest.has(k)) newest.set(k, r); }
  const live = Array.from(newest.values()).filter((r) => r.decision === "suppressed");
  const ids = live.filter((r) => r.company_id).map((r) => r.company_id as string);
  const names = new Map<string, string>();
  if (ids.length) { const { data: cs } = await sb.from("companies").select("id, company_name").in("id", ids.slice(0, 200)); for (const c of cs ?? []) names.set(c.id, c.company_name); }
  return { ok: true, value: live.map((r) => ({ subject_kind: r.subject_kind, email: r.email, company_id: r.company_id, company_name: r.company_id ? names.get(r.company_id) ?? null : null, reason_code: r.reason_code, note: r.note, actor: r.actor, actor_kind: r.actor_kind, source: r.source, since: r.created_at })) };
}

// ── channel checks ──────────────────────────────────────────────────────────

export async function recordChannelCheck(
  sb: Sb,
  tenantId: string,
  input: { contactId?: string | null; channel: Channel; value: string; outcome: "verified" | "bounced" | "invalid"; method: "person" | "delivery_event" | "enrichment"; checkedBy: string; note?: string | null },
): Promise<WriteResult<{ id: string }>> {
  if (!CHANNELS.includes(input.channel)) return { ok: false, status: 400, error: `channel must be one of ${CHANNELS.join(", ")}` };
  if (!input.value?.trim()) return { ok: false, status: 400, error: "value is required" };
  if (input.method === "person" && !input.checkedBy) return { ok: false, status: 403, error: "A signed-in person is required." };
  const value = input.channel === "email" ? normalizeEmail(input.value) : input.value.trim();
  const { data, error } = await sb.from("contact_channel_checks").insert({ tenant_id: tenantId, contact_id: input.contactId ?? null, channel: input.channel, value, outcome: input.outcome, method: input.method, checked_by: input.checkedBy || "system", note: input.note ?? null }).select("id").single();
  if (error) return { ok: false, status: isMissingMigration(error) ? 503 : 500, error: isMissingMigration(error) ? notSetUp : error.message };
  return { ok: true, value: { id: data.id } };
}

// ── roles ───────────────────────────────────────────────────────────────────

const ROLE_COLUMNS = "id, role, started_on, ended_on, note, assigned_by, ended_by, end_reason, company_id";

export async function loadRoles(sb: Sb, tenantId: string, contactId: string): Promise<WriteResult<{ current: RoleRow[]; history: RoleRow[] }>> {
  const { data, error } = await sb.from("contact_roles").select(ROLE_COLUMNS).eq("tenant_id", tenantId).eq("contact_id", contactId);
  if (error) return { ok: false, status: isMissingMigration(error) ? 503 : 500, error: isMissingMigration(error) ? notSetUp : error.message };
  return { ok: true, value: rolesAsOf((data ?? []) as RoleRow[], today()) };
}

export async function assignRole(sb: Sb, tenantId: string, contactId: string, input: { role: ContactRole; startedOn?: string | null; note?: string | null; by: string }): Promise<WriteResult<{ id: string }>> {
  if (!CONTACT_ROLES.includes(input.role)) return { ok: false, status: 400, error: `role must be one of ${CONTACT_ROLES.join(", ")}` };
  if (!input.by) return { ok: false, status: 403, error: "A signed-in person is required." };
  const { data: contact } = await sb.from("contacts").select("id, company_id").eq("id", contactId).eq("tenant_id", tenantId).maybeSingle();
  if (!contact) return { ok: false, status: 404, error: "Contact not found" };
  const roles = await loadRoles(sb, tenantId, contactId);
  if (!roles.ok) return roles;
  if (roles.value.current.some((r) => r.role === input.role)) return { ok: false, status: 409, error: `This contact already holds the ${input.role.replace("_", " ")} role. End it first if it is changing.` };
  const { data, error } = await sb.from("contact_roles").insert({ tenant_id: tenantId, contact_id: contactId, company_id: contact.company_id ?? null, role: input.role, started_on: input.startedOn || today(), note: input.note?.trim() || null, assigned_by: input.by }).select("id").single();
  if (error) return { ok: false, status: 500, error: error.message };
  return { ok: true, value: { id: data.id } };
}

export async function endRole(sb: Sb, tenantId: string, contactId: string, roleId: string, input: { endedOn?: string | null; reason: string; by: string }): Promise<WriteResult<{ id: string }>> {
  if (!input.by) return { ok: false, status: 403, error: "A signed-in person is required." };
  if (!input.reason || input.reason.trim().length < 3) return { ok: false, status: 400, error: "Say why the role ended (for example: left the company, changed team)." };
  const { data, error } = await sb.from("contact_roles").update({ ended_on: input.endedOn || today(), ended_by: input.by, end_reason: input.reason.trim() }).eq("id", roleId).eq("contact_id", contactId).eq("tenant_id", tenantId).is("ended_on", null).select("id").maybeSingle();
  if (error) return { ok: false, status: isMissingMigration(error) ? 503 : 400, error: isMissingMigration(error) ? notSetUp : error.message };
  if (!data) return { ok: false, status: 404, error: "No open role with that id for this contact." };
  return { ok: true, value: { id: data.id } };
}

/** For a company: its contacts and the roles each holds now. */
export async function companyRoles(sb: Sb, tenantId: string, companyId: string): Promise<WriteResult<Array<{ contact_id: string; full_name: string | null; email: string; title: string | null; roles: ContactRole[] }>>> {
  const { data: contacts, error } = await sb.from("contacts").select("id, full_name, email, title").eq("tenant_id", tenantId).eq("company_id", companyId);
  if (error) return { ok: false, status: 500, error: error.message };
  const ids = (contacts ?? []).map((c: any) => c.id);
  const { data: rows, error: rErr } = ids.length ? await sb.from("contact_roles").select(ROLE_COLUMNS + ", contact_id").eq("tenant_id", tenantId).in("contact_id", ids) : { data: [], error: null };
  if (rErr) return { ok: false, status: isMissingMigration(rErr) ? 503 : 500, error: isMissingMigration(rErr) ? notSetUp : rErr.message };
  return { ok: true, value: (contacts ?? []).map((c: any) => ({ contact_id: c.id, full_name: c.full_name, email: c.email, title: c.title, roles: rolesAsOf(((rows ?? []) as any[]).filter((r) => r.contact_id === c.id), today()).current.map((r) => r.role) })) };
}

// ── authorized senders ──────────────────────────────────────────────────────

export interface SenderAuth { authorized: boolean; enforced: boolean }

export async function senderAuthorization(sb: Sb, tenantId: string, memberId: string): Promise<SenderAuth> {
  const { data, error } = await sb.from("sender_authorizations").select("decision, created_at").eq("tenant_id", tenantId).eq("team_member_id", memberId);
  if (error) return isMissingMigration(error) ? { authorized: true, enforced: false } : { authorized: false, enforced: true };
  return { authorized: isAuthorized((data ?? []) as AuthorizationRow[]), enforced: true };
}

export async function setSenderAuthorization(sb: Sb, tenantId: string, memberId: string, input: { decision: "granted" | "revoked"; reason: string; actorEmail: string }): Promise<WriteResult<{ id: string }>> {
  if (!input.actorEmail) return { ok: false, status: 403, error: "A signed-in person has to grant or revoke this." };
  if (!input.reason || input.reason.trim().length < 5) return { ok: false, status: 400, error: "A reason is required." };
  const { data: member } = await sb.from("team_members").select("id, active").eq("id", memberId).eq("tenant_id", tenantId).maybeSingle();
  if (!member) return { ok: false, status: 404, error: "Team member not found" };
  if (input.decision === "granted" && !member.active) return { ok: false, status: 409, error: "This team member is not active." };
  const now = await senderAuthorization(sb, tenantId, memberId);
  if (!now.enforced) return { ok: false, status: 503, error: notSetUp };
  if (input.decision === "granted" && now.authorized) return { ok: false, status: 409, error: "Already authorized." };
  if (input.decision === "revoked" && !now.authorized) return { ok: false, status: 409, error: "Not currently authorized." };
  const { data, error } = await sb.from("sender_authorizations").insert({ tenant_id: tenantId, team_member_id: memberId, decision: input.decision, actor_kind: "human", actor: input.actorEmail, reason: input.reason.trim() }).select("id").single();
  if (error) return { ok: false, status: 500, error: error.message };
  return { ok: true, value: { id: data.id } };
}

export async function listSenders(sb: Sb, tenantId: string): Promise<WriteResult<Array<{ id: string; full_name: string; title: string | null; email: string; active: boolean; authorized: boolean; last_decision: { decision: string; actor: string; reason: string; at: string } | null }>>> {
  const [{ data: members, error }, { data: auths, error: aErr }] = await Promise.all([
    sb.from("team_members").select("id, full_name, title, email, active").eq("tenant_id", tenantId).order("full_name"),
    sb.from("sender_authorizations").select("team_member_id, decision, actor, reason, created_at").eq("tenant_id", tenantId).order("created_at", { ascending: false }),
  ]);
  if (error) return { ok: false, status: 500, error: error.message };
  if (aErr) return { ok: false, status: isMissingMigration(aErr) ? 503 : 500, error: isMissingMigration(aErr) ? notSetUp : aErr.message };
  return { ok: true, value: (members ?? []).map((m: any) => { const last = (auths ?? []).find((a: any) => a.team_member_id === m.id) ?? null; return { ...m, authorized: last?.decision === "granted", last_decision: last ? { decision: last.decision, actor: last.actor, reason: last.reason, at: last.created_at } : null }; }) };
}

// ── the send gate ───────────────────────────────────────────────────────────

export interface SendCheck { allowed: boolean; blocks: Block[]; warnings: string[]; enforced: boolean }

/** Everything that must be true before an email goes out: the recipient may be contacted, and whoever it is signed as is still authorized. */
export async function checkSend(sb: Sb, tenantId: string, email: { recipient: string; company_id?: string | null; proposal_id?: string | null; sender_member_id?: string | null }): Promise<SendCheck> {
  let companyId = email.company_id ?? null;
  if (!companyId && email.proposal_id) {
    const { data: p } = await sb.from("proposals").select("company_id").eq("id", email.proposal_id).eq("tenant_id", tenantId).maybeSingle();
    companyId = (p?.company_id as string | undefined) ?? null;
  }
  const recipient = await checkRecipient(sb, tenantId, { email: email.recipient, companyId });
  const blocks = [...recipient.blocks];
  let enforced = recipient.enforced;
  if (email.sender_member_id) {
    const auth = await senderAuthorization(sb, tenantId, email.sender_member_id);
    enforced = enforced || auth.enforced;
    if (!auth.authorized) blocks.push({ code: "sender_not_authorized", message: "The team member this email is signed as is no longer authorized to send. Draft it again, or have an admin authorize them." });
  }
  return { allowed: blocks.length === 0, blocks, warnings: recipient.warnings, enforced };
}

/** Records which team member an email is signed as. Best effort: before migration 0062 it does nothing. */
export async function stampSigner(sb: Sb, tenantId: string, emailId: string, memberId: string | null): Promise<void> {
  if (!memberId) return;
  try {
    await sb.from("emails").update({ sender_member_id: memberId }).eq("id", emailId).eq("tenant_id", tenantId);
  } catch {
    /* the email is saved; the stamp is a record */
  }
}

/**
 * For a list of addresses (a newsletter): who may be contacted, and who is left out and why.
 * Loads the ledgers once instead of once per address.
 */
export async function filterRecipients(sb: Sb, tenantId: string, emails: string[]): Promise<{ allowed: string[]; skipped: Array<{ email: string; reason: string }>; enforced: boolean }> {
  const list = Array.from(new Set(emails.map(normalizeEmail)));
  const [sup, chk, ctc] = await Promise.all([
    sb.from("contact_suppressions").select("subject_kind, email, company_id, decision, reason_code, note, actor_kind, actor, source, created_at").eq("tenant_id", tenantId).limit(10000),
    sb.from("contact_channel_checks").select("value, outcome, method, checked_by, created_at").eq("tenant_id", tenantId).eq("channel", "email").limit(10000),
    sb.from("contacts").select("email, company_id").eq("tenant_id", tenantId).limit(10000),
  ]);
  for (const r of [sup, chk]) {
    if (r.error) {
      if (isMissingMigration(r.error)) return { allowed: list, skipped: [], enforced: false };
      return { allowed: [], skipped: list.map((email) => ({ email, reason: "could not be checked" })), enforced: true };
    }
  }
  const companyOf = new Map<string, string | null>(((ctc.data ?? []) as Array<{ email: string; company_id: string | null }>).map((c) => [normalizeEmail(c.email), c.company_id]));
  const allowed: string[] = [];
  const skipped: Array<{ email: string; reason: string }> = [];
  for (const email of list) {
    const companyId = companyOf.get(email) ?? null;
    const v = evaluateRecipient({
      emailRows: ((sup.data ?? []) as any[]).filter((r) => r.subject_kind === "email" && r.email === email),
      companyRows: companyId ? ((sup.data ?? []) as any[]).filter((r) => r.subject_kind === "company" && r.company_id === companyId) : [],
      channelChecks: ((chk.data ?? []) as any[]).filter((r) => normalizeEmail(r.value) === email),
    });
    if (v.allowed) allowed.push(email);
    else skipped.push({ email, reason: v.blocks[0].message });
  }
  return { allowed, skipped, enforced: true };
}
