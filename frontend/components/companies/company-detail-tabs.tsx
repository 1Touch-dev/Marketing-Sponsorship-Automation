"use client";

import { useState, type ReactNode } from "react";
import { cn } from "@/lib/utils";

type TabKey = "overview" | "crm" | "intelligence" | "outreach";

const TABS: Array<{ key: TabKey; label: string }> = [
  { key: "overview", label: "Overview" },
  { key: "crm", label: "CRM Details" },
  { key: "intelligence", label: "Intelligence" },
  { key: "outreach", label: "Outreach" },
];

/**
 * Found in the 2026-09-23 UX audit (redesign direction #2): this page
 * stacked ~10 cards — an always-open edit form, six AI-intelligence panels,
 * outreach tools, and related-records lists — all visible and equally
 * weighted at once, with nothing collapsed by default. A first-time viewer
 * couldn't tell what to do first. Everything below is still server-rendered
 * on first load (so there's no extra round-trip to switch tabs and nothing
 * is SEO-invisible) — this just controls which section is visible at once.
 */
export function CompanyDetailTabs({
  overview,
  crm,
  intelligence,
  outreach,
}: Record<TabKey, ReactNode>) {
  const [tab, setTab] = useState<TabKey>("overview");
  const content: Record<TabKey, ReactNode> = { overview, crm, intelligence, outreach };

  return (
    <div>
      <div className="flex gap-1 border-b mb-6 overflow-x-auto">
        {TABS.map((t) => (
          <button
            key={t.key}
            type="button"
            onClick={() => setTab(t.key)}
            className={cn(
              "px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors whitespace-nowrap",
              tab === t.key
                ? "border-primary text-primary"
                : "border-transparent text-muted-foreground hover:text-foreground hover:border-muted-foreground/30",
            )}
          >
            {t.label}
          </button>
        ))}
      </div>
      {TABS.map((t) => (
        <div key={t.key} className={tab === t.key ? "" : "hidden"}>
          {content[t.key]}
        </div>
      ))}
    </div>
  );
}
