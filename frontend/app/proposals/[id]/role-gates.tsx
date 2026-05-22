"use client";

import { RoleGate } from "@/components/auth/role-gate";
import type { ReactNode } from "react";

/** Wraps content that only approvers/admins can interact with */
export function ApprovalRoleGate({ children }: { children: ReactNode }) {
  return (
    <RoleGate
      permission="approve_proposal"
      softBlock
      fallback={null}
    >
      {children}
    </RoleGate>
  );
}

/** Wraps content that only sales reps/admins can interact with */
export function SalesRoleGate({ children }: { children: ReactNode }) {
  return (
    <RoleGate
      permission="create_proposal"
      softBlock
      fallback={null}
    >
      {children}
    </RoleGate>
  );
}
