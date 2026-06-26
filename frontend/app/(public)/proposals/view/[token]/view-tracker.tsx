"use client";
import { useEffect } from "react";

export function ViewTracker({
  proposalId,
  token,
  variant = "A",
}: {
  proposalId: string;
  token: string;
  variant?: "A" | "B";
}) {
  useEffect(() => {
    fetch(
      `/api/proposals/${proposalId}/track-view?token=${token}&variant=${variant}`,
      { method: "POST" }
    ).catch(() => {});
  }, [proposalId, token, variant]);
  return null;
}
