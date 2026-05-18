"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { AlertCircle, Play } from "lucide-react";

export function MigrationBanner() {
  const [applying, setApplying] = useState(false);
  const [result, setResult] = useState<string | null>(null);

  async function applyMigration() {
    setApplying(true);
    try {
      const r0009 = await fetch("/api/internal/apply-sql", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ migration: "0009" }),
      });
      const r0010 = await fetch("/api/internal/apply-sql", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ migration: "0010" }),
      });
      const d0010 = await r0010.json();
      if (d0010.success) {
        // Seed data
        for (const table of ["coritiba_metrics", "inventory_items", "social_projects"]) {
          await fetch("/api/internal/apply-sql", {
            method: "PUT",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ table }),
          });
        }
        setResult("success");
        window.location.reload();
      } else {
        setResult(d0010.error || "Migration failed");
      }
    } catch (err) {
      setResult(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setApplying(false);
    }
  }

  return (
    <div className="rounded-lg border border-amber-200 bg-amber-50 p-4">
      <div className="flex items-start gap-3">
        <AlertCircle className="h-5 w-5 text-amber-600 shrink-0 mt-0.5" />
        <div className="flex-1">
          <p className="text-sm font-medium text-amber-800">Database Migration Required</p>
          <p className="text-sm text-amber-700 mt-1">
            The commercial intelligence tables have not been applied yet. Click below to apply migrations automatically.
            If this fails, copy the SQL from <code className="bg-amber-100 px-1 rounded">/api/internal/apply-migration</code> and run it in the Supabase Dashboard.
          </p>
          {result === "success" ? (
            <p className="text-sm text-green-700 mt-2 font-medium">✓ Migration applied successfully! Refreshing...</p>
          ) : result ? (
            <p className="text-sm text-red-700 mt-2">Error: {result}. Please apply manually via Supabase Dashboard.</p>
          ) : (
            <Button variant="outline" size="sm" className="mt-2" onClick={applyMigration} disabled={applying}>
              <Play className="h-4 w-4 mr-1" />
              {applying ? "Applying…" : "Apply Migrations 0009 + 0010"}
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
