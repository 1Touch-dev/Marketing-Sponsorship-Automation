"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/components/ui/toaster";
import { FileCheck2 } from "lucide-react";
import type { ProposalStatus } from "@/types/database";

export function ApprovalPanel({ proposalId, status }: { proposalId: string; status: ProposalStatus }) {
  const router = useRouter();
  const { toast } = useToast();
  const [comments, setComments] = useState("");
  const [busy, setBusy] = useState<string | null>(null);

  const isContract = status === "active_contract";
  const disabled = status === "approved" || status === "rejected" || status === "sent" || isContract;

  async function submit(decision: "approve" | "reject" | "request_revision") {
    setBusy(decision);
    try {
      const res = await fetch(`/api/proposals/${proposalId}/approve`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ decision, comments: comments || undefined }),
      });
      const j = await res.json();
      if (!res.ok) throw new Error(j?.error ?? `Failed (${res.status})`);
      toast({
        variant: "success",
        title: `Proposal ${decision === "approve" ? "approved" : decision === "reject" ? "rejected" : "revision requested"}`,
      });
      setComments("");
      router.refresh();
    } catch (err) {
      toast({ variant: "destructive", title: "Action failed", description: err instanceof Error ? err.message : "Unknown error" });
    } finally {
      setBusy(null);
    }
  }

  async function markAsContract() {
    setBusy("contract");
    try {
      const res = await fetch(`/api/proposals/${proposalId}/approve`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ decision: "active_contract", comments: comments || "Marked as Active / In Contract" }),
      });
      const j = await res.json();
      if (!res.ok) throw new Error(j?.error ?? `Failed (${res.status})`);
      toast({ variant: "success", title: "Marked as Active / In Contract 🎉" });
      router.refresh();
    } catch (err) {
      toast({ variant: "destructive", title: "Failed", description: err instanceof Error ? err.message : "Unknown error" });
    } finally {
      setBusy(null);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Review</CardTitle>
        <CardDescription>
          {isContract
            ? "This proposal is Active / In Contract."
            : disabled
            ? "This proposal is closed for review."
            : "Approve, request revision, or reject."}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {isContract ? (
          <div className="rounded-lg bg-green-50 border border-green-200 p-3 flex items-center gap-2">
            <FileCheck2 className="h-4 w-4 text-green-600 shrink-0" />
            <div>
              <p className="text-sm font-semibold text-green-800">Active / In Contract</p>
              <p className="text-xs text-green-600 mt-0.5">Sponsorship deal is signed and active.</p>
            </div>
          </div>
        ) : (
          <>
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
            {/* Mark as contract when approved or sent */}
            {(status === "approved" || status === "sent") && (
              <Button
                size="sm"
                className="w-full gap-2 bg-green-700 hover:bg-green-800 text-white"
                onClick={markAsContract}
                disabled={!!busy}
              >
                <FileCheck2 className="h-4 w-4" />
                {busy === "contract" ? "Updating…" : "Mark as Active / In Contract 🎉"}
              </Button>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}
