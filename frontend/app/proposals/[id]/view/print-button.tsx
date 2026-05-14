"use client";

import { Button } from "@/components/ui/button";
import { Printer } from "lucide-react";

export function PrintButton({ label, variant = "outline" }: { label?: string; variant?: "outline" | "ghost" | "link" }) {
  return (
    <Button
      variant={variant}
      size="sm"
      onClick={() => window.print()}
      className="flex items-center gap-1.5"
    >
      <Printer className="h-4 w-4" />
      {label ?? "Imprimir / PDF"}
    </Button>
  );
}
