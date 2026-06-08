"use client";

import { useState, useRef } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toaster";
import {
  Upload, Download, CheckCircle2, AlertCircle,
  Info, Loader2, FileText, X,
} from "lucide-react";

interface ImportResult {
  row: number;
  company_name: string;
  status: "created" | "duplicate" | "error";
  message?: string;
}

interface ImportSummary {
  total: number;
  created: number;
  duplicates: number;
  errors: number;
}

export function BulkImportButton() {
  const router = useRouter();
  const { toast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState<ImportResult[] | null>(null);
  const [summary, setSummary] = useState<ImportSummary | null>(null);

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.name.endsWith(".csv")) {
      toast({ variant: "destructive", title: "Invalid file", description: "Please upload a .csv file." });
      return;
    }

    setLoading(true);
    setResults(null);
    setSummary(null);

    try {
      const formData = new FormData();
      formData.append("file", file);

      const res = await fetch("/api/companies/bulk-import", {
        method: "POST",
        body: formData,
      });
      const json = await res.json();

      if (!res.ok) throw new Error(json?.error ?? `Upload failed (${res.status})`);

      setSummary(json.summary);
      setResults(json.results);

      if (json.summary.created > 0) {
        toast({
          variant: "success",
          title: `${json.summary.created} companies imported`,
          description: json.summary.duplicates ? `${json.summary.duplicates} skipped (duplicates)` : undefined,
        });
        router.refresh();
      } else {
        toast({
          variant: "destructive",
          title: "No new companies imported",
          description: json.summary.duplicates ? `${json.summary.duplicates} duplicates found.` : "Check file format.",
        });
      }
    } catch (err) {
      toast({
        variant: "destructive",
        title: "Import failed",
        description: err instanceof Error ? err.message : "Unknown error",
      });
    } finally {
      setLoading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  return (
    <div className="inline-flex flex-col items-start gap-2">
      <div className="flex items-center gap-2">
        {/* Hidden input + label button — exact same pattern as /contacts */}
        <label htmlFor="company-bulk-csv-input" className="inline-flex">
          <input
            id="company-bulk-csv-input"
            ref={fileInputRef}
            type="file"
            accept=".csv"
            className="sr-only"
            disabled={loading}
            onChange={handleFileChange}
          />
          <Button
            variant="outline"
            size="sm"
            disabled={loading}
            className="gap-2 cursor-pointer"
            asChild
          >
            <span>
              {loading
                ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                : <Upload className="h-3.5 w-3.5" />}
              {loading ? "Importing…" : "Bulk import CSV"}
            </span>
          </Button>
        </label>

        {/* Template download */}
        <a
          href="/api/companies/bulk-import"
          download="companies_template.csv"
          className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground px-2 py-1.5 rounded border border-dashed border-slate-300 dark:border-slate-600 hover:border-slate-400 transition-colors"
          title="Download CSV template — company_name, industry, website, country, notes"
        >
          <Download className="h-3.5 w-3.5" />
          CSV template
        </a>

        {results && (
          <button
            onClick={() => { setResults(null); setSummary(null); }}
            className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1"
            title="Clear results"
          >
            <X className="h-3.5 w-3.5" /> Clear
          </button>
        )}
      </div>

      {/* Inline result banner — same style as contacts */}
      {summary && results && (
        <div className={`rounded-lg border p-3 text-sm flex items-start gap-2 w-full max-w-lg ${
          summary.errors === 0 ? "bg-green-50 border-green-200 text-green-800" : "bg-amber-50 border-amber-200 text-amber-800"
        }`}>
          {summary.errors === 0
            ? <CheckCircle2 className="h-4 w-4 flex-shrink-0 mt-0.5" />
            : <AlertCircle className="h-4 w-4 flex-shrink-0 mt-0.5" />}
          <div className="flex-1 min-w-0">
            <strong>{summary.created} company(s) imported.</strong>
            {summary.duplicates > 0 && (
              <span className="ml-1 font-normal">{summary.duplicates} skipped (duplicates).</span>
            )}
            {summary.errors > 0 && (
              <ul className="mt-1 list-disc list-inside space-y-0.5">
                {results
                  .filter((r) => r.status === "error")
                  .slice(0, 5)
                  .map((r) => (
                    <li key={`${r.row}-${r.company_name}`} className="truncate">
                      Row {r.row}: {r.company_name} — {r.message}
                    </li>
                  ))}
                {summary.errors > 5 && <li>…and {summary.errors - 5} more errors</li>}
              </ul>
            )}
          </div>
        </div>
      )}

      {/* Columns hint */}
      <p className="text-[11px] text-muted-foreground flex items-center gap-1">
        <FileText className="h-3 w-3 flex-shrink-0" />
        Columns: <span className="font-mono">company_name</span> (required),{" "}
        industry, website, country, notes
      </p>
    </div>
  );
}
