"use client";

import { useState, useRef } from "react";
import { Upload, Loader2, Trash2, CheckCircle2 } from "lucide-react";
import { useToast } from "@/components/ui/toaster";

interface UploadedAsset {
  url: string;
  name: string;
  path: string;
}

interface AssetUploaderProps {
  proposalId: string;
  existingAssets?: UploadedAsset[];
  /** URL of the logo currently used for generation (highlighted as active). */
  activeLogoUrl?: string | null;
  onUpload?: (asset: UploadedAsset) => void;
  /** Called after a delete with the new active logo URL (may be null). */
  onLogoChanged?: (url: string | null) => void;
}

export function AssetUploader({
  proposalId,
  existingAssets = [],
  activeLogoUrl,
  onUpload,
  onLogoChanged,
}: AssetUploaderProps) {
  const { toast } = useToast();
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [assets, setAssets] = useState<UploadedAsset[]>(existingAssets);
  const [dragOver, setDragOver] = useState(false);
  const [deletingPath, setDeletingPath] = useState<string | null>(null);

  async function uploadFile(file: File) {
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch(`/api/proposals/${proposalId}/upload-asset`, {
        method: "POST",
        body: fd,
      });
      const j = await res.json();
      if (!res.ok) throw new Error(j?.error ?? "Upload failed");
      const asset: UploadedAsset = { url: j.url, name: j.name, path: j.path };
      setAssets((prev) => [...prev, asset]);
      onUpload?.(asset);
      toast({
        variant: "success",
        title: "Logo updated",
        description: `${file.name} is now the active logo`,
      });
    } catch (err) {
      toast({ variant: "destructive", title: "Upload failed", description: err instanceof Error ? err.message : "Unknown error" });
    } finally {
      setUploading(false);
    }
  }

  function handleFiles(files: FileList | null) {
    if (!files?.length) return;
    Array.from(files).forEach(uploadFile);
  }

  async function deleteAsset(asset: UploadedAsset) {
    setDeletingPath(asset.path);
    try {
      const res = await fetch(`/api/proposals/${proposalId}/upload-asset`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ path: asset.path }),
      });
      const j = await res.json();
      if (!res.ok) throw new Error(j?.error ?? "Delete failed");
      setAssets((prev) => prev.filter((a) => a.path !== asset.path));
      onLogoChanged?.((j.logo_url as string | null) ?? null);
      toast({ variant: "success", title: "Removed", description: asset.name });
    } catch (err) {
      toast({
        variant: "destructive",
        title: "Delete failed",
        description: err instanceof Error ? err.message : "Unknown error",
      });
    } finally {
      setDeletingPath(null);
    }
  }

  return (
    <div className="space-y-3">
      <div
        className={`border-2 border-dashed rounded-xl p-6 text-center transition-colors cursor-pointer ${
          dragOver ? "border-primary bg-primary/5" : "border-slate-200 hover:border-slate-300"
        }`}
        onClick={() => inputRef.current?.click()}
        onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => { e.preventDefault(); setDragOver(false); handleFiles(e.dataTransfer.files); }}
      >
        {uploading ? (
          <div className="flex flex-col items-center gap-2">
            <Loader2 className="h-8 w-8 text-primary animate-spin" />
            <p className="text-sm text-slate-500">Uploading…</p>
          </div>
        ) : (
          <div className="flex flex-col items-center gap-2">
            <Upload className="h-8 w-8 text-slate-400" />
            <p className="text-sm font-medium text-slate-600">Upload logo or brand asset</p>
            <p className="text-xs text-slate-400">PNG, JPEG, WEBP, SVG — max 10 MB</p>
            <p className="text-[11px] text-slate-400">
              Uploading a new logo replaces the current one for all mockups
            </p>
          </div>
        )}
        <input
          ref={inputRef}
          type="file"
          className="hidden"
          accept="image/png,image/jpeg,image/webp,image/svg+xml,image/gif"
          multiple
          onChange={(e) => handleFiles(e.target.files)}
        />
      </div>

      {assets.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
          {assets.map((asset) => {
            const isActive = !!activeLogoUrl && asset.url === activeLogoUrl;
            const isDeleting = deletingPath === asset.path;
            return (
              <div
                key={asset.path}
                className={`relative group rounded-lg border overflow-hidden bg-slate-50 ${
                  isActive ? "border-green-500 ring-1 ring-green-500" : "border-slate-200"
                }`}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={asset.url}
                  alt={asset.name}
                  className="w-full h-20 object-contain p-2"
                  onError={(e) => {
                    (e.target as HTMLImageElement).style.display = "none";
                  }}
                />
                {isActive && (
                  <span className="absolute top-1 left-1 flex items-center gap-1 rounded-full bg-green-600 text-white text-[10px] font-medium px-1.5 py-0.5">
                    <CheckCircle2 className="h-3 w-3" /> Active
                  </span>
                )}
                <button
                  type="button"
                  onClick={() => deleteAsset(asset)}
                  disabled={isDeleting}
                  title="Delete this logo"
                  className="absolute top-1 right-1 rounded-full bg-white/90 hover:bg-red-500 hover:text-white text-red-500 p-1 shadow transition-colors disabled:opacity-60"
                >
                  {isDeleting ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <Trash2 className="h-3.5 w-3.5" />
                  )}
                </button>
                <div className="p-1 border-t border-slate-200">
                  <p className="text-xs text-slate-500 truncate">{asset.name}</p>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
