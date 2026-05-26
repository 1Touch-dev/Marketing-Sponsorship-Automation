"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/components/ui/toaster";
import { FileCheck2, RotateCcw, CheckCircle2, XCircle, AlertCircle, Edit3 } from "lucide-react";
import Link from "next/link";
import type { ProposalStatus } from "@/types/database";

export function ApprovalPanel({ proposalId, status }: { proposalId: string; status: ProposalStatus }) {
  const router = useRouter();
  const { toast } = useToast();
  const [comments, setComments] = useState("");
  const [busy, setBusy] = useState<string | null>(null);

  const isContract = status === "active_contract";
  const isRejected = status === "rejected";
  const isClosed = isContract || isRejected;

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
      const labels: Record<string, string> = {
        approve: "Proposal approved ✓",
        reject: "Proposal rejected",
        request_revision: "Revision requested — proposal sent back for editing",
      };
      toast({ variant: "success", title: labels[decision] });
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

  // "Revision requested" — proposal goes back to draft for editing
  if (status === "revision_requested") {
    return (
      <Card className="border-amber-200 bg-amber-50 dark:bg-amber-950/20 dark:border-amber-800">
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2 text-amber-800 dark:text-amber-300">
            <AlertCircle className="h-4 w-4" /> Revision Requested
          </CardTitle>
          <CardDescription className="text-amber-700 dark:text-amber-400">
            The reviewer has requested changes. Edit the proposal, then re-submit for review.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-2 sm:flex-row">
          <Button size="sm" className="gap-2" asChild>
            <Link href={`/proposals/${proposalId}/edit`}>
              <Edit3 className="h-3.5 w-3.5" /> Edit Proposal
            </Link>
          </Button>
          <Button
            size="sm"
            variant="outline"
            className="gap-2"
            disabled={!!busy}
            onClick={async () => {
              setBusy("resubmit");
              try {
                const res = await fetch(`/api/proposals/${proposalId}/approve`, {
                  method: "POST",
                  headers: { "content-type": "application/json" },
                  body: JSON.stringify({ decision: "submit_review" }),
                });
                const j = await res.json();
                if (!res.ok) throw new Error(j?.error ?? "Failed");
                toast({ variant: "success", title: "Re-submitted for review" });
                router.refresh();
              } catch (err) {
                toast({ variant: "destructive", title: String(err) });
              } finally { setBusy(null); }
            }}
          >
            <RotateCcw className="h-3.5 w-3.5" />
            {busy === "resubmit" ? "Submitting…" : "Re-submit for Review"}
          </Button>
        </CardContent>
      </Card>
    );
  }

  if (isContract) {
    return (
      <Card className="border-green-200 bg-green-50 dark:bg-green-950/20 dark:border-green-800">
        <CardContent className="flex items-center gap-3 pt-4">
          <FileCheck2 className="h-5 w-5 text-green-600 shrink-0" />
          <div>
            <p className="text-sm font-semibold text-green-800 dark:text-green-300">Active / In Contract</p>
            <p className="text-xs text-green-600 dark:text-green-400 mt-0.5">Sponsorship deal is signed and active.</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (isRejected) {
    return (
      <Card className="border-red-200 bg-red-50 dark:bg-red-950/20 dark:border-red-800">
        <CardContent className="flex items-center gap-3 pt-4">
          <XCircle className="h-5 w-5 text-red-500 shrink-0" />
          <div>
            <p className="text-sm font-semibold text-red-700 dark:text-red-300">Rejected</p>
            <p className="text-xs text-red-500 mt-0.5">
              You can still{" "}
              <Link href={`/proposals/${proposalId}/edit`} className="underline font-medium">
                edit the proposal
              </Link>{" "}
              and re-submit if needed.
            </p>
          </div>
        </CardContent>
      </Card>
    );
  }

  const canReview = !isClosed && status === "under_review";
  const isSent = status === "sent";

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <CheckCircle2 className="h-4 w-4 text-primary" />
          Review
        </CardTitle>
        <CardDescription>
          {status === "draft"
            ? "Submit for review when the proposal is ready."
            : status === "under_review"
            ? "Approve, request revision, or reject."
            : status === "approved" || isSent
            ? "Approved. Mark as Active/In Contract when the deal is signed."
            : "Review this proposal."}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {canReview && (
          <>
            <Textarea
              rows={3}
              placeholder="Optional comments for the sender…"
              value={comments}
              onChange={(e) => setComments(e.target.value)}
            />
            <div className="grid grid-cols-3 gap-2">
              <Button size="sm" className="gap-1" onClick={() => submit("approve")} disabled={!!busy}>
                <CheckCircle2 className="h-3.5 w-3.5" />
                {busy === "approve" ? "…" : "Approve"}
              </Button>
              <Button size="sm" variant="outline" className="gap-1" onClick={() => submit("request_revision")} disabled={!!busy}>
                <RotateCcw className="h-3.5 w-3.5" />
                {busy === "request_revision" ? "…" : "Revision"}
              </Button>
              <Button size="sm" variant="destructive" className="gap-1" onClick={() => submit("reject")} disabled={!!busy}>
                <XCircle className="h-3.5 w-3.5" />
                {busy === "reject" ? "…" : "Reject"}
              </Button>
            </div>
          </>
        )}

        {(status === "approved" || isSent) && (
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

        {status === "draft" && (
          <p className="text-xs text-muted-foreground">Submit for review from the flow panel above.</p>
        )}
      </CardContent>
    </Card>
  );
}
