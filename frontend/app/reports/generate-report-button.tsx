"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toaster";
import { FileText, Loader2, Download } from "lucide-react";

interface GenerateReportButtonProps {
  proposalId: string;
  companyName: string;
}

export function GenerateReportButton({ proposalId, companyName }: GenerateReportButtonProps) {
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [report, setReport] = useState<string | null>(null);

  async function generate() {
    setLoading(true);
    try {
      const res = await fetch(`/api/proposals/${proposalId}/monthly-report`, {
        method: "POST",
      });
      const j = await res.json();
      if (!res.ok) throw new Error(j?.error ?? `Failed (${res.status})`);
      setReport(j.report ?? "Report generated.");
      toast({ variant: "success", title: "Monthly report generated" });
    } catch (err) {
      toast({ variant: "destructive", title: "Report failed", description: err instanceof Error ? err.message : "Unknown" });
    } finally {
      setLoading(false);
    }
  }

  function download() {
    if (!report) return;
    const blob = new Blob([report], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${companyName.replace(/\s+/g, "_")}_monthly_report.txt`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <>
      <Button
        size="sm"
        variant="outline"
        className="h-7 text-xs gap-1"
        onClick={generate}
        disabled={loading}
      >
        {loading ? (
          <><Loader2 className="h-3 w-3 animate-spin" />Generating…</>
        ) : (
          <><FileText className="h-3 w-3" />Monthly Report</>
        )}
      </Button>
      {report && (
        <Button size="sm" variant="outline" className="h-7 text-xs gap-1" onClick={download}>
          <Download className="h-3 w-3" /> Download
        </Button>
      )}
    </>
  );
}
