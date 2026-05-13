"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import type { ProposalStatus } from "@/types/database";

export function ApprovalPanel({ proposalId, status }: { proposalId: string; status: ProposalStatus }) {
  const router = useRouter();
  const [comments, setComments] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const disabled = status === "approved" || status === "rejected" || status === "sent";

  async function submit(decision: "approve" | "reject" | "request_revision") {
    setBusy(decision);
    setError(null);
    try {
      const res = await fetch(`/api/proposals/${proposalId}/approve`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ decision, comments: comments || undefined }),
      });
      const j = await res.json();
      if (!res.ok) throw new Error(j?.error ?? `Failed (${res.status})`);
      setComments("");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed");
    } finally {
      setBusy(null);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Review</CardTitle>
        <CardDescription>
          {disabled ? "This proposal is closed for review." : "Approve, request revision, or reject."}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <Textarea
          rows={3}
          placeholder="Optional comments…"
          value={comments}
          onChange={(e) => setComments(e.target.value)}
          disabled={disabled}
        />
        <div className="grid grid-cols-3 gap-2">
          <Button size="sm" onClick={() => submit("approve")} disabled={disabled || !!busy}>
            {busy === "approve" ? "…" : "Approve"}
          </Button>
          <Button size="sm" variant="outline" onClick={() => submit("request_revision")} disabled={disabled || !!busy}>
            {busy === "request_revision" ? "…" : "Revise"}
          </Button>
          <Button size="sm" variant="destructive" onClick={() => submit("reject")} disabled={disabled || !!busy}>
            {busy === "reject" ? "…" : "Reject"}
          </Button>
        </div>
        {error ? <div className="text-sm text-destructive">{error}</div> : null}
      </CardContent>
    </Card>
  );
}
