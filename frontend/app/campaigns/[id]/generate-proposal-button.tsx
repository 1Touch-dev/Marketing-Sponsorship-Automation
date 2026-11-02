"use client";

import { useRouter } from "next/navigation";
import { useToast } from "@/components/ui/toaster";
import { QuickBriefPanel, type GenerateAttempt } from "@/components/briefs/quick-brief-panel";

export function GenerateProposalButton({
  campaignId,
  companyId,
  contactName,
  contactEmail,
}: {
  campaignId: string;
  companyId: string;
  contactName?: string | null;
  contactEmail?: string | null;
}) {
  const router = useRouter();
  const { toast } = useToast();

  async function onGenerate(): Promise<GenerateAttempt> {
    const res = await fetch("/api/proposals/generate", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ campaign_id: campaignId }),
    });
    const j = await res.json() as { data?: { id: string }; error?: string; code?: string; attempts?: number };
    if (!res.ok || !j.data?.id) return { ok: false, error: j?.error ?? `Failed (${res.status})`, code: j?.code };
    toast({
      variant: "success",
      title: "Proposal generated",
      description: j.attempts && j.attempts > 1 ? `Done after ${j.attempts} attempts.` : undefined,
    });
    router.push(`/proposals/${j.data.id}`);
    return { ok: true };
  }

  return (
    <QuickBriefPanel
      companyId={companyId}
      contactName={contactName}
      contactEmail={contactEmail}
      generateLabel="Generate proposal"
      layout="stack"
      onGenerate={onGenerate}
    />
  );
}
