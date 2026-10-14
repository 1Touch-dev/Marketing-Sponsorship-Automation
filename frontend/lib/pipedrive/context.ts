import type { Authorization, Basis } from "../integrations/log";
import type { PushContext } from "./adapter";

/**
 * Builds the context a push needs: the database, the club, and who is answerable for it. A person for anything a person did
 * (approving, pressing sync, creating a company); an agent or a named service for what ran on its own.
 */
export type Who = { kind: Authorization["kind"]; by: string };

export const person = (email: string): Who => ({ kind: "human", by: email });
export const agent = (name: string): Who => ({ kind: "agent", by: name });
export const service = (name: string): Who => ({ kind: "service", by: name });

export function pushContext(sb: unknown, tenantId: string, who: Who, basis: Basis, ref?: string | null): PushContext {
  return { sb, tenantId, auth: { kind: who.kind, by: who.by, basis, ref: ref ?? null } };
}
