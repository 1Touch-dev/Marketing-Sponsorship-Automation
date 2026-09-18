"use client";

import { useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { RefreshCw, Loader2 } from "lucide-react";

type RenewalDraft = {
  contractId: string;
  companyId: string;
  companyName: string;
  daysUntilExpiry: number;
  severity: "critical" | "warning" | "watch";
  proposalId: string;
  proposalTitle: string;
};

/** Phase 8, Team 2 — Renewal Agent (on-demand trigger). */
export function RenewalCheckPanel() {
  const [loading, setLoading] = useState(false);
  const [report, setReport] = useState<{ drafted: RenewalDraft[]; skipped: { contractId: string; reason: string }[] } | null>(null);

  async function runCheck() {
    setLoading(true);
    try {
      const res = await fetch("/api/contracts/renewal-check", { method: "POST" });
      const j = await res.json();
      if (res.ok) setReport(j);
    } finally {
      setLoading(false);
    }
  }

  return (
    <Card className="border-violet-200">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="text-base flex items-center gap-2">
              <RefreshCw className="h-4 w-4 text-violet-600" />
              Renewal Agent
            </CardTitle>
            <CardDescription>Drafts renewal proposals for contracts expiring within 60 days (Phase 8, Team 2 agent)</CardDescription>
          </div>
          <Button size="sm" variant="outline" disabled={loading} onClick={runCheck}>
            {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "Check for Renewals"}
          </Button>
        </div>
      </CardHeader>
      {report && (
        <CardContent className="space-y-2">
          {report.drafted.length === 0 ? (
            <p className="text-sm text-muted-foreground">No renewals needed right now.</p>
          ) : (
            <>
              <p className="text-xs text-muted-foreground">
                {report.drafted.length} renewal proposal(s) drafted — awaiting approval
              </p>
              {report.drafted.map((d) => (
                <Link
                  key={d.contractId}
                  href={`/proposals/${d.proposalId}`}
                  className="flex items-center justify-between p-2 rounded-md border hover:bg-muted/50 transition-colors"
                >
                  <div className="min-w-0">
                    <p className="text-sm font-medium truncate">{d.companyName}</p>
                    <p className="text-xs text-muted-foreground truncate">{d.proposalTitle}</p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <Badge variant={d.severity === "critical" ? "destructive" : "warning"} className="text-xs">
                      {d.daysUntilExpiry}d left
                    </Badge>
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
