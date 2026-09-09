/**
 * Role-based access control for the Coritiba FC Sponsorship Platform.
 *
 * Roles (least → most privilege):
 *   viewer     – read-only access to proposals and dashboard
 *   approver   – can approve / reject / send proposals; cannot create or edit
 *   sales_rep  – can create and manage everything; cannot approve
 *   admin      – full access including user management
 */

export type UserRole = "admin" | "sales_rep" | "approver" | "viewer";

export interface PlatformUser {
  id: string;
  email: string;
  full_name: string;
  role: UserRole;
  is_active: boolean;
  invited_by?: string | null;
  last_seen_at?: string | null;
  created_at: string;
  updated_at: string;
}

// --------------------------------------------------------------------------
// Permission matrix
// --------------------------------------------------------------------------

const PERMISSIONS = {
  // Content creation
  create_company:    ["admin", "sales_rep"] as UserRole[],
  edit_company:      ["admin", "sales_rep"] as UserRole[],
  delete_company:    ["admin"] as UserRole[],
  run_intelligence:  ["admin", "sales_rep"] as UserRole[],
  create_campaign:   ["admin", "sales_rep"] as UserRole[],
  create_proposal:   ["admin", "sales_rep"] as UserRole[],
  edit_proposal:     ["admin", "sales_rep"] as UserRole[],
  delete_proposal:   ["admin"] as UserRole[],
  submit_proposal:   ["admin", "sales_rep"] as UserRole[],

  // Sponsorship inventory (Coritiba's own sellable assets — pricing,
  // quantities, availability) — structural configuration, admin-only.
  manage_inventory:  ["admin"] as UserRole[],
  // Match schedule + per-match media-reach numbers — the exact figures
  // shown on the sponsor-facing ROI dashboard (Phase 5). Routine data
  // entry after each match, so sales_rep can do it too, but it directly
  // affects what a real sponsor is shown as proof of value.
  manage_matches:    ["admin", "sales_rep"] as UserRole[],
  // Email/proposal templates, email sequences, and warm-up (CRM
  // relationship-sequencing) config — reusable content/workflow setup,
  // distinct from editing one specific proposal/email.
  manage_templates:  ["admin", "sales_rep"] as UserRole[],

  // Approval flow
  approve_proposal:  ["admin", "approver"] as UserRole[],
  reject_proposal:   ["admin", "approver"] as UserRole[],
  send_proposal:     ["admin", "approver"] as UserRole[],

  // Media
  generate_images:   ["admin", "sales_rep"] as UserRole[],
  manage_mockups:    ["admin", "sales_rep"] as UserRole[],

  // System
  manage_users:      ["admin"] as UserRole[],
  manage_integrations: ["admin"] as UserRole[],
  view_audit:        ["admin", "approver"] as UserRole[],
} as const;

export type Permission = keyof typeof PERMISSIONS;

export function can(role: UserRole | null | undefined, permission: Permission): boolean {
  if (!role) return false;
  return (PERMISSIONS[permission] as readonly string[]).includes(role);
}

export function roleLabel(role: UserRole): string {
  const labels: Record<UserRole, string> = {
    admin:     "Admin",
    sales_rep: "Sales Rep",
    approver:  "Approver",
    viewer:    "Viewer",
  };
  return labels[role] ?? role;
}

export function roleColor(role: UserRole): string {
  const colors: Record<UserRole, string> = {
    admin:     "bg-red-100 text-red-800",
    sales_rep: "bg-blue-100 text-blue-800",
    approver:  "bg-green-100 text-green-800",
    viewer:    "bg-gray-100 text-gray-700",
  };
  return colors[role] ?? "bg-gray-100 text-gray-700";
}
