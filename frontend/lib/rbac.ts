/**
 * Central RBAC definitions.
 * Import these anywhere role/permission checks are needed instead of
 * hardcoding strings across the codebase.
 */

/** Mirrors the user_role postgres enum. */
export const ROLES = ["admin", "reviewer", "editor", "viewer"] as const;
export type Role = (typeof ROLES)[number];

/** Coarse-grained permissions used in API routes and UI. */
export const PERMISSIONS = {
  // Companies
  company_create: ["admin", "editor"],
  company_edit: ["admin", "editor"],
  company_delete: ["admin"],

  // Campaigns
  campaign_generate: ["admin", "editor"],
  campaign_archive: ["admin", "editor"],

  // Proposals
  proposal_generate: ["admin", "editor"],
  proposal_edit: ["admin", "editor", "reviewer"],
  proposal_delete: ["admin"],
  proposal_approve: ["admin", "reviewer"],
  proposal_reject: ["admin", "reviewer"],
  proposal_request_revision: ["admin", "reviewer"],
  proposal_duplicate: ["admin", "editor"],

  // Emails
  email_generate: ["admin", "editor"],
  email_send: ["admin", "reviewer"],
  email_approve: ["admin", "reviewer"],

  // Follow-ups
  followup_generate: ["admin", "editor", "reviewer"],

  // Audit
  audit_read: ["admin", "reviewer"],

  // Workflow events
  workflow_events_read: ["admin", "reviewer"],

  // Settings / admin
  settings_write: ["admin"],
  user_manage: ["admin"],
} as const satisfies Record<string, readonly Role[]>;

export type Permission = keyof typeof PERMISSIONS;

/**
 * Returns true when the given role has the requested permission.
 * Pass `null` / `undefined` to simulate an unauthenticated user (always false).
 */
export function can(role: Role | null | undefined, permission: Permission): boolean {
  if (!role) return false;
  return (PERMISSIONS[permission] as readonly string[]).includes(role);
}

/**
 * Throws a 403-shaped error if the role cannot perform the action.
 * Use inside API route handlers.
 *
 * @example
 *   const role = await resolveRole(req); // your helper
 *   assertCan(role, "proposal_approve");
 */
export function assertCan(role: Role | null | undefined, permission: Permission): void {
  if (!can(role, permission)) {
    throw new RbacError(
      `Role "${role ?? "unauthenticated"}" is not permitted to perform "${permission}".`,
    );
  }
}

export class RbacError extends Error {
  readonly status = 403;
  constructor(message: string) {
    super(message);
    this.name = "RbacError";
  }
}

/**
 * Convenience: return the role from a public.users row fetched via supabaseAdmin.
 * Returns null when the user is not found (caller must decide what to do).
 */
export function extractRole(
  row: { role?: string | null } | null | undefined,
): Role | null {
  if (!row?.role) return null;
  return ROLES.includes(row.role as Role) ? (row.role as Role) : null;
}
