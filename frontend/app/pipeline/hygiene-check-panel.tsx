"use client";

import { useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ShieldAlert, Loader2 } from "lucide-react";

interface StaleCompany {
  id: string;
  companyName: string;
  pipelineStage: string;
  daysStale: number;
  severity: "warning" | "critical";
}

/** Phase 8, Team 2 — Pipeline Hygiene Agent (on-demand trigger). */
export function HygieneCheckPanel() {
  const [loading, setLoading] = useState(false);
  const [report, setReport] = useState<{ staleCompanies: StaleCompany[] } | null>(null);

  async function runCheck() {
    setLoading(true);
    try {
      const res = await fetch("/api/pipeline/hygiene-check", { method: "POST" });
      const j = await res.json();
      if (res.ok) setReport(j);
    } finally {
      setLoading(false);
    }
  }

  return (
    <Card className="border-amber-200">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="text-base flex items-center gap-2">
              <ShieldAlert className="h-4 w-4 text-amber-600" />
              Pipeline Hygiene Check
            </CardTitle>
            <CardDescription>Flags deals with no activity for 14+ days (Phase 8, Team 2 agent)</CardDescription>
          </div>
          <Button size="sm" variant="outline" disabled={loading} onClick={runCheck}>
            {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "Run Check"}
          </Button>
        </div>
      </CardHeader>
      {report && (
        <CardContent className="space-y-2">
          {report.staleCompanies.length === 0 ? (
            <p className="text-sm text-muted-foreground">No stale deals — pipeline is clean.</p>
          ) : (
            <>
              <p className="text-xs text-muted-foreground">
                {report.staleCompanies.length} stale deal(s)
              </p>
              {report.staleCompanies.map((c) => (
                <Link
                  key={c.id}
                  href={`/companies/${c.id}`}
                  className="flex items-center justify-between p-2 rounded-md border hover:bg-muted/50 transition-colors"
                >
                  <div className="min-w-0">
                    <p className="text-sm font-medium truncate">{c.companyName}</p>
                    <p className="text-xs text-muted-foreground capitalize">{c.pipelineStage.replace(/_/g, " ")}</p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <Badge variant={c.severity === "critical" ? "destructive" : "warning"} className="text-xs">
                      {c.daysStale}d stale
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
