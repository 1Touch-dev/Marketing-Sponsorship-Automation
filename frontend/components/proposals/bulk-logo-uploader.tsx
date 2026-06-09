"use client";

import { useState, useRef } from "react";
import { Upload, Loader2, CheckCircle2, XCircle } from "lucide-react";

interface BulkLogoResult {
  proposalId: string;
  proposalTitle: string;
  status: "uploading" | "done" | "error";
  message?: string;
}

interface ProposalItem {
  id: string;
  title: string;
  companyName: string;
  hasLogo: boolean;
}

interface BulkLogoUploaderProps {
  proposals: ProposalItem[];
}

export function BulkLogoUploader({ proposals }: BulkLogoUploaderProps) {
  const [open, setOpen] = useState(false);
  const [selectedProposals, setSelectedProposals] = useState<Set<string>>(new Set());
  const [logoFile, setLogoFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [results, setResults] = useState<BulkLogoResult[]>([]);
  const fileRef = useRef<HTMLInputElement>(null);

  const noLogoProposals = proposals.filter((p) => !p.hasLogo);

  const toggleProposal = (id: string) => {
    setSelectedProposals((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const selectAll = () => setSelectedProposals(new Set(noLogoProposals.map((p) => p.id)));
  const clearAll = () => setSelectedProposals(new Set());

  const handleUpload = async () => {
    if (!logoFile || selectedProposals.size === 0) return;
    setUploading(true);
    setResults([]);

    const targets = noLogoProposals.filter((p) => selectedProposals.has(p.id));

    for (const p of targets) {
      setResults((prev) => [...prev, { proposalId: p.id, proposalTitle: p.title, status: "uploading" }]);
      try {
        const formData = new FormData();
        formData.append("file", logoFile);
        // Use the correct per-proposal upload endpoint (also updates companies.logo_url)
        const res = await fetch(`/api/proposals/${p.id}/upload-asset`, { method: "POST", body: formData });
        if (res.ok) {
          setResults((prev) =>
            prev.map((r) => r.proposalId === p.id ? { ...r, status: "done" } : r)
          );
        } else {
          const err = await res.json().catch(() => ({ error: `HTTP ${res.status}` }));
          setResults((prev) =>
            prev.map((r) => r.proposalId === p.id ? { ...r, status: "error", message: err.error ?? `HTTP ${res.status}` } : r)
          );
        }
      } catch {
        setResults((prev) =>
          prev.map((r) => r.proposalId === p.id ? { ...r, status: "error", message: "Network error" } : r)
        );
      }
    }
    setUploading(false);
  };

  if (noLogoProposals.length === 0) return null;

  return (
    <div className="mb-5">
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-2 text-sm font-medium text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-4 py-2.5 hover:bg-amber-100 transition-colors"
      >
        <Upload className="h-4 w-4" />
        Bulk Logo Upload — {noLogoProposals.length} proposal{noLogoProposals.length !== 1 ? "s" : ""} without logo
      </button>

      {open && (
        <div className="mt-3 rounded-xl border border-amber-200 bg-white shadow-sm p-5 space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="font-semibold text-slate-800">Upload logo to multiple proposals at once</h3>
            <button onClick={() => setOpen(false)} className="text-slate-400 hover:text-slate-600 text-lg leading-none">×</button>
          </div>

          {/* File picker */}
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">Select logo file (PNG/SVG recommended)</label>
            <input
              ref={fileRef}
              type="file"
              accept="image/*,.svg"
              onChange={(e) => setLogoFile(e.target.files?.[0] ?? null)}
              className="block w-full text-sm text-slate-500 file:mr-3 file:rounded-md file:border-0 file:bg-green-50 file:px-3 file:py-1.5 file:text-sm file:font-medium file:text-green-700 hover:file:bg-green-100"
            />
            {logoFile && (
              <p className="text-xs text-green-700 mt-1">Selected: {logoFile.name} ({(logoFile.size / 1024).toFixed(0)} KB)</p>
            )}
          </div>

          {/* Proposal selector */}
          <div>
            <div className="flex items-center gap-3 mb-2">
              <span className="text-xs font-medium text-slate-600">Select proposals to update:</span>
              <button onClick={selectAll} className="text-xs text-blue-600 hover:underline">Select all</button>
              <button onClick={clearAll} className="text-xs text-slate-500 hover:underline">Clear</button>
            </div>
            <div className="max-h-48 overflow-y-auto rounded-lg border border-slate-200 divide-y divide-slate-100">
              {noLogoProposals.map((p) => (
                <label key={p.id} className="flex items-center gap-3 px-3 py-2 hover:bg-slate-50 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={selectedProposals.has(p.id)}
                    onChange={() => toggleProposal(p.id)}
                    className="rounded"
                  />
                  <span className="text-sm text-slate-700 flex-1 min-w-0 truncate">{p.title}</span>
                  <span className="text-xs text-slate-400 shrink-0">{p.companyName}</span>
                </label>
              ))}
            </div>
          </div>

          {/* Results */}
          {results.length > 0 && (
            <div className="space-y-1 max-h-32 overflow-y-auto">
              {results.map((r) => (
                <div key={r.proposalId} className="flex items-center gap-2 text-xs">
                  {r.status === "uploading" && <Loader2 className="h-3 w-3 animate-spin text-blue-500" />}
                  {r.status === "done" && <CheckCircle2 className="h-3 w-3 text-green-600" />}
                  {r.status === "error" && <XCircle className="h-3 w-3 text-red-500" />}
                  <span className={r.status === "error" ? "text-red-600" : r.status === "done" ? "text-green-700" : "text-blue-600"}>
                    {r.proposalTitle}{" "}
                    {r.status === "done" && "— ✓ Done"}
                    {r.status === "uploading" && "— Uploading…"}
                    {r.status === "error" && `— ${r.message ?? "Upload failed"}`}
                  </span>
                </div>
              ))}
            </div>
          )}

          <div className="flex gap-3 pt-1">
            <button
              onClick={handleUpload}
              disabled={!logoFile || selectedProposals.size === 0 || uploading}
              className="flex items-center gap-2 rounded-lg bg-green-700 text-white px-4 py-2 text-sm font-medium hover:bg-green-800 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
              Upload to {selectedProposals.size} proposal{selectedProposals.size !== 1 ? "s" : ""}
            </button>
            <button
              onClick={() => { setOpen(false); setResults([]); setLogoFile(null); setSelectedProposals(new Set()); }}
              className="rounded-lg border border-slate-200 px-4 py-2 text-sm text-slate-600 hover:bg-slate-50 transition-colors"
            >
              Close
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
