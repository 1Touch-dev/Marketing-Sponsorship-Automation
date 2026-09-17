"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toaster";
import { FileText, Upload, X, Loader2 } from "lucide-react";

interface DocumentEntry {
  url: string;
  path: string;
  name: string;
  size: number;
  uploaded_at: string;
}

function formatSize(bytes: number): string {
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function DocumentBundleManager({
  proposalId,
  initialDocuments,
}: {
  proposalId: string;
  initialDocuments: DocumentEntry[];
}) {
  const router = useRouter();
  const { toast } = useToast();
  const [documents, setDocuments] = useState(initialDocuments);
  const [uploading, setUploading] = useState(false);
  const [deletingPath, setDeletingPath] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  async function handleUpload(file: File) {
    setUploading(true);
    try {
      const formData = new FormData();
      formData.append("file", file);
      const res = await fetch(`/api/proposals/${proposalId}/documents`, { method: "POST", body: formData });
      const j = await res.json();
      if (!res.ok) throw new Error(j?.error ?? "Upload failed");
      setDocuments((prev) => [...prev, j.document]);
      toast({ variant: "success", title: "Document added" });
      router.refresh();
    } catch (err) {
      toast({ variant: "destructive", title: "Upload failed", description: err instanceof Error ? err.message : undefined });
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  async function handleDelete(path: string) {
    setDeletingPath(path);
    try {
      const res = await fetch(`/api/proposals/${proposalId}/documents`, {
        method: "DELETE",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ path }),
      });
      if (!res.ok) throw new Error((await res.json())?.error ?? "Delete failed");
      setDocuments((prev) => prev.filter((d) => d.path !== path));
      router.refresh();
    } catch (err) {
      toast({ variant: "destructive", title: "Delete failed", description: err instanceof Error ? err.message : undefined });
    } finally {
      setDeletingPath(null);
    }
  }

  return (
    <div className="space-y-2">
      {documents.map((doc) => (
        <div key={doc.path} className="flex items-center justify-between gap-2 rounded-md bg-muted/40 px-2.5 py-2">
          <div className="flex items-center gap-2 min-w-0">
            <FileText className="h-4 w-4 text-slate-400 shrink-0" />
            <div className="min-w-0">
              <div className="text-xs font-medium truncate">{doc.name}</div>
              <div className="text-[11px] text-muted-foreground">{formatSize(doc.size)}</div>
            </div>
          </div>
          <button
            onClick={() => handleDelete(doc.path)}
            disabled={deletingPath === doc.path}
            className="text-slate-400 hover:text-red-600 shrink-0"
          >
            {deletingPath === doc.path ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <X className="h-3.5 w-3.5" />}
          </button>
        </div>
      ))}

      <input
        ref={fileInputRef}
        type="file"
        accept=".pdf,.pptx,.docx,.xlsx,.doc,.ppt,.xls,.zip"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) handleUpload(file);
        }}
      />
      <Button
        size="sm"
        variant="outline"
        className="w-full gap-1.5"
        disabled={uploading}
        onClick={() => fileInputRef.current?.click()}
      >
        {uploading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Upload className="h-3.5 w-3.5" />}
        {uploading ? "Uploading…" : "Add document"}
      </Button>
      <p className="text-[11px] text-muted-foreground">PDF, PPTX, DOCX, XLSX, ZIP — max 25 MB each.</p>
    </div>
  );
}
