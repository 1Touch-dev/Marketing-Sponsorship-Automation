"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toaster";

export function GenerateProposalButton({ campaignId }: { campaignId: string }) {
  const router = useRouter();
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);

  async function onClick() {
    setLoading(true);
    try {
      const res = await fetch("/api/proposals/generate", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ campaign_id: campaignId }),
      });
      const j = await res.json();
      if (!res.ok) throw new Error(j?.error ?? `Failed (${res.status})`);
      toast({
        variant: "success",
        title: "Proposal generated",
        description: j.attempts > 1 ? `Done after ${j.attempts} attempts.` : undefined,
      });
      router.push(`/proposals/${j.data.id}`);
    } catch (err) {
      toast({
        variant: "destructive",
        title: "Generation failed",
        description: err instanceof Error ? err.message : "Unknown error",
      });
    } finally {
      setLoading(false);
    }
  }

  return (
    <Button onClick={onClick} disabled={loading} className="w-full">
      {loading ? "Generating proposal…" : "Generate proposal"}
    </Button>
  );
}
