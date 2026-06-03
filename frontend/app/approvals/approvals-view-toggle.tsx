"use client";

import { useState, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { LayoutList, Layers } from "lucide-react";
import { ApprovalsCardView, type ApprovalItem } from "./approvals-card-view";

type Props = {
  items: ApprovalItem[];
  listView: ReactNode;
};

export function ApprovalsViewToggle({ items, listView }: Props) {
  const [mode, setMode] = useState<"list" | "cards">("list");

  return (
    <>
      <div className="flex justify-end mb-4">
        <div className="inline-flex rounded-md border overflow-hidden">
          <Button
            variant={mode === "list" ? "default" : "ghost"}
            size="sm"
            className="rounded-none"
            onClick={() => setMode("list")}
          >
            <LayoutList className="h-4 w-4 mr-1.5" />
            Lista
          </Button>
          <Button
            variant={mode === "cards" ? "default" : "ghost"}
            size="sm"
            className="rounded-none"
            onClick={() => setMode("cards")}
          >
            <Layers className="h-4 w-4 mr-1.5" />
            Vista em Cards
          </Button>
        </div>
      </div>

      {mode === "list" ? listView : <ApprovalsCardView items={items} />}
    </>
  );
}
