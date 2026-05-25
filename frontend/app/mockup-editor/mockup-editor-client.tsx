"use client";

import React, { useState, useRef, useCallback } from "react";
import dynamic from "next/dynamic";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { useToast } from "@/components/ui/toaster";
import {
  Download, Plus, Trash2, Move, RotateCw,
  Image as ImageIcon, Layers, RefreshCw,
} from "lucide-react";

// Dynamically import Konva components to avoid SSR issues
const KonvaCanvas = dynamic(
  () => import("./konva-canvas").then(m => m.KonvaCanvas),
  { ssr: false, loading: () => <div className="flex items-center justify-center w-full h-full min-h-[300px]"><div className="text-white/40 text-sm">Loading canvas…</div></div> }
);

type Template = {
  id: string;
  label: string;
  description: string;
  bgColor: string;
  width: number;
  height: number;
  zones: Array<{ id: string; label: string; x: number; y: number; w: number; h: number; color: string }>;
};

// Templates with predefined sponsor placement zones
const TEMPLATES: Template[] = [
  {
    id: "jersey", label: "Jersey — Chest", description: "Coritiba FC jersey front with chest placement zone",
    bgColor: "#1a5e2a", width: 400, height: 500,
    zones: [
      { id: "chest", label: "Principal Sponsor (Chest)", x: 120, y: 140, w: 160, h: 80, color: "rgba(255,255,255,0.15)" },
      { id: "sleeve_l", label: "Sleeve Left", x: 20, y: 180, w: 80, h: 50, color: "rgba(255,255,255,0.1)" },
      { id: "sleeve_r", label: "Sleeve Right", x: 300, y: 180, w: 80, h: 50, color: "rgba(255,255,255,0.1)" },
    ],
  },
  {
    id: "led_board", label: "LED Perimeter Board", description: "Stadium LED board at Couto Pereira",
    bgColor: "#0d1b2a", width: 700, height: 150,
    zones: [
      { id: "main", label: "LED Board Main", x: 50, y: 25, w: 600, h: 100, color: "rgba(0,200,100,0.2)" },
    ],
  },
  {
    id: "social_post", label: "Social Media Post", description: "Instagram square post — 1:1",
    bgColor: "#0f3d1a", width: 500, height: 500,
    zones: [
      { id: "logo_area", label: "Sponsor Logo Area", x: 150, y: 150, w: 200, h: 100, color: "rgba(255,255,255,0.15)" },
      { id: "bottom_bar", label: "Bottom Bar", x: 0, y: 420, w: 500, h: 80, color: "rgba(255,255,255,0.1)" },
    ],
  },
  {
    id: "press_backdrop", label: "Press Backdrop", description: "Post-match interview backdrop",
    bgColor: "#1a2940", width: 600, height: 400,
    zones: [
      { id: "row1", label: "Logo Row 1", x: 30, y: 80, w: 540, h: 100, color: "rgba(255,255,255,0.1)" },
      { id: "row2", label: "Logo Row 2", x: 30, y: 210, w: 540, h: 100, color: "rgba(255,255,255,0.1)" },
      { id: "row3", label: "Logo Row 3", x: 30, y: 310, w: 540, h: 80, color: "rgba(255,255,255,0.08)" },
    ],
  },
  {
    id: "scoreboard", label: "Scoreboard Ad", description: "Giant LED scoreboard at Couto Pereira",
    bgColor: "#0a0a1a", width: 600, height: 200,
    zones: [
      { id: "ad_panel", label: "Advertisement Panel", x: 40, y: 30, w: 520, h: 140, color: "rgba(0,150,255,0.2)" },
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

export function MockupEditorClient() {
  const { toast } = useToast();

  const stageRef = useRef<any>(null);
  const trRef = useRef<any>(null);

  const [selectedTemplate, setSelectedTemplate] = useState<Template>(TEMPLATES[0]);
  const [logos, setLogos] = useState<LogoItem[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [logoUrl, setLogoUrl] = useState("");
  const [showZones, setShowZones] = useState(true);

  const loadLogoImage = useCallback((url: string): Promise<HTMLImageElement> => {
    return new Promise((resolve, reject) => {
      const img = new window.Image();
      img.crossOrigin = "anonymous";
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error("Failed to load image"));
      img.src = url;
    });
  }, []);

  async function addLogo(url?: string) {
    const targetUrl = url ?? logoUrl.trim();
    if (!targetUrl) return;
    try {
      const img = await loadLogoImage(targetUrl);
      const maxW = Math.min(120, selectedTemplate.width * 0.3);
      const scale = maxW / img.naturalWidth;
      const newLogo: LogoItem = {
        id: crypto.randomUUID(),
        url: targetUrl,
        x: selectedTemplate.width / 2 - (img.naturalWidth * scale) / 2,
        y: selectedTemplate.height / 2 - (img.naturalHeight * scale) / 2,
        scaleX: scale,
        scaleY: scale,
        rotation: 0,
        imgElement: img,
      };
      setLogos(prev => [...prev, newLogo]);
      setSelectedId(newLogo.id);
      setLogoUrl("");
    } catch {
      toast({ variant: "destructive", title: "Could not load image", description: "Check the URL and try again." });
    }
  }

  async function addLogoFromFile(file: File) {
    const url = URL.createObjectURL(file);
    await addLogo(url);
  }

  function deleteSelected() {
    if (!selectedId) return;
    setLogos(prev => prev.filter(l => l.id !== selectedId));
    setSelectedId(null);
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

  return (
    <div className="flex flex-col lg:flex-row gap-6">
      {/* Sidebar */}
      <div className="lg:w-72 space-y-4">
        {/* Template picker */}
        <div className="rounded-xl border bg-card p-4 space-y-2">
          <div className="text-sm font-semibold">Template</div>
          <div className="space-y-1.5">
            {TEMPLATES.map(t => (
              <button
                key={t.id}
                onClick={() => { setSelectedTemplate(t); setLogos([]); setSelectedId(null); }}
                className={`w-full text-left rounded-lg px-3 py-2 text-sm transition-colors ${
                  selectedTemplate.id === t.id ? "bg-primary/10 text-primary font-medium" : "hover:bg-accent"
                }`}
              >
                <div className="font-medium">{t.label}</div>
                <div className="text-xs text-muted-foreground">{t.description}</div>
              </button>
            ))}
          </div>
        </div>

        {/* Add logo */}
        <div className="rounded-xl border bg-card p-4 space-y-3">
          <div className="text-sm font-semibold flex items-center gap-2"><Plus className="h-4 w-4" /> Add Sponsor Logo</div>
          <div>
            <Label className="text-xs">Logo URL</Label>
            <div className="flex gap-2 mt-1">
              <Input
                value={logoUrl}
                onChange={e => setLogoUrl(e.target.value)}
                placeholder="https://img.logo.dev/company.com"
                className="text-xs flex-1"
                onKeyDown={e => e.key === "Enter" && addLogo()}
              />
              <Button size="sm" onClick={() => addLogo()} className="px-3">Add</Button>
            </div>
          </div>
          <div>
            <Label className="text-xs">Upload File</Label>
            <input
              type="file"
              accept="image/*"
              className="mt-1 w-full text-xs text-muted-foreground file:mr-2 file:py-1 file:px-2 file:rounded file:border file:text-xs file:bg-card"
              onChange={e => { const f = e.target.files?.[0]; if (f) addLogoFromFile(f); }}
            />
          </div>
          {/* Quick logos */}
          <div>
            <Label className="text-xs mb-1 block">Quick add (demo logos)</Label>
            <div className="flex gap-2 flex-wrap">
              {[
                { name: "Heineken", url: "https://img.logo.dev/heineken.com?format=png&size=128" },
                { name: "Positivo", url: "https://img.logo.dev/positivo.com.br?format=png&size=128" },
                { name: "Natura", url: "https://img.logo.dev/natura.com.br?format=png&size=128" },
              ].map(l => (
                <button key={l.name} onClick={() => addLogo(l.url)} className="text-xs border rounded px-2 py-1 hover:bg-accent transition-colors">
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
            <Button size="sm" variant="outline" onClick={() => setShowZones(v => !v)} className="justify-start gap-2">
              <Layers className="h-3.5 w-3.5" /> {showZones ? "Hide" : "Show"} placement zones
            </Button>
            {selectedId && (
              <Button size="sm" variant="outline" onClick={deleteSelected} className="justify-start gap-2 text-red-500 hover:text-red-500">
                <Trash2 className="h-3.5 w-3.5" /> Remove selected logo
              </Button>
            )}
            <Button size="sm" variant="outline" onClick={() => { setLogos([]); setSelectedId(null); }} className="justify-start gap-2">
              <RefreshCw className="h-3.5 w-3.5" /> Clear all logos
            </Button>
          </div>
        </div>

        {/* Export */}
        <Button className="w-full gap-2" onClick={exportPNG}>
          <Download className="h-4 w-4" /> Export PNG (2x)
        </Button>

        <div className="text-xs text-muted-foreground text-center">
          Click a logo to select · Drag to move · Use handles to resize
        </div>
      </div>

      {/* Canvas */}
      <div className="flex-1">
        <div className="rounded-xl border bg-slate-900 overflow-auto p-4 flex items-center justify-center min-h-[400px]">
          <KonvaCanvas
            stageRef={stageRef}
            tmpl={tmpl}
            logos={logos}
            showZones={showZones}
            selectedId={selectedId}
            onSelect={setSelectedId}
            onLogoMove={(id, x, y) => setLogos(prev => prev.map(l => l.id === id ? { ...l, x, y } : l))}
            onLogoTransform={(id, x, y, scaleX, scaleY, rotation) => setLogos(prev => prev.map(l => l.id === id ? { ...l, x, y, scaleX, scaleY, rotation } : l))}
          />
        </div>
        <div className="mt-2 text-xs text-muted-foreground flex items-center gap-4">
          <span className="flex items-center gap-1"><ImageIcon className="h-3 w-3" /> {logos.length} logo{logos.length !== 1 ? "s" : ""} on canvas</span>
          <span>{tmpl.width}×{tmpl.height}px template</span>
        </div>
      </div>
    </div>
  );
}
