"use client";

import { useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { BarChart3, Loader2 } from "lucide-react";

type ReportDrafted = {
  contractId: string;
  companyName: string;
  emailId: string;
  subject: string;
  totalReach: number;
  matchesCovered: number;
};

/** Phase 8, Team 2 — Reporting Agent (on-demand trigger). */
export function ReportingCheckPanel() {
  const [loading, setLoading] = useState(false);
  const [report, setReport] = useState<{ drafted: ReportDrafted[]; skipped: { contractId: string; reason: string }[] } | null>(null);

  async function runCheck() {
    setLoading(true);
    try {
      const res = await fetch("/api/contracts/reporting-check", { method: "POST" });
      const j = await res.json();
      if (res.ok) setReport(j);
    } finally {
      setLoading(false);
    }
  }

  return (
    <Card className="border-sky-200">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="text-base flex items-center gap-2">
              <BarChart3 className="h-4 w-4 text-sky-600" />
              Reporting Agent
            </CardTitle>
            <CardDescription>Drafts monthly ROI report emails for active sponsors with real match data (Phase 8, Team 2 agent)</CardDescription>
          </div>
          <Button size="sm" variant="outline" disabled={loading} onClick={runCheck}>
            {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "Check for Reports"}
          </Button>
        </div>
      </CardHeader>
      {report && (
        <CardContent className="space-y-2">
          {report.drafted.length === 0 ? (
            <p className="text-sm text-muted-foreground">No new monthly reports to draft right now.</p>
          ) : (
            <>
              <p className="text-xs text-muted-foreground">
                {report.drafted.length} report(s) drafted — awaiting approval
              </p>
              {report.drafted.map((r) => (
                <Link
                  key={r.contractId}
                  href={`/emails/${r.emailId}`}
                  className="flex items-center justify-between p-2 rounded-md border hover:bg-muted/50 transition-colors"
                >
                  <div className="min-w-0">
                    <p className="text-sm font-medium truncate">{r.companyName}</p>
                    <p className="text-xs text-muted-foreground truncate">{r.subject}</p>
                  </div>
                  <div className="text-xs text-muted-foreground shrink-0">
                    {r.totalReach.toLocaleString("pt-BR")} views · {r.matchesCovered}m
                  </div>
                </Link>
              ))}
            </>
          )}
        </CardContent>
      )}
    </Card>
  );
}
