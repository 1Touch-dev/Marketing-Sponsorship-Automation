"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toaster";
import { Image as ImageIcon, Loader2 } from "lucide-react";

interface BulkFetchLogosButtonProps {
  /** IDs of companies currently visible (respects active filters). */
  companyIds: string[];
  /** How many of those have no logo yet — shown in the button label. */
  missingCount: number;
  /** Whether a filter is active — scopes the bulk fetch to the visible list. */
  hasFilters: boolean;
}

export function BulkFetchLogosButton({ companyIds, missingCount, hasFilters }: BulkFetchLogosButtonProps) {
  const router = useRouter();
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);

  async function handleClick() {
    setLoading(true);
    try {
      const body = hasFilters
        ? { company_ids: companyIds, only_missing: true }
        : { only_missing: true, limit: 200 };

      const res = await fetch("/api/companies/bulk-logo-fetch", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error ?? `Request failed (${res.status})`);

      if (json.processed === 0) {
        toast({ variant: "success", title: "All companies already have a logo", description: "Nothing to fetch." });
      } else {
        toast({
          variant: "success",
          title: `Logos: ${json.fetched} fetched, ${json.failed} failed`,
          description: `${json.processed} companies processed.`,
        });
        router.refresh();
      }
    } catch (err) {
      toast({ variant: "destructive", title: "Bulk logo fetch failed", description: err instanceof Error ? err.message : "Unknown error" });
    } finally {
      setLoading(false);
    }
  }

  if (missingCount === 0) return null;

  return (
    <Button
      variant="outline"
      size="sm"
      onClick={handleClick}
      disabled={loading}
      className="gap-1.5"
      title="Scrape logos for companies that don't have one yet"
    >
      {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ImageIcon className="h-3.5 w-3.5" />}
      {loading ? "Fetching logos…" : `Fetch logos (${missingCount})`}
    </Button>
  );
}
