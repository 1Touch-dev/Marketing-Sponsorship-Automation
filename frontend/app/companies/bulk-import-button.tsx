"use client";

import { useState, useRef } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toaster";
import {
  Upload, Download, X, CheckCircle2, AlertCircle,
  Info, Loader2, FileSpreadsheet,
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
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState<ImportResult[] | null>(null);
  const [summary, setSummary] = useState<ImportSummary | null>(null);
  const [dragOver, setDragOver] = useState(false);

  function handleFileSelect(file: File) {
    if (!file.name.endsWith(".csv")) {
      toast({ variant: "destructive", title: "Invalid file", description: "Please upload a .csv file." });
      return;
    }
    doUpload(file);
  }

  async function doUpload(file: File) {
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

      if (!res.ok) {
        throw new Error(json?.error ?? `Upload failed (${res.status})`);
      }

      setSummary(json.summary);
      setResults(json.results);

      if (json.summary.created > 0) {
        toast({
          variant: "success",
          title: `${json.summary.created} companies imported`,
          description: json.summary.duplicates
            ? `${json.summary.duplicates} skipped (duplicates)`
            : undefined,
        });
        router.refresh();
      } else {
        toast({
          variant: "destructive",
          title: "No new companies imported",
          description: json.summary.duplicates
            ? `${json.summary.duplicates} duplicates found.`
            : "Check file format.",
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

  function downloadTemplate() {
    window.open("/api/companies/bulk-import", "_blank");
  }

  function close() {
    setOpen(false);
    setResults(null);
    setSummary(null);
  }

  return (
    <>
      <Button variant="outline" size="sm" onClick={() => setOpen(true)} className="gap-2">
        <Upload className="h-3.5 w-3.5" /> Bulk import CSV
      </Button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-background border rounded-xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
            {/* Header */}
            <div className="flex items-center justify-between p-5 border-b">
              <div>
                <h2 className="font-semibold text-lg flex items-center gap-2">
                  <FileSpreadsheet className="h-5 w-5 text-primary" />
                  Bulk import companies
                </h2>
                <p className="text-sm text-muted-foreground mt-0.5">
                  Upload a CSV to add multiple companies at once
                </p>
              </div>
              <button
                onClick={close}
                className="rounded-full p-1.5 hover:bg-accent transition-colors"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="p-5 space-y-4">
              {/* Template download */}
              <div className="flex items-start gap-3 p-3 rounded-lg bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800">
                <Info className="h-4 w-4 text-blue-600 mt-0.5 flex-shrink-0" />
                <div className="text-sm">
                  <div className="font-medium text-blue-700 dark:text-blue-300">Required CSV columns</div>
                  <div className="text-blue-600 dark:text-blue-400 mt-0.5 font-mono text-xs">
                    company_name, industry, website, country, notes
                  </div>
                  <button
                    onClick={downloadTemplate}
                    className="mt-1.5 inline-flex items-center gap-1 text-xs font-medium text-blue-700 dark:text-blue-300 hover:underline"
                  >
                    <Download className="h-3 w-3" /> Download template
                  </button>
                </div>
              </div>

              {/* Drop zone — use <label> so clicking it reliably opens the OS file picker */}
              {!results && (
                <label
                  htmlFor="company-bulk-csv"
                  className={`block border-2 border-dashed rounded-lg p-8 text-center transition-colors ${
                    loading
                      ? "cursor-default"
                      : "cursor-pointer hover:border-primary/50 hover:bg-accent/30"
                  } ${dragOver ? "border-primary bg-primary/5" : "border-muted-foreground/25"}`}
                  onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
                  onDragLeave={() => setDragOver(false)}
                  onDrop={(e) => {
                    e.preventDefault();
                    setDragOver(false);
                    const file = e.dataTransfer.files[0];
                    if (file) handleFileSelect(file);
                  }}
                >
                  {loading ? (
                    <div className="flex flex-col items-center gap-2">
                      <Loader2 className="h-8 w-8 text-primary animate-spin" />
                      <div className="text-sm text-muted-foreground">Importing companies…</div>
                    </div>
                  ) : (
                    <>
                      <Upload className="h-8 w-8 text-muted-foreground mx-auto mb-2" />
                      <div className="text-sm font-medium">Drop CSV here or click to browse</div>
                      <div className="text-xs text-muted-foreground mt-1">
                        Max 500 rows per import
                      </div>
                    </>
                  )}
                  <input
                    id="company-bulk-csv"
                    ref={fileInputRef}
                    type="file"
                    accept=".csv"
                    className="sr-only"
                    disabled={loading}
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) handleFileSelect(file);
                    }}
                  />
                </label>
              )}

              {/* Summary */}
              {summary && (
                <div className="grid grid-cols-4 gap-2 text-center">
                  <div className="rounded-lg bg-muted p-2">
                    <div className="text-lg font-bold">{summary.total}</div>
                    <div className="text-xs text-muted-foreground">Total</div>
                  </div>
                  <div className="rounded-lg bg-green-50 dark:bg-green-900/20 p-2">
                    <div className="text-lg font-bold text-green-700 dark:text-green-300">{summary.created}</div>
                    <div className="text-xs text-green-600 dark:text-green-400">Created</div>
                  </div>
                  <div className="rounded-lg bg-yellow-50 dark:bg-yellow-900/20 p-2">
                    <div className="text-lg font-bold text-yellow-700 dark:text-yellow-300">{summary.duplicates}</div>
                    <div className="text-xs text-yellow-600 dark:text-yellow-400">Skipped</div>
                  </div>
                  <div className="rounded-lg bg-red-50 dark:bg-red-900/20 p-2">
                    <div className="text-lg font-bold text-red-700 dark:text-red-300">{summary.errors}</div>
                    <div className="text-xs text-red-600 dark:text-red-400">Errors</div>
                  </div>
                </div>
              )}

              {/* Detailed results */}
              {results && results.length > 0 && (
                <div className="space-y-1 max-h-48 overflow-y-auto">
                  <div className="text-xs font-medium text-muted-foreground mb-1">Import details:</div>
                  {results.map((r) => (
                    <div
                      key={`${r.row}-${r.company_name}`}
                      className={`flex items-start gap-2 text-xs p-2 rounded-md ${
                        r.status === "created"
                          ? "bg-green-50 dark:bg-green-900/20"
                          : r.status === "duplicate"
                          ? "bg-yellow-50 dark:bg-yellow-900/20"
                          : "bg-red-50 dark:bg-red-900/20"
                      }`}
                    >
                      {r.status === "created" ? (
                        <CheckCircle2 className="h-3.5 w-3.5 text-green-600 flex-shrink-0 mt-0.5" />
                      ) : r.status === "duplicate" ? (
                        <Info className="h-3.5 w-3.5 text-yellow-600 flex-shrink-0 mt-0.5" />
                      ) : (
                        <AlertCircle className="h-3.5 w-3.5 text-red-600 flex-shrink-0 mt-0.5" />
                      )}
                      <div>
                        <span className="font-medium">Row {r.row}: {r.company_name}</span>
                        {r.message && (
                          <span className="text-muted-foreground"> — {r.message}</span>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* Actions */}
              <div className="flex gap-2 pt-2">
                {results && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      setResults(null);
                      setSummary(null);
                    }}
                    className="gap-2"
                  >
                    <Upload className="h-3.5 w-3.5" /> Import another file
                  </Button>
                )}
                <Button variant="outline" size="sm" onClick={close} className="ml-auto">
                  {results ? "Done" : "Cancel"}
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
