"use client";

import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { formatDate } from "@/lib/utils";
import { GitCompare, ChevronDown, ChevronUp, X } from "lucide-react";
import type { ProposalVersion } from "@/types/database";
import type { ProposalContent } from "@/types/database";

type VersionEntry = Pick<ProposalVersion, "id" | "version" | "title" | "edit_reason" | "edited_by" | "created_at" | "content" | "content_md">;

type Props = {
  versions: VersionEntry[];
};

/**
 * Computes a simple line-by-line diff between two texts.
 * Returns an array of diff lines with type: "added" | "removed" | "same".
 */
function simpleDiff(textA: string, textB: string): Array<{ type: "added" | "removed" | "same"; text: string }> {
  const linesA = textA.split(/\n+/).filter(Boolean);
  const linesB = textB.split(/\n+/).filter(Boolean);
  const setA = new Set(linesA);
  const setB = new Set(linesB);
  const result: Array<{ type: "added" | "removed" | "same"; text: string }> = [];

  // Lines only in A → removed
  for (const line of linesA) {
    if (!setB.has(line)) result.push({ type: "removed", text: line });
    else result.push({ type: "same", text: line });
  }
  // Lines only in B → added
  for (const line of linesB) {
    if (!setA.has(line)) result.push({ type: "added", text: line });
  }
  // Sort: removed first, same, added last (matching original order approximately)
  return result;
}

function extractText(version: VersionEntry): string {
  if (version.content_md) return version.content_md;
  const c = version.content as unknown as Record<string, unknown> | null;
  if (!c) return "";
  return [
    c.executive_summary,
    c.campaign_rationale,
    c.sponsorship_value,
    c.activation_plan,
    c.investment_note,
  ]
    .filter(Boolean)
    .join("\n\n");
}

export function VersionHistoryPanel({ versions }: Props) {
  const [showCompare, setShowCompare] = useState(false);
  const [versionAIdx, setVersionAIdx] = useState(0);
  const [versionBIdx, setVersionBIdx] = useState(1);
  const [expanded, setExpanded] = useState(true);

  const canCompare = versions.length >= 2;
  const versionA = versions[versionAIdx];
  const versionB = versions[versionBIdx];

  const diff = showCompare && versionA && versionB
    ? simpleDiff(extractText(versionA), extractText(versionB))
    : [];

  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base flex items-center gap-2">
            <span className="text-lg">🕓</span> Version History
            {versions.length > 0 && (
              <span className="ml-1 text-xs font-normal text-muted-foreground">
                {versions.length} snapshot{versions.length !== 1 ? "s" : ""}
              </span>
            )}
          </CardTitle>
          <button
            onClick={() => setExpanded(v => !v)}
            className="text-muted-foreground hover:text-foreground"
          >
            {expanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
          </button>
        </div>
      </CardHeader>

      {expanded && (
        <CardContent className="text-sm space-y-3">
          {versions.length === 0 ? (
            <p className="text-muted-foreground text-sm">
              No snapshots yet — click &quot;Save Version&quot; to create one.
            </p>
          ) : (
            <>
              {/* Timeline */}
              <ol className="relative border-l border-slate-200 dark:border-slate-700 space-y-0">
                {versions.map((v, idx) => (
                  <li key={v.id ?? v.version} className="ml-4 pb-4 last:pb-0">
                    <span
                      className={`absolute -left-[7px] mt-1.5 h-3.5 w-3.5 rounded-full border-2 border-white dark:border-slate-900 ${idx === 0 ? "bg-indigo-500" : "bg-slate-300 dark:bg-slate-600"}`}
                    />
                    <div className="flex items-baseline justify-between gap-2 flex-wrap">
                      <span className={`font-semibold ${idx === 0 ? "text-indigo-600 dark:text-indigo-400" : ""}`}>
                        v{v.version}
                        {v.title ? <span className="ml-1 font-normal text-muted-foreground text-xs">— {v.title}</span> : null}
                      </span>
                      <span className="text-xs text-muted-foreground shrink-0">{formatDate(v.created_at)}</span>
                    </div>
                    {v.edited_by && (
                      <p className="text-xs text-muted-foreground mt-0.5">By {v.edited_by}</p>
                    )}
                    <p className="text-xs text-muted-foreground mt-0.5 leading-snug">
                      {v.edit_reason ?? "—"}
                    </p>
                  </li>
                ))}
              </ol>

              {/* Compare button */}
              {canCompare && (
                <div className="pt-1">
                  <Button
                    size="sm"
                    variant="outline"
                    className="w-full gap-1.5 text-indigo-600 border-indigo-200 hover:bg-indigo-50 hover:text-indigo-700"
                    onClick={() => setShowCompare(v => !v)}
                  >
                    <GitCompare className="h-3.5 w-3.5" />
                    {showCompare ? "Hide Compare" : "Compare Versions"}
                  </Button>
                </div>
              )}
            </>
          )}

          {/* Compare diff panel */}
          {showCompare && canCompare && versionA && versionB && (
            <div className="rounded-lg border bg-slate-50 dark:bg-slate-900/40 p-3 space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-slate-700 dark:text-slate-300">Side-by-side diff</span>
                <button onClick={() => setShowCompare(false)} className="text-muted-foreground hover:text-foreground">
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>

              {/* Version pickers */}
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-[10px] uppercase tracking-wide text-muted-foreground font-medium">From (A)</label>
                  <select
                    value={versionAIdx}
                    onChange={e => setVersionAIdx(Number(e.target.value))}
                    className="w-full mt-0.5 rounded-md border bg-background px-2 py-1 text-xs"
                  >
                    {versions.map((v, i) => (
                      <option key={v.id ?? v.version} value={i} disabled={i === versionBIdx}>
                        v{v.version} — {v.edit_reason ?? formatDate(v.created_at)}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="text-[10px] uppercase tracking-wide text-muted-foreground font-medium">To (B)</label>
                  <select
                    value={versionBIdx}
                    onChange={e => setVersionBIdx(Number(e.target.value))}
                    className="w-full mt-0.5 rounded-md border bg-background px-2 py-1 text-xs"
                  >
                    {versions.map((v, i) => (
                      <option key={v.id ?? v.version} value={i} disabled={i === versionAIdx}>
                        v{v.version} — {v.edit_reason ?? formatDate(v.created_at)}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Diff output */}
              <div className="rounded-md border bg-white dark:bg-slate-950 max-h-72 overflow-y-auto text-xs font-mono divide-y divide-slate-100 dark:divide-slate-800">
                {diff.length === 0 ? (
                  <p className="px-3 py-2 text-muted-foreground">No differences found between these versions.</p>
                ) : (
                  diff.map((line, i) => (
                    <div
                      key={i}
                      className={`px-3 py-1 leading-relaxed whitespace-pre-wrap break-words ${
                        line.type === "added"
                          ? "bg-green-50 dark:bg-green-950/20 text-green-800 dark:text-green-300"
                          : line.type === "removed"
                          ? "bg-red-50 dark:bg-red-950/20 text-red-800 dark:text-red-300 line-through opacity-70"
                          : "text-slate-600 dark:text-slate-400"
                      }`}
                    >
                      <span className="select-none mr-2 text-[10px] opacity-50">
                        {line.type === "added" ? "+" : line.type === "removed" ? "−" : " "}
                      </span>
                      {line.text}
                    </div>
                  ))
                )}
              </div>

              <div className="flex gap-3 text-[11px] text-muted-foreground">
                <span className="flex items-center gap-1"><span className="inline-block w-2.5 h-2.5 rounded-sm bg-green-100 border border-green-300" /> Added in v{versionB.version}</span>
                <span className="flex items-center gap-1"><span className="inline-block w-2.5 h-2.5 rounded-sm bg-red-100 border border-red-300" /> Removed from v{versionA.version}</span>
              </div>
            </div>
          )}
        </CardContent>
      )}
    </Card>
  );
}
