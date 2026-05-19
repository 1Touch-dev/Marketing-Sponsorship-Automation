"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Printer, Loader2, Download, FileText } from "lucide-react";

type ExportType = "pdf_executive" | "pdf_print";

export function PrintButton({
  label,
  variant = "outline",
  proposalId,
  exportType = "pdf_print",
}: {
  label?: string;
  variant?: "outline" | "ghost" | "link";
  proposalId?: string;
  exportType?: ExportType;
}) {
  const [preparing, setPreparing] = useState(false);

  async function handlePrint() {
    setPreparing(true);
    try {
      // Track the export
      if (proposalId) {
        await fetch("/api/exports", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ proposal_id: proposalId, export_type: exportType }),
        }).catch(() => {/* non-blocking */});
      }

      // Give browser time to finish renders then print
      await new Promise((resolve) => setTimeout(resolve, 300));
      await document.fonts.ready;
      window.print();
    } finally {
      setPreparing(false);
    }
  }

  return (
    <Button
      variant={variant}
      size="sm"
      onClick={handlePrint}
      disabled={preparing}
      className="flex items-center gap-1.5"
    >
      {preparing ? (
        <Loader2 className="h-4 w-4 animate-spin" />
      ) : exportType === "pdf_executive" ? (
        <FileText className="h-4 w-4" />
      ) : (
        <Printer className="h-4 w-4" />
      )}
      {preparing ? "Preparando…" : (label ?? "Imprimir / PDF")}
    </Button>
  );
}
