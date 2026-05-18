"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Printer, Loader2 } from "lucide-react";

export function PrintButton({ label, variant = "outline" }: { label?: string; variant?: "outline" | "ghost" | "link" }) {
  const [preparing, setPreparing] = useState(false);

  function handlePrint() {
    setPreparing(true);
    // Give the browser a tick to finish any pending renders/hydration,
    // then wait for all images/fonts before opening the print dialog.
    setTimeout(() => {
      document.fonts.ready.then(() => {
        window.print();
        setPreparing(false);
      });
    }, 300);
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
      ) : (
        <Printer className="h-4 w-4" />
      )}
      {preparing ? "Preparando..." : (label ?? "Imprimir / PDF")}
    </Button>
  );
}
