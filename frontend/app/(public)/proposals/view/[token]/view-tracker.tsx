"use client";
import { useEffect } from "react";

export function ViewTracker({ proposalId, token }: { proposalId: string; token: string }) {
  useEffect(() => {
    fetch(`/api/proposals/${proposalId}/track-view?token=${token}`, { method: "POST" }).catch(() => {});
  }, [proposalId, token]);
  return null;
}
