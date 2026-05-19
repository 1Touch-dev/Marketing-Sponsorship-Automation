"use client";

import React, { useState, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toaster";
import { Search, Filter, Archive, CheckCircle, XCircle, Clock, ImageIcon, Loader2, Tag, Link2 } from "lucide-react";

export type Asset = {
  id: string; job_type: string; status: string; prompt: string;
  image_url?: string; proposal_id?: string; company_id?: string;
  created_at: string; metadata?: Record<string, unknown>;
};

const STATUS_CONFIG: Record<string, { label: string; color: string; icon: React.ElementType }> = {
  completed: { label: "Approved", color: "text-green-600 bg-green-50 dark:bg-green-900/30", icon: CheckCircle },
  pending_approval: { label: "Pending", color: "text-amber-600 bg-amber-50 dark:bg-amber-900/30", icon: Clock },
  approved: { label: "Approved", color: "text-green-600 bg-green-50 dark:bg-green-900/30", icon: CheckCircle },
  rejected: { label: "Rejected", color: "text-red-600 bg-red-50 dark:bg-red-900/30", icon: XCircle },
  archived: { label: "Archived", color: "text-muted-foreground bg-muted", icon: Archive },
  generating: { label: "Generating", color: "text-blue-600 bg-blue-50 dark:bg-blue-900/30", icon: Loader2 },
  failed: { label: "Failed", color: "text-red-600 bg-red-50 dark:bg-red-900/30", icon: XCircle },
};

export function AssetLibraryClient({ assets, proposals, companies }: {
  assets: Asset[];
  proposals: Array<{ id: string; title: string }>;
  companies: Array<{ id: string; company_name: string }>;
}) {
  const { toast } = useToast();
  const [search, setSearch] = useState("");
  const [filterStatus, setFilterStatus] = useState("all");
  const [selected, setSelected] = useState<string[]>([]);
  const [updating, setUpdating] = useState<string | null>(null);
  const [preview, setPreview] = useState<Asset | null>(null);

  const filtered = useMemo(() => {
    return assets.filter(a => {
      const matchesSearch = !search || a.prompt?.toLowerCase().includes(search.toLowerCase()) || a.job_type?.includes(search.toLowerCase());
      const matchesStatus = filterStatus === "all" || a.status === filterStatus;
      return matchesSearch && matchesStatus;
    });
  }, [assets, search, filterStatus]);

  async function updateAsset(id: string, updates: Record<string, unknown>) {
    setUpdating(id);
    try {
      await fetch("/api/assets", { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ id, ...updates }) });
      toast({ variant: "success", title: "Updated" });
      setTimeout(() => window.location.reload(), 800);
    } finally { setUpdating(null); }
  }

  const companyName = (id?: string) => companies.find(c => c.id === id)?.company_name ?? "—";
  const proposalTitle = (id?: string) => {
    const p = proposals.find(p => p.id === id);
    return p ? p.title.slice(0, 30) + (p.title.length > 30 ? "…" : "") : "—";
  };

  const statusList = ["all", "completed", "pending_approval", "generating", "rejected", "archived"];

  return (
    <div className="space-y-4">
      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[200px] max-w-sm">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search assets…" className="pl-8 pr-3 py-1.5 w-full rounded-lg border bg-card text-sm outline-none focus:ring-2 ring-primary/30" />
        </div>
        <div className="flex gap-1 flex-wrap">
          {statusList.map(s => {
            const cfg = STATUS_CONFIG[s];
            return (
              <button key={s} onClick={() => setFilterStatus(s)}
                className={`px-3 py-1 rounded-full text-xs border transition-colors capitalize ${filterStatus === s ? "bg-primary text-primary-foreground border-primary" : "bg-card hover:bg-accent border-border"}`}>
                {cfg?.label ?? s}
              </button>
            );
          })}
        </div>
      </div>

      {/* Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
        {filtered.map(asset => {
          const cfg = STATUS_CONFIG[asset.status] ?? STATUS_CONFIG.pending_approval;
          const StatusIcon = cfg.icon;
          return (
            <div key={asset.id} className="rounded-xl border bg-card overflow-hidden group hover:shadow-md transition-all">
              {/* Preview */}
              <div className="aspect-video bg-muted relative overflow-hidden cursor-pointer" onClick={() => setPreview(asset)}>
                {asset.image_url ? (
                  <img src={asset.image_url} alt={asset.prompt?.slice(0,80) ?? "Asset preview"} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300" />
                ) : (
                  <div className="flex items-center justify-center h-full text-muted-foreground">
                    <ImageIcon className="h-8 w-8 opacity-30" aria-hidden="true" />
                  </div>
                )}
                <div className={`absolute top-2 right-2 flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium ${cfg.color}`}>
                  <StatusIcon className="h-2.5 w-2.5" />
                  {cfg.label}
                </div>
              </div>

              {/* Info */}
              <div className="p-3 space-y-2">
                <div className="text-xs font-medium line-clamp-2">{asset.prompt ?? "No prompt"}</div>
                <div className="flex items-center gap-1 text-[10px] text-muted-foreground">
                  <Tag className="h-2.5 w-2.5" />
                  <span className="capitalize">{asset.job_type?.replace(/_/g, " ")}</span>
                  {asset.company_id && <><span>·</span><Link2 className="h-2.5 w-2.5" /><span className="truncate">{companyName(asset.company_id)}</span></>}
                </div>
                <div className="text-[10px] text-muted-foreground">{new Date(asset.created_at).toLocaleDateString("pt-BR")}</div>

                {/* Actions */}
                <div className="flex gap-1 pt-1">
                  {asset.status === "pending_approval" && (
                    <Button size="sm" variant="outline" className="h-6 px-2 text-[10px] gap-1 text-green-600 border-green-200" onClick={() => updateAsset(asset.id, { status: "approved" })} disabled={updating === asset.id}>
                      <CheckCircle className="h-2.5 w-2.5" /> Approve
                    </Button>
                  )}
                  {asset.status !== "archived" && (
                    <Button size="sm" variant="ghost" className="h-6 px-2 text-[10px]" onClick={() => updateAsset(asset.id, { status: "archived" })} disabled={updating === asset.id}>
                      <Archive className="h-2.5 w-2.5" />
                    </Button>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {filtered.length === 0 && (
        <div className="text-center py-16 text-muted-foreground">
          <ImageIcon className="h-12 w-12 mx-auto mb-3 opacity-20" aria-hidden="true" />
          <p className="text-sm">No assets found.</p>
          <Button size="sm" variant="outline" className="mt-3" asChild>
            <a href="/media-generation">Create first asset →</a>
          </Button>
        </div>
      )}

      {/* Preview modal */}
      {preview && (
        <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4" onClick={() => setPreview(null)}>
          <div className="bg-card rounded-2xl overflow-hidden max-w-2xl w-full shadow-2xl" onClick={e => e.stopPropagation()}>
            {preview.image_url ? <img src={preview.image_url} alt={preview.prompt?.slice(0,80) ?? "Preview"} className="w-full" /> : <div className="aspect-video bg-muted flex items-center justify-center"><ImageIcon className="h-16 w-16 opacity-20" aria-hidden="true" /></div>}
            <div className="p-4 space-y-2">
              <p className="text-sm">{preview.prompt}</p>
              <div className="flex items-center justify-between text-xs text-muted-foreground">
                <span className="capitalize">{preview.job_type?.replace(/_/g, " ")}</span>
                <Button size="sm" variant="outline" onClick={() => setPreview(null)}>Close</Button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
