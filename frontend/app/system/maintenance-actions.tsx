"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Activity, Shield, Database, RefreshCw, CheckCircle2, Wrench } from "lucide-react";

interface Props {
  failedCount: number;
  stuckCount: number;
  competitorCount: number;
  testCompanyCount: number;
}

type ActionResult = {
  success: boolean;
  message?: string;
  resolved?: number;
  archived?: number;
  stale_resolved?: number;
  error?: string;
};

const ACTIONS = [
  {
    id: "resolve_failed_workflows",
    label: "Resolve Failed Workflows",
    description: "Mark all failed workflow events as completed (acknowledged/resolved)",
    icon: <Activity className="h-4 w-4" />,
    variant: "default" as const,
    countKey: "failedCount",
  },
  {
    id: "archive_competitor_proposals",
    label: "Archive Competitor Proposals",
    description: "Move all proposals referencing Athletico Paranaense, Corinthians, etc. to rejected/archived status",
    icon: <Shield className="h-4 w-4" />,
    variant: "destructive" as const,
    countKey: "competitorCount",
  },
  {
    id: "archive_test_companies",
    label: "Archive Test Companies",
    description: "Close all test/diagnostic/sample companies to clean the active company list",
    icon: <Database className="h-4 w-4" />,
    variant: "outline" as const,
    countKey: "testCompanyCount",
  },
  {
    id: "refresh_workflow_health",
    label: "Fix Stuck Workflows",
    description: "Auto-fail workflow events that have been stuck in 'processing' for more than 30 minutes",
    icon: <RefreshCw className="h-4 w-4" />,
    variant: "outline" as const,
    countKey: "stuckCount",
  },
];

export function MaintenanceActions({ failedCount, stuckCount, competitorCount, testCompanyCount }: Props) {
  const router = useRouter();
  const [running, setRunning] = useState<string | null>(null);
  const [results, setResults] = useState<Record<string, ActionResult>>({});

  const counts: Record<string, number> = { failedCount, stuckCount, competitorCount, testCompanyCount };

  async function runAction(actionId: string) {
    setRunning(actionId);
    try {
      const res = await fetch("/api/system/maintenance", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: actionId }),
      });
      const data = await res.json();
      setResults((r) => ({ ...r, [actionId]: data }));
      router.refresh();
    } catch (err) {
      setResults((r) => ({ ...r, [actionId]: { success: false, error: String(err) } }));
    } finally {
      setRunning(null);
    }
  }

  async function runAll() {
    for (const action of ACTIONS) {
      setRunning(action.id);
      try {
        const res = await fetch("/api/system/maintenance", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ action: action.id }),
        });
        const data = await res.json();
        setResults((r) => ({ ...r, [action.id]: data }));
      } catch (err) {
        setResults((r) => ({ ...r, [action.id]: { success: false, error: String(err) } }));
      }
    }
    setRunning(null);
    router.refresh();
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Wrench className="h-4 w-4" />
            Maintenance Actions
          </div>
          <Button
            size="sm"
            onClick={runAll}
            disabled={!!running}
            variant="default"
          >
            <CheckCircle2 className="h-4 w-4 mr-1" />
            {running ? "Running…" : "Run All Fixes"}
          </Button>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {ACTIONS.map((action) => {
          const count = counts[action.countKey] ?? 0;
          const result = results[action.id];
          const isRunning = running === action.id;

          return (
            <div key={action.id} className="flex items-start justify-between gap-3 p-3 rounded-lg border bg-muted/30">
              <div className="flex items-start gap-3 min-w-0">
                <div className="mt-0.5 text-muted-foreground">{action.icon}</div>
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-medium">{action.label}</p>
                    {count > 0 && (
                      <Badge variant="destructive" className="text-xs">{count} pending</Badge>
                    )}
                    {count === 0 && !result && (
                      <Badge variant="outline" className="text-xs text-green-700 border-green-300">Clean</Badge>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground mt-0.5">{action.description}</p>
                  {result && (
                    <p className={`text-xs mt-1 ${result.success ? "text-green-700" : "text-red-600"}`}>
                      {result.success
                        ? `✓ ${result.resolved !== undefined ? `${result.resolved} resolved` : result.archived !== undefined ? `${result.archived} archived` : result.stale_resolved !== undefined ? `${result.stale_resolved} fixed` : "Done"} ${result.message ?? ""}`
                        : `✗ ${result.error ?? "Failed"}`}
                    </p>
                  )}
                </div>
              </div>
              <Button
                size="sm"
                variant={action.variant}
                onClick={() => runAction(action.id)}
                disabled={!!running}
                className="shrink-0"
              >
                {isRunning ? "Running…" : "Run"}
              </Button>
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}
