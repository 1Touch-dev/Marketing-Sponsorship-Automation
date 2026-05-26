"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toaster";
import {
  CheckCircle2, Circle, ArrowRight, Image, Send, FileCheck2,
  Loader2, ExternalLink, Zap, RotateCcw, Edit3, AlertCircle, XCircle
} from "lucide-react";
import Link from "next/link";

type FlowStep = "draft" | "review" | "revision" | "approved" | "images" | "landing" | "contract";

interface ApprovalFlowPanelProps {
  proposalId: string;
  proposalStatus: string;
  shareToken: string | null;
  hasImages: boolean;
}

function StepDot({
  done,
  active,
  warning,
  rejected,
  label,
  icon: Icon,
}: {
  done: boolean;
  active: boolean;
  warning?: boolean;
  rejected?: boolean;
  label: string;
  icon: React.ElementType;
}) {
  const base = "h-9 w-9 rounded-full flex items-center justify-center border-2 transition-all";
  const style = done
    ? `${base} bg-emerald-500 border-emerald-500 text-white`
    : warning
    ? `${base} bg-amber-400 border-amber-400 text-white`
    : rejected
    ? `${base} bg-red-400 border-red-400 text-white`
    : active
    ? `${base} bg-white border-indigo-500 text-indigo-600`
    : `${base} bg-slate-50 border-slate-200 text-slate-400`;

  const labelStyle = done
    ? "text-emerald-600"
    : warning
    ? "text-amber-600"
    : rejected
    ? "text-red-500"
    : active
    ? "text-indigo-600"
    : "text-slate-400";

  return (
    <div className="flex flex-col items-center gap-1.5 z-10">
      <div className={style}>
        {done ? <CheckCircle2 className="h-4.5 w-4.5" /> : warning ? <AlertCircle className="h-4 w-4" /> : rejected ? <XCircle className="h-4 w-4" /> : <Icon className="h-4 w-4" />}
      </div>
      <span className={`text-[10px] font-medium text-center leading-tight ${labelStyle}`}>{label}</span>
    </div>
  );
}

export function ApprovalFlowPanel({
  proposalId,
  proposalStatus,
  shareToken,
  hasImages,
}: ApprovalFlowPanelProps) {
  const router = useRouter();
  const { toast } = useToast();
  const [busy, setBusy] = useState<string | null>(null);

  const isDraft = proposalStatus === "draft";
  const isUnderReview = proposalStatus === "under_review";
  const isRevision = proposalStatus === "revision_requested";
  const isApproved = proposalStatus === "approved";
  const isSent = proposalStatus === "sent";
  const isContract = proposalStatus === "active_contract";
  const isRejected = proposalStatus === "rejected";

  // Step completion
  const stepDraft = true;
  const stepReview = isUnderReview || isRevision || isApproved || isSent || isContract || isRejected;
  const stepApproved = isApproved || isSent || isContract;
  const stepImages = stepApproved && hasImages;
  const stepLanding = !!shareToken;
  const stepContract = isContract;

  const allDone = stepContract;

  // Status label
  const statusMap: Record<string, { label: string; color: string }> = {
    draft: { label: "Draft", color: "bg-slate-100 text-slate-600" },
    under_review: { label: "Under Review", color: "bg-blue-100 text-blue-700" },
    revision_requested: { label: "Revision Requested", color: "bg-amber-100 text-amber-700" },
    approved: { label: "Approved", color: "bg-emerald-100 text-emerald-700" },
    sent: { label: "Sent", color: "bg-indigo-100 text-indigo-700" },
    rejected: { label: "Rejected", color: "bg-red-100 text-red-600" },
    active_contract: { label: "Active / In Contract 🎉", color: "bg-green-100 text-green-800" },
  };
  const statusInfo = statusMap[proposalStatus] ?? statusMap.draft;

  async function call(decision: string) {
    setBusy(decision);
    try {
      const res = await fetch(`/api/proposals/${proposalId}/approve`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ decision }),
      });
      const j = await res.json();
      if (!res.ok) throw new Error(j?.error ?? "Failed");
      const labels: Record<string, string> = {
        submit_review: "Submitted for review",
        approve: "Proposal approved — ready for image generation",
      };
      toast({ variant: "success", title: labels[decision] ?? "Done" });
      router.refresh();
    } catch (e) {
      toast({ variant: "destructive", title: String(e) });
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="rounded-xl border border-slate-200 bg-white dark:bg-slate-900 dark:border-slate-700 overflow-hidden">
      <div className="px-5 py-3 border-b border-slate-100 dark:border-slate-800 flex items-center gap-2">
        <FileCheck2 className="h-4 w-4 text-slate-600 dark:text-slate-400" />
        <span className="text-sm font-semibold text-slate-800 dark:text-slate-200">Proposal Flow</span>
        <span className={`ml-auto text-xs font-semibold px-2 py-0.5 rounded-full ${statusInfo.color}`}>
          {statusInfo.label}
        </span>
      </div>

      {/* Step indicators */}
      <div className="px-4 py-4">
        <div className="flex items-start justify-between relative">
          <div className="absolute top-4 left-[8%] right-[8%] h-0.5 bg-slate-100 dark:bg-slate-800 z-0" />
          <StepDot done={stepDraft} active={isDraft} label="Draft" icon={Circle} />
          <StepDot done={stepReview && !isRevision && !isRejected} active={isUnderReview} warning={isRevision} rejected={isRejected} label="Review" icon={ArrowRight} />
          <StepDot done={stepApproved} active={isApproved && !hasImages} label="Approved" icon={FileCheck2} />
          <StepDot done={stepImages} active={isApproved && !hasImages && false} label="Images" icon={Image} />
          <StepDot done={stepContract} active={isApproved && hasImages && !!shareToken} label="Contract" icon={Send} />
        </div>
      </div>

      {/* Context-sensitive action area */}
      <div className="px-5 pb-4 space-y-2">

        {/* DRAFT — submit for review */}
        {isDraft && (
          <div className="space-y-2">
            <p className="text-xs text-slate-600 dark:text-slate-400">
              Proposal is in draft. Edit content, then submit for review.
            </p>
            <div className="flex gap-2">
              <Button size="sm" variant="outline" className="gap-1 flex-1" asChild>
                <Link href={`/proposals/${proposalId}/edit`}>
                  <Edit3 className="h-3.5 w-3.5" /> Edit
                </Link>
              </Button>
              <Button size="sm" className="gap-1 flex-1" onClick={() => call("submit_review")} disabled={!!busy}>
                {busy === "submit_review" ? <><Loader2 className="h-3.5 w-3.5 animate-spin" />Submitting…</> : "Submit for Review →"}
              </Button>
            </div>
          </div>
        )}

        {/* UNDER REVIEW — approve */}
        {isUnderReview && (
          <div className="space-y-2">
            <p className="text-xs text-slate-600 dark:text-slate-400">
              Under review. Approve to unlock image generation and landing page.
            </p>
            <div className="flex gap-2">
              <Button size="sm" variant="outline" className="gap-1 flex-1" asChild>
                <Link href={`/proposals/${proposalId}/edit`}>
                  <Edit3 className="h-3.5 w-3.5" /> Edit
                </Link>
              </Button>
              <Button size="sm" className="gap-1 flex-1 bg-emerald-600 hover:bg-emerald-700 text-white" onClick={() => call("approve")} disabled={!!busy}>
                {busy === "approve" ? <><Loader2 className="h-3.5 w-3.5 animate-spin" />Approving…</> : <><CheckCircle2 className="h-3.5 w-3.5" />Approve</>}
              </Button>
            </div>
          </div>
        )}

        {/* REVISION REQUESTED — edit then re-submit */}
        {isRevision && (
          <div className="rounded-lg bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 p-3 space-y-2">
            <p className="text-xs font-medium text-amber-800 dark:text-amber-300 flex items-center gap-1.5">
              <AlertCircle className="h-3.5 w-3.5" /> Revision requested — make your changes below.
            </p>
            <div className="flex gap-2">
              <Button size="sm" className="gap-1 flex-1" asChild>
                <Link href={`/proposals/${proposalId}/edit`}>
                  <Edit3 className="h-3.5 w-3.5" /> Edit Proposal
                </Link>
              </Button>
              <Button
                size="sm"
                variant="outline"
                className="gap-1 flex-1"
                disabled={!!busy}
                onClick={() => call("submit_review")}
              >
                <RotateCcw className="h-3.5 w-3.5" />
                {busy === "submit_review" ? "Submitting…" : "Re-submit"}
              </Button>
            </div>
          </div>
        )}

        {/* APPROVED — generate images */}
        {isApproved && !hasImages && (
          <div className="space-y-2">
            <p className="text-xs text-slate-600 dark:text-slate-400">
              Approved. Generate AI images to embed in the landing page.
            </p>
            <div className="flex gap-2">
              <Button size="sm" variant="outline" className="gap-1 flex-1" asChild>
                <Link href={`/proposals/${proposalId}/edit`}>
                  <Edit3 className="h-3.5 w-3.5" /> Edit
                </Link>
              </Button>
              <Button size="sm" className="gap-1 flex-1" asChild>
                <Link href="/media-generation">
                  <Zap className="h-3.5 w-3.5" />Generate Images
                </Link>
              </Button>
            </div>
          </div>
        )}

        {/* APPROVED with images — create share link */}
        {isApproved && hasImages && !shareToken && (
          <div className="space-y-2">
            <p className="text-xs text-slate-600 dark:text-slate-400">
              Images ready. Create a share link to publish the landing page.
            </p>
            <Button size="sm" variant="outline" className="gap-1 w-full" asChild>
              <Link href={`/proposals/${proposalId}/edit`}>
                <Edit3 className="h-3.5 w-3.5" /> Still need to edit?
              </Link>
            </Button>
          </div>
        )}

        {/* SENT / share link live */}
        {shareToken && !isContract && (
          <div className="space-y-2">
            <p className="text-xs text-slate-600 dark:text-slate-400">Landing page is live and shareable.</p>
            <div className="flex gap-2">
              <Button size="sm" variant="outline" className="gap-1 flex-1" asChild>
                <Link href={`/proposals/${proposalId}/view`} target="_blank">
                  <ExternalLink className="h-3.5 w-3.5" />View Live
                </Link>
              </Button>
              <Button size="sm" variant="outline" className="gap-1 flex-1" asChild>
                <Link href={`/proposals/${proposalId}/edit`}>
                  <Edit3 className="h-3.5 w-3.5" /> Edit
                </Link>
              </Button>
            </div>
          </div>
        )}

        {/* CONTRACT — final */}
        {isContract && (
          <div className="rounded-lg bg-green-50 dark:bg-green-950/30 border border-green-200 dark:border-green-800 p-3 flex items-center gap-2">
            <FileCheck2 className="h-4 w-4 text-green-600 shrink-0" />
            <div>
              <p className="text-xs font-semibold text-green-800 dark:text-green-300">Deal active! 🎉</p>
              <p className="text-[11px] text-green-600 dark:text-green-400">Sponsorship is signed and in contract.</p>
            </div>
            {shareToken && (
              <Button size="sm" variant="outline" className="ml-auto text-xs gap-1" asChild>
                <Link href={`/proposals/${proposalId}/view`} target="_blank">
                  <ExternalLink className="h-3 w-3" />Live
                </Link>
              </Button>
            )}
          </div>
        )}

        {/* REJECTED */}
        {isRejected && (
          <div className="rounded-lg bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800 p-3 space-y-2">
            <p className="text-xs text-red-700 dark:text-red-300">This proposal was rejected. You can still edit and re-submit.</p>
            <div className="flex gap-2">
              <Button size="sm" variant="outline" className="gap-1 flex-1" asChild>
                <Link href={`/proposals/${proposalId}/edit`}>
                  <Edit3 className="h-3.5 w-3.5" /> Edit
                </Link>
              </Button>
              <Button size="sm" className="gap-1 flex-1" onClick={() => call("submit_review")} disabled={!!busy}>
                {busy === "submit_review" ? "Submitting…" : "Re-submit →"}
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
