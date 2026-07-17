"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { ShieldCheck, ShieldOff, Loader2 } from "lucide-react";
import { useToast } from "@/components/ui/toaster";

export function PreapproveToggle({
  campaignId,
  isPreapproved,
  preapprovedAt,
}: {
  campaignId: string;
  isPreapproved: boolean;
  preapprovedAt: string | null;
}) {
  const [loading, setLoading] = useState(false);
  const router = useRouter();
  const { toast } = useToast();

  async function toggle() {
    setLoading(true);
    try {
      const res = await fetch(`/api/campaigns/${campaignId}/preapprove`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ preapproved: !isPreapproved }),
      });
      const json = await res.json();
      if (!res.ok) {
        toast({ variant: "destructive", title: "Failed", description: json.error });
        return;
      }
      toast({
        variant: "success",
        title: isPreapproved ? "Pre-approval revoked" : "Campaign pre-approved",
        description: isPreapproved
          ? "The Outreach Agent batch runner is now disabled for this campaign."
          : "The Outreach Agent can now auto-run across companies without a proposal-approval pause.",
      });
      router.refresh();
    } catch {
      toast({ variant: "destructive", title: "Network error", description: "Could not reach server." });
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex items-center gap-2">
      {isPreapproved ? (
        <span className="inline-flex items-center gap-1 text-xs font-medium px-2.5 py-1 rounded-full bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300">
          <ShieldCheck className="h-3 w-3" /> Pre-approved for auto-run
        </span>
      ) : null}
      <Button
        variant="outline"
        size="sm"
        onClick={toggle}
        disabled={loading}
        className={isPreapproved ? "text-destructive border-destructive/30" : ""}
      >
        {loading ? (
          <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" />
        ) : isPreapproved ? (
          <ShieldOff className="h-3.5 w-3.5 mr-1" />
        ) : (
          <ShieldCheck className="h-3.5 w-3.5 mr-1" />
        )}
        {isPreapproved ? "Revoke pre-approval" : "Mark pre-approved"}
      </Button>
      {isPreapproved && preapprovedAt && (
        <span className="text-xs text-muted-foreground hidden md:inline">
          since {new Date(preapprovedAt).toLocaleDateString()}
        </span>
      )}
    </div>
  );
}
