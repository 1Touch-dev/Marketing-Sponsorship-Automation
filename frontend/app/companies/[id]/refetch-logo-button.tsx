"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { RefreshCw } from "lucide-react";

export function RefetchLogoButton({
  companyId,
  website,
  companyName,
}: {
  companyId: string;
  website?: string | null;
  companyName?: string | null;
}) {
  const [status, setStatus] = useState<"idle" | "loading" | "done" | "error">("idle");

  async function handleRefetch() {
    setStatus("loading");
    try {
      const res = await fetch("/api/companies/enrich", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ companyId, website, companyName }),
      });
      if (res.ok) {
        setStatus("done");
        setTimeout(() => setStatus("idle"), 3000);
      } else {
        setStatus("error");
        setTimeout(() => setStatus("idle"), 3000);
      }
    } catch {
      setStatus("error");
      setTimeout(() => setStatus("idle"), 3000);
    }
  }

  return (
    <Button
      size="sm"
      variant="outline"
      onClick={handleRefetch}
      disabled={status === "loading"}
      className="gap-1.5 text-xs"
      title="Re-fetch company logo from logo.dev"
    >
      <RefreshCw className={`h-3.5 w-3.5 ${status === "loading" ? "animate-spin" : ""}`} />
      {status === "loading" ? "Fetching…" : status === "done" ? "✓ Logo updated" : status === "error" ? "Failed" : "Re-fetch Logo"}
    </Button>
  );
}
