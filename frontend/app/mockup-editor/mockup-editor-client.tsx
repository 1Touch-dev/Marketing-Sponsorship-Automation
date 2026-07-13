"use client";

import React, { useState, useRef, useCallback, useEffect } from "react";
import dynamic from "next/dynamic";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { useToast } from "@/components/ui/toaster";
import {
  Download, Plus, Trash2,
  Image as ImageIcon, Layers, RefreshCw,
  Undo2, Redo2, ZoomIn, ZoomOut, Paperclip, CheckCircle2,
  HelpCircle, Keyboard, X,
} from "lucide-react";

// Dynamically import Konva components to avoid SSR issues
const KonvaCanvas = dynamic(
  () => import("./konva-canvas").then(m => m.KonvaCanvas),
  { ssr: false, loading: () => <div className="flex items-center justify-center w-full h-full min-h-[300px]"><div className="text-white/40 text-sm">Loading canvas…</div></div> }
);

// Template type is defined below with TEMPLATES

type TemplateCategory = "Jersey" | "Stadium" | "Social" | "Digital" | "Print";

type Template = {
  id: string;
  label: string;
  description: string;
  bgColor: string;
  accentColor: string;
  width: number;
  height: number;
  category: TemplateCategory;
  categoryIcon: string;
  zones: Array<{ id: string; label: string; tooltip: string; x: number; y: number; w: number; h: number; color: string }>;
};

const CATEGORY_COLORS: Record<TemplateCategory, string> = {
  Jersey:  "bg-green-600",
  Stadium: "bg-blue-700",
  Social:  "bg-purple-600",
  Digital: "bg-orange-600",
  Print:   "bg-slate-600",
};

const CATEGORY_ICONS: Record<TemplateCategory, string> = {
  Jersey:  "👕",
  Stadium: "🏟️",
  Social:  "📱",
  Digital: "🖥️",
  Print:   "📄",
};

// Templates with predefined sponsor placement zones
const TEMPLATES: Template[] = [
  {
    id: "jersey", label: "Jersey — Chest", description: "Coritiba FC jersey front",
    bgColor: "#1a5e2a", accentColor: "#22c55e", width: 400, height: 500,
    category: "Jersey", categoryIcon: "👕",
    zones: [
      { id: "chest", label: "Chest — Principal Sponsor", tooltip: "Main chest logo — visible during all match broadcasts and photos", x: 120, y: 140, w: 160, h: 80, color: "rgba(255,255,255,0.15)" },
      { id: "sleeve_l", label: "Left Sleeve", tooltip: "Left sleeve — visible in close-up and action shots", x: 20, y: 180, w: 80, h: 50, color: "rgba(255,255,255,0.1)" },
      { id: "sleeve_r", label: "Right Sleeve", tooltip: "Right sleeve — secondary placement on playing kit", x: 300, y: 180, w: 80, h: 50, color: "rgba(255,255,255,0.1)" },
    ],
  },
  {
    id: "led_board", label: "LED Perimeter Board", description: "Stadium LED board at Couto Pereira",
    bgColor: "#0d1b2a", accentColor: "#06b6d4", width: 700, height: 150,
    category: "Stadium", categoryIcon: "🏟️",
    zones: [
      { id: "main", label: "LED Board — Full Length", tooltip: "Pitchside LED board — visible throughout the match on all broadcast cameras", x: 50, y: 25, w: 600, h: 100, color: "rgba(0,200,100,0.2)" },
    ],
  },
  {
    id: "social_post", label: "Social Post (1:1)", description: "Instagram square post",
    bgColor: "#0f3d1a", accentColor: "#a855f7", width: 500, height: 500,
    category: "Social", categoryIcon: "📱",
    zones: [
      { id: "logo_area", label: "Center Logo Zone", tooltip: "Primary sponsor logo — center of post, max visual impact", x: 150, y: 150, w: 200, h: 100, color: "rgba(255,255,255,0.15)" },
      { id: "bottom_bar", label: "Bottom Sponsor Bar", tooltip: "Strip at bottom for sponsor branding alongside Coritiba mark", x: 0, y: 420, w: 500, h: 80, color: "rgba(255,255,255,0.1)" },
    ],
  },
  {
    id: "press_backdrop", label: "Press Backdrop (Sponsor Wall)", description: "Post-match interview backdrop",
    bgColor: "#1a2940", accentColor: "#f59e0b", width: 600, height: 400,
    category: "Print", categoryIcon: "📄",
    zones: [
      { id: "row1", label: "Logo Row 1 — Top", tooltip: "Top row of repeating sponsor grid — best TV pickup during player interviews", x: 30, y: 80, w: 540, h: 100, color: "rgba(255,255,255,0.1)" },
      { id: "row2", label: "Logo Row 2 — Middle", tooltip: "Middle row — standard placement in sponsor wall", x: 30, y: 210, w: 540, h: 100, color: "rgba(255,255,255,0.1)" },
      { id: "row3", label: "Logo Row 3 — Bottom", tooltip: "Bottom row — visible when cameras are at full width", x: 30, y: 310, w: 540, h: 80, color: "rgba(255,255,255,0.08)" },
    ],
  },
  {
    id: "scoreboard", label: "Scoreboard Ad", description: "Giant LED scoreboard at Couto Pereira",
    bgColor: "#0a0a1a", accentColor: "#3b82f6", width: 600, height: 200,
    category: "Stadium", categoryIcon: "🏟️",
    zones: [
      { id: "ad_panel", label: "Scoreboard Advertisement Panel", tooltip: "Full scoreboard ad — shown before and after goals, half-time, and full-time", x: 40, y: 30, w: 520, h: 140, color: "rgba(0,150,255,0.2)" },
    ],
  },
  {
    id: "ooh_billboard", label: "OOH Billboard (16:9)", description: "Outdoor billboard near stadium",
    bgColor: "#18181b", accentColor: "#f97316", width: 640, height: 360,
    category: "Print", categoryIcon: "📄",
    zones: [
      { id: "main_area", label: "Billboard Main Area", tooltip: "High-visibility outdoor placement — 16:9 format for roadside or stadium exterior", x: 60, y: 60, w: 520, h: 240, color: "rgba(255,255,255,0.12)" },
    ],
  },
  {
    id: "digital_banner", label: "Digital Banner (728×90)", description: "Leaderboard web ad",
    bgColor: "#1e1e2e", accentColor: "#ec4899", width: 728, height: 90,
    category: "Digital", categoryIcon: "🖥️",
    zones: [
      { id: "banner_zone", label: "Banner Ad Zone", tooltip: "Standard 728×90 leaderboard — placed on Coritiba website and partner sites", x: 20, y: 10, w: 688, h: 70, color: "rgba(255,100,200,0.15)" },
    ],
  },
  {
    id: "social_story", label: "Social Story (9:16)", description: "Instagram / TikTok vertical story",
    bgColor: "#0f172a", accentColor: "#6366f1", width: 360, height: 640,
    category: "Social", categoryIcon: "📱",
    zones: [
      { id: "story_logo", label: "Story Sponsor Logo", tooltip: "Vertical story placement — visible for full 15-second story swipe-through", x: 80, y: 260, w: 200, h: 100, color: "rgba(255,255,255,0.15)" },
      { id: "story_cta", label: "CTA Strip (bottom)", tooltip: "Call-to-action strip at bottom of story", x: 0, y: 560, w: 360, h: 80, color: "rgba(255,255,255,0.08)" },
    ],
  },
];

type LogoItem = {
  id: string;
  url: string;
  x: number;
  y: number;
  scaleX: number;
  scaleY: number;
  rotation: number;
  imgElement?: HTMLImageElement;
};

const DEMO_LOGOS = [
  { name: "Heineken", url: "/demo-logos/heineken.svg" },
  { name: "Positivo", url: "/demo-logos/positivo.svg" },
  { name: "Natura", url: "/demo-logos/natura.svg" },
] as const;

/** Same-origin URL so Konva export stays untainted and CORS does not block loads. */
function resolveLogoUrl(url: string): string {
  const trimmed = url.trim();
  if (!trimmed || trimmed.startsWith("blob:") || trimmed.startsWith("data:")) return trimmed;
  if (trimmed.startsWith("/")) return trimmed;
  try {
    const parsed = new URL(trimmed);
    if (parsed.origin === window.location.origin) return trimmed;
    return `/api/mockup-editor/proxy-image?url=${encodeURIComponent(trimmed)}`;
  } catch {
    return trimmed;
  }
}

export function MockupEditorClient() {
  const { toast } = useToast();

  const stageRef = useRef<any>(null);
  const trRef = useRef<any>(null);

  // Undo/redo history stored as refs to avoid re-renders
  const history = useRef<LogoItem[][]>([]);
  const historyIndex = useRef<number>(-1);

  const [selectedTemplate, setSelectedTemplate] = useState<Template>(TEMPLATES[0]);
  const [logos, setLogos] = useState<LogoItem[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [logoUrl, setLogoUrl] = useState("");
  const [logoPreviewUrl, setLogoPreviewUrl] = useState<string | null>(null);
  const [showZones, setShowZones] = useState(true);
  const [zoom, setZoom] = useState(1.0);
  const [categoryFilter, setCategoryFilter] = useState<TemplateCategory | "All">("All");
  const [showShortcuts, setShowShortcuts] = useState(false);
  const [tooltip, setTooltip] = useState<{ text: string; x: number; y: number } | null>(null);
  // Attach to proposal state
  const [showAttachModal, setShowAttachModal] = useState(false);
  const [proposalSearch, setProposalSearch] = useState("");
  const [proposalResults, setProposalResults] = useState<Array<{ id: string; title: string; company: string }>>([]);
  const [attachLoading, setAttachLoading] = useState(false);
  const [attachedId, setAttachedId] = useState<string | null>(null);
  // Track whether history push is in progress to avoid double-push
  const skipHistoryPush = useRef(false);

  /** Push the current logos array onto the undo history stack. */
  function pushHistory(newLogos: LogoItem[]) {
    // Trim any redo future
    history.current = history.current.slice(0, historyIndex.current + 1);
    history.current.push(newLogos);
    historyIndex.current = history.current.length - 1;
  }

  function handleUndo() {
    if (historyIndex.current <= 0) return;
    historyIndex.current -= 1;
    const prev = history.current[historyIndex.current];
    skipHistoryPush.current = true;
    setLogos(prev);
    setSelectedId(null);
  }

  function handleRedo() {
    if (historyIndex.current >= history.current.length - 1) return;
    historyIndex.current += 1;
    const next = history.current[historyIndex.current];
    skipHistoryPush.current = true;
    setLogos(next);
    setSelectedId(null);
  }

  function zoomIn() { setZoom(z => Math.min(2.0, parseFloat((z + 0.1).toFixed(1)))); }
  function zoomOut() { setZoom(z => Math.max(0.5, parseFloat((z - 0.1).toFixed(1)))); }

  // Keyboard shortcuts for undo/redo
  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      const ctrl = e.ctrlKey || e.metaKey;
      if (!ctrl) return;
      if (e.key === "z" && !e.shiftKey) { e.preventDefault(); handleUndo(); }
      if (e.key === "z" && e.shiftKey) { e.preventDefault(); handleRedo(); }
      if (e.key === "y") { e.preventDefault(); handleRedo(); }
    }
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, []);

  const loadLogoImage = useCallback((url: string): Promise<HTMLImageElement> => {
    return new Promise((resolve, reject) => {
      const img = new window.Image();
      // Same-origin + blob loads only; do not set crossOrigin (breaks auth cookies on /api proxy).
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error("Failed to load image"));
      img.src = url;
    });
  }, []);

  const searchProposals = useCallback(async (q: string) => {
    if (!q.trim()) { setProposalResults([]); return; }
    try {
      const res = await fetch(`/api/proposals?search=${encodeURIComponent(q)}&limit=8`);
      if (res.ok) {
        const json = await res.json() as { data?: Array<{ id: string; title: string; companies?: { company_name: string } | null }> };
        const arr = json.data ?? (Array.isArray(json) ? json as Array<{ id: string; title: string; companies?: { company_name: string } | null }> : []);
        setProposalResults(arr.map(p => ({ id: p.id, title: p.title, company: p.companies?.company_name ?? "" })));
      }
    } catch {
      // silently ignore
    }
  }, []);

  async function addLogo(url?: string) {
    const rawUrl = url ?? logoUrl.trim();
    if (!rawUrl) return;
    const targetUrl = resolveLogoUrl(rawUrl);
    try {
      const img = await loadLogoImage(targetUrl);
      const maxW = Math.min(120, selectedTemplate.width * 0.3);
      const scale = maxW / img.naturalWidth;
      const newLogo: LogoItem = {
        id: crypto.randomUUID(),
        url: rawUrl,
        x: selectedTemplate.width / 2 - (img.naturalWidth * scale) / 2,
        y: selectedTemplate.height / 2 - (img.naturalHeight * scale) / 2,
        scaleX: scale,
        scaleY: scale,
        rotation: 0,
        imgElement: img,
      };
      setLogos(prev => {
        const next = [...prev, newLogo];
        pushHistory(next);
        return next;
      });
      setSelectedId(newLogo.id);
      setLogoUrl("");
      setLogoPreviewUrl(rawUrl);
    } catch {
      toast({ variant: "destructive", title: "Could not load image", description: "Check the URL and try again." });
    }
  }

  async function addLogoFromFile(file: File) {
    const url = URL.createObjectURL(file);
    setLogoPreviewUrl(url);
    await addLogo(url);
  }

  function deleteSelected() {
    if (!selectedId) return;
    setLogos(prev => {
      const next = prev.filter(l => l.id !== selectedId);
      pushHistory(next);
      return next;
    });
    setSelectedId(null);
  }

  async function attachToProposal(proposalId: string) {
    if (!stageRef.current) return;
    setAttachLoading(true);
    try {
      const stage = stageRef.current as any;
      const dataUrl = stage.toDataURL({ pixelRatio: 2 }) as string;
      const res = await fetch(`/api/proposals/${proposalId}/upload-asset`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ image_data: dataUrl, filename: `mockup-${selectedTemplate.id}.png`, type: "mockup" }),
      });
      if (res.ok) {
        setAttachedId(proposalId);
        toast({ variant: "success", title: "Attached ✓", description: "Mockup attached to proposal." });
        setShowAttachModal(false);
      } else {
        toast({ variant: "destructive", title: "Failed to attach", description: "Could not upload asset." });
      }
    } catch (e) {
      toast({ variant: "destructive", title: "Error", description: String(e) });
    } finally {
      setAttachLoading(false);
    }
  }

  function exportPNG() {
    if (!stageRef.current) { toast({ variant: "destructive", title: "Canvas not ready" }); return; }
    // Temporarily hide zones for clean export
    const stage = stageRef.current as any;
    const prevShowZones = showZones;
    setShowZones(false);
    // Small timeout to let React re-render without zones
    setTimeout(() => {
      const dataUrl = stage.toDataURL({ pixelRatio: 2 });
      const a = document.createElement("a");
      a.href = dataUrl;
      a.download = `coritiba-${selectedTemplate.id}-mockup.png`;
      a.click();
      setShowZones(prevShowZones);
      toast({ variant: "success", title: "Exported!", description: "Clean mockup saved as PNG (2x resolution, no guides)" });
    }, 50);
  }

  const tmpl = selectedTemplate;
  const categories: Array<TemplateCategory | "All"> = ["All", "Jersey", "Stadium", "Social", "Digital", "Print"];
  const filteredTemplates = categoryFilter === "All" ? TEMPLATES : TEMPLATES.filter(t => t.category === categoryFilter);

  return (
    <div className="flex flex-col-reverse lg:flex-row gap-6">

      {/* Keyboard shortcuts modal */}
      {showShortcuts && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm" onClick={() => setShowShortcuts(false)}>
          <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl p-6 w-80 space-y-4" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between">
              <h3 className="font-semibold text-sm flex items-center gap-2"><Keyboard className="h-4 w-4" /> Keyboard Shortcuts</h3>
              <button onClick={() => setShowShortcuts(false)} className="text-muted-foreground hover:text-foreground"><X className="h-4 w-4" /></button>
            </div>
            <div className="space-y-2 text-sm">
              {[
                ["Ctrl+Z", "Undo"], ["Ctrl+Y / Ctrl+Shift+Z", "Redo"],
                ["Delete / Backspace", "Remove selected logo"],
                ["+", "Zoom in"], ["-", "Zoom out"],
              ].map(([key, desc]) => (
                <div key={key} className="flex items-center justify-between gap-4">
                  <kbd className="text-xs border rounded px-1.5 py-0.5 font-mono bg-muted">{key}</kbd>
                  <span className="text-muted-foreground text-xs">{desc}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Attach to Proposal modal */}
      {showAttachModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm" onClick={() => setShowAttachModal(false)}>
          <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl p-6 w-96 space-y-4" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between">
              <h3 className="font-semibold text-sm flex items-center gap-2"><Paperclip className="h-4 w-4" /> Attach to Proposal</h3>
              <button onClick={() => setShowAttachModal(false)} className="text-muted-foreground hover:text-foreground"><X className="h-4 w-4" /></button>
            </div>
            <div>
              <Input
                placeholder="Search proposals…"
                value={proposalSearch}
                onChange={e => { setProposalSearch(e.target.value); void searchProposals(e.target.value); }}
                className="text-sm"
                autoFocus
              />
            </div>
            {proposalResults.length > 0 && (
              <div className="space-y-1.5 max-h-64 overflow-y-auto">
                {proposalResults.map(p => (
                  <button
                    key={p.id}
                    onClick={() => void attachToProposal(p.id)}
                    disabled={attachLoading}
                    className="w-full text-left rounded-lg border px-3 py-2.5 hover:bg-accent transition-colors text-sm"
                  >
                    <div className="font-medium truncate">{p.title}</div>
                    {p.company && <div className="text-xs text-muted-foreground">{p.company}</div>}
                  </button>
                ))}
              </div>
            )}
            {proposalSearch && proposalResults.length === 0 && (
              <p className="text-sm text-muted-foreground text-center py-3">No proposals found</p>
            )}
          </div>
        </div>
      )}

      {/* Tooltip */}
      {tooltip && (
        <div
          className="fixed z-40 pointer-events-none max-w-xs rounded-lg bg-slate-900 text-white text-xs px-3 py-2 shadow-lg"
          style={{ left: tooltip.x + 12, top: tooltip.y - 8 }}
        >
          {tooltip.text}
        </div>
      )}

      {/* Sidebar */}
      <div className="lg:w-80 space-y-4">

        {/* Template gallery with category filter */}
        <div className="rounded-xl border bg-card p-4 space-y-3">
          <div className="text-sm font-semibold">Template Gallery</div>
          {/* Category tabs */}
          <div className="flex flex-wrap gap-1">
            {categories.map(cat => (
              <button
                key={cat}
                onClick={() => setCategoryFilter(cat)}
                className={`text-xs rounded-full px-2.5 py-1 border transition-colors ${
                  categoryFilter === cat
                    ? "bg-primary text-primary-foreground border-primary"
                    : "border-border hover:bg-accent"
                }`}
              >
                {cat !== "All" ? `${CATEGORY_ICONS[cat as TemplateCategory]} ` : ""}{cat}
              </button>
            ))}
          </div>
          {/* Visual grid */}
          <div className="grid grid-cols-2 gap-2">
            {filteredTemplates.map(t => (
              <button
                key={t.id}
                onClick={() => { setSelectedTemplate(t); setLogos([]); setSelectedId(null); setLogoPreviewUrl(null); }}
                className={`rounded-xl border-2 overflow-hidden text-left transition-all ${
                  selectedTemplate.id === t.id
                    ? "border-primary ring-2 ring-primary/20"
                    : "border-transparent hover:border-border"
                }`}
              >
                {/* Color preview card */}
                <div
                  className="flex items-center justify-center text-white/60 font-bold text-lg relative"
                  style={{
                    background: t.bgColor,
                    aspectRatio: t.width > t.height ? "16/7" : t.width === t.height ? "1/1" : "9/16",
                    minHeight: 52,
                    maxHeight: 80,
                  }}
                >
                  <span className="text-2xl">{t.categoryIcon}</span>
                  <span
                    className={`absolute top-1 right-1 text-[9px] font-semibold rounded-full px-1.5 py-0.5 ${CATEGORY_COLORS[t.category]} text-white`}
                  >
                    {t.category}
                  </span>
                </div>
                <div className="px-2 py-1.5">
                  <div className="text-xs font-semibold leading-tight truncate">{t.label}</div>
                  <div className="text-[10px] text-muted-foreground leading-tight truncate">{t.width}×{t.height}px · {t.zones.length} zone{t.zones.length !== 1 ? "s" : ""}</div>
                </div>
              </button>
            ))}
          </div>
        </div>

        {/* Placement zones info */}
        <div className="rounded-xl border bg-card p-4 space-y-2">
          <div className="text-sm font-semibold">Placement Zones</div>
          {selectedTemplate.zones.map(z => (
            <div key={z.id} className="flex items-start gap-2 text-xs">
              <div className="w-2 h-2 rounded-full bg-primary/70 flex-shrink-0 mt-1" />
              <div className="min-w-0">
                <span className="font-medium">{z.label}</span>
                <button
                  className="ml-1 text-muted-foreground hover:text-foreground"
                  onMouseEnter={e => setTooltip({ text: z.tooltip, x: (e.target as HTMLElement).getBoundingClientRect().right, y: (e.target as HTMLElement).getBoundingClientRect().top })}
                  onMouseLeave={() => setTooltip(null)}
                >
                  <HelpCircle className="inline h-3 w-3" />
                </button>
              </div>
            </div>
          ))}
        </div>

        {/* Unified logo input */}
        <div className="rounded-xl border bg-card p-4 space-y-3">
          <div className="text-sm font-semibold flex items-center gap-2"><Plus className="h-4 w-4" /> Add Sponsor Logo</div>
          {/* File upload takes priority — shown first */}
          <div>
            <Label className="text-xs font-medium">Upload file or paste URL</Label>
            <div className="mt-1.5 relative">
              <input
                type="file"
                accept="image/*"
                id="logo-file-input"
                className="sr-only"
                onChange={e => { const f = e.target.files?.[0]; if (f) void addLogoFromFile(f); }}
              />
              <label
                htmlFor="logo-file-input"
                className="flex items-center justify-center w-full h-20 rounded-lg border-2 border-dashed border-border hover:border-primary cursor-pointer transition-colors bg-muted/20 hover:bg-muted/40 text-xs text-muted-foreground gap-2"
              >
                {logoPreviewUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={logoPreviewUrl} alt="Logo preview" className="max-h-16 max-w-full object-contain rounded" />
                ) : (
                  <>
                    <ImageIcon className="h-5 w-5 opacity-50" />
                    <span>Drop image here or click to browse</span>
                  </>
                )}
              </label>
            </div>
            <div className="mt-2 flex gap-2">
              <Input
                value={logoUrl}
                onChange={e => setLogoUrl(e.target.value)}
                placeholder="…or paste image URL"
                className="text-xs flex-1"
                onKeyDown={e => e.key === "Enter" && void addLogo()}
              />
              <Button size="sm" onClick={() => void addLogo()} disabled={!logoUrl.trim()} className="px-3">Add</Button>
            </div>
          </div>
          {/* Quick logos */}
          <div>
            <Label className="text-xs mb-1 block text-muted-foreground">Quick add (demo logos)</Label>
            <div className="flex gap-2 flex-wrap">
              {DEMO_LOGOS.map(l => (
                <button key={l.name} onClick={() => void addLogo(l.url)} className="text-xs border rounded px-2 py-1 hover:bg-accent transition-colors">
                  {l.name}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Controls */}
        <div className="rounded-xl border bg-card p-4 space-y-2">
          <div className="text-sm font-semibold">Controls</div>
          <div className="flex flex-col gap-1.5">
            <div className="flex gap-1.5">
              <Button size="sm" variant="outline" onClick={handleUndo} className="flex-1 justify-center gap-1.5" title="Undo (Ctrl+Z)">
                <Undo2 className="h-3.5 w-3.5" /> Undo
              </Button>
              <Button size="sm" variant="outline" onClick={handleRedo} className="flex-1 justify-center gap-1.5" title="Redo (Ctrl+Y)">
                <Redo2 className="h-3.5 w-3.5" /> Redo
              </Button>
            </div>
            <div className="flex items-center gap-1.5">
              <Button size="sm" variant="outline" onClick={zoomOut} className="px-2.5" title="Zoom out">
                <ZoomOut className="h-3.5 w-3.5" />
              </Button>
              <span className="flex-1 text-center text-xs font-medium tabular-nums">{Math.round(zoom * 100)}%</span>
              <Button size="sm" variant="outline" onClick={zoomIn} className="px-2.5" title="Zoom in">
                <ZoomIn className="h-3.5 w-3.5" />
              </Button>
            </div>
            <Button size="sm" variant="outline" onClick={() => setShowZones(v => !v)} className="justify-start gap-2">
              <Layers className="h-3.5 w-3.5" /> {showZones ? "Hide" : "Show"} placement zones
            </Button>
            {selectedId && (
              <Button size="sm" variant="outline" onClick={deleteSelected} className="justify-start gap-2 text-red-500 hover:text-red-500">
                <Trash2 className="h-3.5 w-3.5" /> Remove selected logo
              </Button>
            )}
            <Button size="sm" variant="outline" onClick={() => { setLogos([]); setSelectedId(null); setLogoPreviewUrl(null); pushHistory([]); }} className="justify-start gap-2">
              <RefreshCw className="h-3.5 w-3.5" /> Clear all logos
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setShowShortcuts(true)} className="justify-start gap-2 text-muted-foreground">
              <Keyboard className="h-3.5 w-3.5" /> Keyboard shortcuts
            </Button>
          </div>
        </div>

        {/* Export + Attach */}
        <div className="space-y-2">
          <Button className="w-full gap-2" onClick={exportPNG}>
            <Download className="h-4 w-4" /> Export PNG (2x)
          </Button>
          {attachedId ? (
            <Button className="w-full gap-2 bg-emerald-600 hover:bg-emerald-700" disabled>
              <CheckCircle2 className="h-4 w-4" /> Attached ✓
            </Button>
          ) : (
            <Button className="w-full gap-2" variant="outline" onClick={() => setShowAttachModal(true)} disabled={logos.length === 0}>
              <Paperclip className="h-4 w-4" /> Attach to Proposal
            </Button>
          )}
        </div>

        <div className="text-xs text-muted-foreground text-center">
          Click a logo to select · Drag to move · Use handles to resize
        </div>
      </div>

      {/* Canvas */}
      <div className="flex-1">
        <div className="rounded-xl border bg-slate-900 overflow-auto p-4 flex items-center justify-center min-h-[400px]">
          <div style={{ transform: `scale(${zoom})`, transformOrigin: "center center", transition: "transform 0.15s ease" }}>
            <KonvaCanvas
              stageRef={stageRef}
              tmpl={tmpl}
              logos={logos}
              showZones={showZones}
              selectedId={selectedId}
              onSelect={setSelectedId}
              onLogoMove={(id, x, y) => setLogos(prev => {
                const next = prev.map(l => l.id === id ? { ...l, x, y } : l);
                pushHistory(next);
                return next;
              })}
              onLogoTransform={(id, x, y, scaleX, scaleY, rotation) => setLogos(prev => {
                const next = prev.map(l => l.id === id ? { ...l, x, y, scaleX, scaleY, rotation } : l);
                pushHistory(next);
                return next;
              })}
            />
          </div>
        </div>
        <div className="mt-2 text-xs text-muted-foreground flex items-center gap-4">
          <span className="flex items-center gap-1"><ImageIcon className="h-3 w-3" /> {logos.length} logo{logos.length !== 1 ? "s" : ""} on canvas</span>
          <span>{tmpl.width}×{tmpl.height}px · {tmpl.category}</span>
          <span className="ml-auto">{tmpl.description}</span>
        </div>
      </div>
    </div>
  );
}
