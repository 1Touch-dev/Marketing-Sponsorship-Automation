"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Loader2, PlayCircle } from "lucide-react";

type RunAllResult = {
  hygiene: { staleCompanies: unknown[] };
  renewal: { drafted: unknown[]; skipped: unknown[] };
  reporting: { drafted: unknown[]; skipped: unknown[] };
  sequencer: { dueCount: number; processed: number };
};

export function RunTeam2Panel() {
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<RunAllResult | null>(null);

  async function runAll() {
    setLoading(true);
    try {
      const res = await fetch("/api/agents/team2/run-all", { method: "POST" });
      const j = await res.json();
      if (res.ok) setResult(j);
    } finally {
      setLoading(false);
    }
  }

  return (
    <Card className="border-sky-200">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <CardTitle className="text-base flex items-center gap-2">
              <PlayCircle className="h-4 w-4 text-sky-600" /> Run all Team 2 checks
            </CardTitle>
            <CardDescription>
              Runs Pipeline Hygiene, Renewal, and Reporting together, and advances any due email-sequence steps — one click for everything Team 2 does today.
            </CardDescription>
          </div>
          <Button onClick={runAll} disabled={loading} className="gap-1.5 bg-sky-600 hover:bg-sky-700 text-white">
            {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <PlayCircle className="h-3.5 w-3.5" />}
            {loading ? "Running…" : "Run All"}
          </Button>
        </div>
      </CardHeader>
      {result && (
        <CardContent>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm">
            <Stat label="Stale deals" value={result.hygiene.staleCompanies.length} />
            <Stat label="Renewals drafted" value={result.renewal.drafted.length} sub={`${result.renewal.skipped.length} skipped`} />
            <Stat label="Reports drafted" value={result.reporting.drafted.length} sub={`${result.reporting.skipped.length} skipped`} />
            <Stat label="Sequence steps advanced" value={result.sequencer.processed} sub={`${result.sequencer.dueCount} due`} />
          </div>
        </CardContent>
      )}
    </Card>
  );
}

function Stat({ label, value, sub }: { label: string; value: number; sub?: string }) {
  return (
    <div className="rounded-lg border p-3">
      <p className="text-2xl font-bold">{value}</p>
      <p className="text-xs text-muted-foreground">{label}</p>
      {sub && <p className="text-[10px] text-muted-foreground mt-0.5">{sub}</p>}
    </div>
  );
}
