"use client";

import * as React from "react";
import { useUserRole } from "@/lib/auth/use-user-role";
import { can, type Permission } from "@/lib/auth/roles";

interface RoleGateProps {
  permission: Permission;
  /** If true, renders children but visually disables and shows a tooltip */
  softBlock?: boolean;
  fallback?: React.ReactNode;
  children: React.ReactNode;
}

/**
 * Renders children only when the current user has the required permission.
 * With softBlock=true the content is shown but grayed out with an explanatory
 * tooltip instead of being hidden entirely.
 */
export function RoleGate({ permission, softBlock = false, fallback, children }: RoleGateProps) {
  const { role, loading } = useUserRole();

  if (loading) return null;

  const allowed = can(role, permission);

  if (allowed) return <>{children}</>;

  if (softBlock) {
    return (
      <div
        className="relative opacity-40 pointer-events-none select-none"
        title={`Your role (${role ?? "unknown"}) does not have permission to: ${permission.replace(/_/g, " ")}`}
      >
        {children}
        <div className="absolute inset-0 cursor-not-allowed" />
      </div>
    );
  }

  return fallback ? <>{fallback}</> : null;
}
