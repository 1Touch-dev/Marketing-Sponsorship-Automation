/**
 * Who did it. Every audit entry and every governed action names an actor and the capacity they acted in:
 *
 *   human     a signed-in person doing ordinary work
 *   approver  a signed-in person making a decision that others rely on (approve, reject, accept, verify, issue)
 *   agent     an automated agent, with the person it acted for when there is one
 *   service   the platform itself: a scheduler, a webhook, a sync, an import
 *   external  someone outside with no login: an email recipient, a sponsor on a share link, a lead form
 *
 * The kinds are distinct on purpose: an agent never appears as the person who started it, and a service
 * never appears as a person. Pure functions only, so the rules can be tested without a database.
 */

export const ACTOR_KINDS = ["human", "approver", "agent", "service", "external"] as const;
export type ActorKind = (typeof ACTOR_KINDS)[number];

export interface Actor {
  kind: ActorKind;
  /** stable identifier: a user id, "agent:<name>", "service:<name>", "external:<key>" */
  id: string;
  /** what a person reads in the log */
  label: string;
  email?: string | null;
  /** the user's role at the time, for humans and approvers */
  role?: string | null;
  /** the person an agent or a service acted for, when there was one */
  onBehalfOf?: string | null;
  /** the platform_users id, when the actor is a person */
  userId?: string | null;
}

export interface UserLike { id: string; email: string; full_name?: string | null; role: string }

const clean = (s: string, max = 120) => s.replace(/[\r\n\t]+/g, " ").trim().slice(0, max);

export function userActor(user: UserLike): Actor {
  return { kind: "human", id: user.id, label: clean(user.full_name || user.email), email: user.email.toLowerCase(), role: user.role, userId: user.id };
}

export function agentActor(name: string, opts: { onBehalfOf?: string | null; version?: string | number | null; runId?: string | null } = {}): Actor {
  const n = clean(name, 60);
  if (!n) throw new Error("an agent actor needs the agent's name");
  const v = opts.version !== undefined && opts.version !== null ? `@v${opts.version}` : "";
  return { kind: "agent", id: `agent:${n}${v}`, label: `${n} agent${opts.runId ? ` (run ${clean(String(opts.runId), 40)})` : ""}`, onBehalfOf: opts.onBehalfOf ? opts.onBehalfOf.toLowerCase() : null };
}

export function serviceActor(name: string, opts: { onBehalfOf?: string | null } = {}): Actor {
  const n = clean(name, 60);
  if (!n) throw new Error("a service actor needs the service's name");
  return { kind: "service", id: `service:${n}`, label: n, onBehalfOf: opts.onBehalfOf ? opts.onBehalfOf.toLowerCase() : null };
}

export function externalActor(label: string, key?: string | null): Actor {
  const l = clean(label, 80);
  if (!l) throw new Error("an external actor needs a label");
  return { kind: "external", id: `external:${clean(key || l, 100)}`, label: l };
}

/** Roles that may make decisions others rely on. */
export const APPROVER_ROLES = ["admin", "approver"] as const;
export const canActAsApprover = (role: string | null | undefined) => !!role && (APPROVER_ROLES as readonly string[]).includes(role);

/**
 * Actions that are decisions: approving, rejecting, sending back, verifying, accepting, issuing. A person
 * who is allowed to decide, and does, is recorded as an approver, not as an ordinary user.
 */
const DECISION = /(^|[._])(approve|approved|reject|rejected|revision_requested|request_revision|verify|verified|accept|accepted|issued|decided)([._]|$)/;
export const isDecisionAction = (action: string) => DECISION.test(action);

/** The actor as it will be recorded for this action. */
export function finalizeActor(actor: Actor, action: string): Actor {
  if (actor.kind === "human" && isDecisionAction(action) && canActAsApprover(actor.role)) return { ...actor, kind: "approver" };
  return actor;
}

/** What is wrong with an actor, if anything. */
export function actorProblems(a: Actor | null | undefined): string[] {
  if (!a) return ["an actor is required"];
  const p: string[] = [];
  if (!(ACTOR_KINDS as readonly string[]).includes(a.kind)) p.push(`actor kind must be one of ${ACTOR_KINDS.join(", ")}`);
  if (!a.id || !a.id.trim()) p.push("an actor needs an id");
  if (!a.label || !a.label.trim()) p.push("an actor needs a label");
  if ((a.kind === "human" || a.kind === "approver") && !a.userId && !a.email) p.push("a person needs a user id or an email");
  if (a.kind === "agent" && !a.id.startsWith("agent:")) p.push("an agent id starts with agent:");
  if (a.kind === "service" && !a.id.startsWith("service:")) p.push("a service id starts with service:");
  if (a.kind === "external" && !a.id.startsWith("external:")) p.push("an external id starts with external:");
  return p;
}

/**
 * The actor behind an unattended call that proved it holds the internal secret (a scheduler, n8n, a webhook).
 * The caller may say which service it is with the x-service-name header; it is only a label, never a permission.
 */
export function internalActor(req: Request): Actor {
  const claimed = req.headers.get("x-service-name");
  return serviceActor(claimed && /^[A-Za-z0-9 _.:-]{2,60}$/.test(claimed) ? claimed : "internal-api");
}

/** A person known only by what a caller passed along (an id and/or an email), when the full user is not at hand. */
export function personActor(p: { id?: string | null; email?: string | null; role?: string | null; name?: string | null }): Actor | null {
  const email = p.email ? p.email.toLowerCase() : null;
  if (!p.id && !email) return null;
  return { kind: "human", id: p.id || `user:${email}`, label: clean(p.name || email || String(p.id)), email, role: p.role ?? null, userId: p.id ?? null };
}

/**
 * For routes open both to a signed-in person and to an unattended caller holding the internal secret:
 * the person if there is one, otherwise the service that called.
 */
export function userOrService(user: UserLike | null | undefined, req: Request, serviceName?: string | null): Actor {
  if (user) return userActor(user);
  const named = serviceName && /^[A-Za-z0-9 _.:-]{2,60}$/.test(serviceName) ? serviceActor(serviceName) : null;
  return named ?? internalActor(req);
}
