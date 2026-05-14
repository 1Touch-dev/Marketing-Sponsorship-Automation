"use client";

import { Button } from "@/components/ui/button";
import { Printer } from "lucide-react";

export function PrintButton() {
  return (
    <Button
      variant="outline"
      size="sm"
      onClick={() => window.print()}
      className="flex items-center gap-1.5"
    >
      <Printer className="h-4 w-4" />
      Imprimir / PDF
    </Button>
  );
}
