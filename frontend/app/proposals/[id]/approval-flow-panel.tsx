"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toaster";
import {
  CheckCircle2, Circle, ArrowRight, Image, Send, FileCheck2,
  Loader2, ExternalLink, Zap
} from "lucide-react";
import Link from "next/link";

type FlowStep = "draft" | "review" | "approved" | "images" | "landing";

interface ApprovalFlowPanelProps {
  proposalId: string;
  proposalStatus: string;
  shareToken: string | null;
  hasImages: boolean;
}

function StepDot({
  done,
  active,
  label,
  icon: Icon,
}: {
  done: boolean;
  active: boolean;
  label: string;
  icon: React.ElementType;
}) {
  return (
    <div className="flex flex-col items-center gap-1.5">
      <div
        className={`h-9 w-9 rounded-full flex items-center justify-center border-2 transition-all ${
          done
            ? "bg-emerald-500 border-emerald-500 text-white"
            : active
              ? "bg-white border-indigo-500 text-indigo-600"
              : "bg-slate-50 border-slate-200 text-slate-400"
        }`}
      >
        {done ? <CheckCircle2 className="h-4.5 w-4.5" /> : <Icon className="h-4 w-4" />}
      </div>
      <span className={`text-[10px] font-medium text-center leading-tight ${
        done ? "text-emerald-600" : active ? "text-indigo-600" : "text-slate-400"
      }`}>{label}</span>
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
  const isApproved = proposalStatus === "approved";
  const isSent = proposalStatus === "sent";
  const isContract = proposalStatus === "active_contract";

  const stepDraft = true; // always done
  const stepReview = isUnderReview || isApproved || isSent || isContract;
  const stepApproved = isApproved || isSent || isContract;
  const stepImages = stepApproved && hasImages;
  const stepLanding = !!shareToken;

  // Current active step
  const activeStep: FlowStep = isSent
    ? "landing"
    : stepImages
      ? "landing"
      : stepApproved
        ? "images"
        : stepReview
          ? "approved"
          : isDraft
            ? "review"
            : "draft";

  async function submitForReview() {
    setBusy("review");
    try {
      const res = await fetch(`/api/proposals/${proposalId}/approve`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ decision: "submit_review" }),
      });
      const j = await res.json();
      if (!res.ok) throw new Error(j?.error ?? "Failed");
      toast({ variant: "success", title: "Submitted for review" });
      router.refresh();
    } catch (e) {
      toast({ variant: "destructive", title: String(e) });
    } finally {
      setBusy(null);
    }
  }

  async function approveProposal() {
    setBusy("approve");
    try {
      const res = await fetch(`/api/proposals/${proposalId}/approve`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ decision: "approve" }),
      });
      const j = await res.json();
      if (!res.ok) throw new Error(j?.error ?? "Failed");
      toast({ variant: "success", title: "Proposal approved — ready for image generation" });
      router.refresh();
    } catch (e) {
      toast({ variant: "destructive", title: String(e) });
    } finally {
      setBusy(null);
    }
  }

  const allDone = stepLanding && hasImages;

  return (
    <div className="rounded-xl border border-slate-200 bg-white overflow-hidden">
      <div className="px-5 py-3 border-b border-slate-100 flex items-center gap-2">
        <FileCheck2 className="h-4 w-4 text-slate-600" />
        <span className="text-sm font-semibold text-slate-800">Approval Flow</span>
        {allDone && (
          <span className="ml-auto text-xs font-medium text-emerald-600 flex items-center gap-1">
            <CheckCircle2 className="h-3.5 w-3.5" />Complete
          </span>
        )}
      </div>

      {/* Step indicators */}
      <div className="px-5 py-4">
        <div className="flex items-start justify-between relative">
          {/* Connecting line */}
          <div className="absolute top-4 left-[calc(10%)] right-[calc(10%)] h-0.5 bg-slate-100 z-0" />

          <StepDot done={stepDraft} active={activeStep === "draft"} label="Draft" icon={Circle} />
          <StepDot done={stepReview} active={activeStep === "review"} label="Review" icon={ArrowRight} />
          <StepDot done={stepApproved} active={activeStep === "approved"} label="Approved" icon={FileCheck2} />
          <StepDot done={stepImages} active={activeStep === "images"} label="Images" icon={Image} />
          <StepDot done={stepLanding} active={activeStep === "landing"} label="Live" icon={Send} />
        </div>
      </div>

      {/* Current action */}
      <div className="px-5 pb-4 space-y-2">
        {isDraft && (
          <div className="space-y-2">
            <p className="text-xs text-slate-600">Proposal is in draft. Submit for review before generating images.</p>
            <Button size="sm" className="w-full" onClick={submitForReview} disabled={!!busy}>
              {busy === "review" ? <><Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />Submitting…</> : "Submit for Review"}
            </Button>
          </div>
        )}

        {isUnderReview && (
          <div className="space-y-2">
            <p className="text-xs text-slate-600">Under review. Approve to unlock image generation and landing page.</p>
            <Button size="sm" className="w-full bg-emerald-600 hover:bg-emerald-700 text-white" onClick={approveProposal} disabled={!!busy}>
              {busy === "approve" ? <><Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />Approving…</> : <><CheckCircle2 className="h-3.5 w-3.5 mr-1.5" />Approve Proposal</>}
            </Button>
          </div>
        )}

        {isApproved && !hasImages && (
          <div className="space-y-2">
            <p className="text-xs text-slate-600">Proposal approved. Generate AI images to embed in the landing page.</p>
            <Button size="sm" className="w-full" asChild>
              <Link href="/media-generation">
                <Zap className="h-3.5 w-3.5 mr-1.5" />Generate Images
              </Link>
            </Button>
          </div>
        )}

        {isApproved && hasImages && !shareToken && (
          <div className="space-y-2">
            <p className="text-xs text-slate-600">Images ready. Create a share link to publish the landing page.</p>
          </div>
        )}

        {shareToken && (
          <div className="space-y-2">
            <p className="text-xs text-slate-600">Landing page is live and shareable.</p>
            <Button size="sm" variant="outline" className="w-full" asChild>
              <Link href={`/proposals/${proposalId}/view`} target="_blank">
                <ExternalLink className="h-3.5 w-3.5 mr-1.5" />View Landing Page
              </Link>
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
