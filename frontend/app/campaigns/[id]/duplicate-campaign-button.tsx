"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Copy } from "lucide-react";
import { useToast } from "@/components/ui/toaster";

export function DuplicateCampaignButton({ campaignId }: { campaignId: string }) {
  const [loading, setLoading] = useState(false);
  const router = useRouter();
  const { toast } = useToast();

  async function handleDuplicate() {
    setLoading(true);
    try {
      const res = await fetch("/api/campaigns/duplicate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ campaign_id: campaignId }),
      });
      const json = await res.json();
      if (!res.ok) {
        toast({ variant: "destructive", title: "Duplicate failed", description: json.error });
        return;
      }
      toast({ variant: "success", title: "Campaign duplicated", description: `Created: ${json.data?.title}` });
      router.push(`/campaigns/${json.data.id}`);
    } catch {
      toast({ variant: "destructive", title: "Network error", description: "Could not reach server." });
    } finally {
      setLoading(false);
    }
  }

  return (
    <Button variant="outline" size="sm" onClick={handleDuplicate} disabled={loading}>
      <Copy className="h-4 w-4 mr-1" />
      {loading ? "Duplicating…" : "Duplicate"}
    </Button>
  );
}
