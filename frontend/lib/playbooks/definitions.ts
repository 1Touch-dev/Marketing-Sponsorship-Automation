/**
 * Outreach playbooks (Task 13).
 *
 * A first touch does not have to be a sales pitch. Three playbooks are
 * relationship-first (a conversation, an invitation, an introduction): no
 * proposal, no price, no link. The fourth, "pitch", is the commercial email
 * written from an approved proposal.
 *
 * Defaults follow what a person has decided, not what an agent guessed: an
 * account nobody has qualified gets a relationship-first first touch.
 */

import type { AccountStage } from "../accounts/stage";

export const PLAYBOOK_IDS = ["conversation", "invitation", "introduction", "pitch"] as const;
export type PlaybookId = (typeof PLAYBOOK_IDS)[number];

export interface PlaybookDef {
  id: PlaybookId;
  label: string;
  description: string;
  relationshipFirst: boolean;
  /** A pitch is written from an approved proposal; the others have none. */
  requiresProposal: boolean;
  /** A person must supply the facts (the event, the topic); the model must not invent them. */
  requiresDetail: boolean;
}

export const PLAYBOOKS: Record<PlaybookId, PlaybookDef> = {
  conversation: {
    id: "conversation",
    label: "Start a conversation",
    description: "A short, human note that asks one genuine question about their goals. No proposal, no price.",
    relationshipFirst: true,
    requiresProposal: false,
    requiresDetail: false,
  },
  invitation: {
    id: "invitation",
    label: "Invite them",
    description: "An invitation to a match, a visit or an event. No sales ask, no proposal, no price.",
    relationshipFirst: true,
    requiresProposal: false,
    requiresDetail: true,
  },
  introduction: {
    id: "introduction",
    label: "Introduce the club's work",
    description: "Introduce something the club does that may matter to them (a programme, a community project). No ask beyond 'happy to share more'.",
    relationshipFirst: true,
    requiresProposal: false,
    requiresDetail: true,
  },
  pitch: {
    id: "pitch",
    label: "Commercial pitch",
    description: "The sponsorship pitch email, written from an approved proposal, with the proposal link.",
    relationshipFirst: false,
    requiresProposal: true,
    requiresDetail: false,
  },
};

export const RELATIONSHIP_PLAYBOOKS = PLAYBOOK_IDS.filter((p) => PLAYBOOKS[p].relationshipFirst);

export type OutreachActor = { kind: "human"; email: string } | { kind: "agent"; name: string };

export interface Recommendation {
  playbook: PlaybookId;
  reason: string;
}

/**
 * What to send, absent a choice. A first touch to an account nobody has
 * qualified is relationship-first; once a person has qualified it, or it has
 * already been contacted, the commercial pitch is the default.
 */
export function defaultPlaybook(input: { stage: AccountStage; firstTouch: boolean; hasApprovedProposal: boolean }): Recommendation {
  if (input.firstTouch && input.stage !== "qualified") {
    return { playbook: "conversation", reason: "This is the first contact and nobody has qualified the account yet, so start with a conversation." };
  }
  if (input.hasApprovedProposal) {
    return { playbook: "pitch", reason: input.firstTouch ? "A person has qualified the account and a proposal is approved." : "The account has been contacted before and a proposal is approved." };
  }
  return { playbook: "conversation", reason: "There is no approved proposal to pitch yet." };
}

export interface PlaybookCheck {
  allowed: boolean;
  /** Why it was refused. */
  reason?: string;
  /** Set when a person used a pitch although the default would have been relationship-first. */
  note?: string;
}

/** The rules for using a playbook. Relationship-first playbooks are always open; a pitch has conditions. */
export function checkPlaybook(input: {
  playbook: PlaybookId;
  stage: AccountStage;
  firstTouch: boolean;
  hasApprovedProposal: boolean;
  detail?: string | null;
  actor: OutreachActor;
}): PlaybookCheck {
  const def = PLAYBOOKS[input.playbook];
  if (!def) return { allowed: false, reason: `Unknown playbook. Choose one of ${PLAYBOOK_IDS.join(", ")}.` };

  if (def.requiresDetail && !(input.detail && input.detail.trim().length >= 5)) {
    return {
      allowed: false,
      reason: input.playbook === "invitation"
        ? "An invitation needs the event details (what, when, where). A person has to supply them; the model does not invent invitations."
        : "An introduction needs the topic: what is the club's work you want to introduce?",
    };
  }
  if (def.requiresProposal && !input.hasApprovedProposal) {
    return { allowed: false, reason: "A pitch is written from an approved proposal, and this account has none. Use a relationship-first playbook." };
  }
  if (input.playbook === "pitch" && input.actor.kind === "agent" && input.stage !== "qualified") {
    return { allowed: false, reason: "An agent cannot pitch an account that no person has qualified. Use a relationship-first playbook, or have a person qualify the account." };
  }
  if (input.playbook === "pitch" && input.actor.kind === "human" && input.firstTouch && input.stage !== "qualified") {
    return { allowed: true, note: `Pitch chosen by ${input.actor.email} as the first contact, although the account is not qualified and the default was a conversation.` };
  }
  return { allowed: true };
}
