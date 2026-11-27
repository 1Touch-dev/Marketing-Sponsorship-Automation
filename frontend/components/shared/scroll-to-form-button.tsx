"use client";

import { Button } from "@/components/ui/button";
import { Plus } from "lucide-react";

export function ScrollToFormButton({
  targetId,
  focusId,
  children,
  disabled,
}: {
  targetId: string;
  focusId: string;
  children: React.ReactNode;
  disabled?: boolean;
}) {
  function handleClick() {
    const target = document.getElementById(targetId);
    if (!target) return;
    target.scrollIntoView({ behavior: "smooth", block: "start" });
    window.setTimeout(() => {
      const field = document.getElementById(focusId) as HTMLElement | null;
      field?.focus({ preventScroll: true });
    }, 350);
  }

  return (
    <Button type="button" size="sm" onClick={handleClick} disabled={disabled}>
      <Plus className="h-4 w-4 mr-1" />
      {children}
    </Button>
  );
}
