"use client";

import { useState, useRef } from "react";
import { Upload, Loader2 } from "lucide-react";
import { useToast } from "@/components/ui/toaster";

interface UploadedAsset {
  url: string;
  name: string;
  path: string;
}

interface AssetUploaderProps {
  proposalId: string;
  existingAssets?: UploadedAsset[];
  onUpload?: (asset: UploadedAsset) => void;
}

export function AssetUploader({ proposalId, existingAssets = [], onUpload }: AssetUploaderProps) {
  const { toast } = useToast();
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [assets, setAssets] = useState<UploadedAsset[]>(existingAssets);
  const [dragOver, setDragOver] = useState(false);

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
      toast({ variant: "success", title: "Asset uploaded", description: file.name });
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
          {assets.map((asset) => (
            <div key={asset.path} className="relative group rounded-lg border border-slate-200 overflow-hidden bg-slate-50">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={asset.url}
                alt={asset.name}
                className="w-full h-20 object-contain p-2"
                onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
              />
              <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                <p className="text-white text-xs font-medium px-1 text-center truncate">{asset.name}</p>
              </div>
              <div className="p-1 border-t border-slate-200">
                <p className="text-xs text-slate-500 truncate">{asset.name}</p>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
