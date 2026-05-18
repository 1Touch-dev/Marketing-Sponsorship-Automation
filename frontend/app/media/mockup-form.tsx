"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Sparkles } from "lucide-react";

export function MockupForm({ mockupTypes }: { mockupTypes: Record<string, { label: string; icon: React.ReactNode; description: string }> }) {
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const selectCls = "w-full h-9 rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring";

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    const fd = new FormData(e.currentTarget);
    const payload = {
      name: String(fd.get("name") ?? "").trim(),
      mockup_type: String(fd.get("mockup_type") ?? "jersey"),
      ai_prompt: String(fd.get("ai_prompt") ?? "").trim() || null,
      negative_prompt: String(fd.get("negative_prompt") ?? "").trim() || null,
      ai_provider: String(fd.get("ai_provider") ?? "manual"),
      placement_zone: String(fd.get("placement_zone") ?? "").trim() || null,
      sponsor_logo_url: String(fd.get("sponsor_logo_url") ?? "").trim() || null,
      notes: String(fd.get("notes") ?? "").trim() || null,
    };
    try {
      const res = await fetch("/api/visual-mockups", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j?.error ?? `Save failed (${res.status})`);
      }
      (e.target as HTMLFormElement).reset();
      setSuccess(true);
      router.refresh();
      setTimeout(() => setSuccess(false), 3000);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="space-y-1.5">
          <Label htmlFor="name">Mockup Name *</Label>
          <Input id="name" name="name" required placeholder="e.g. Positivo Tech — Jersey Principal Sponsor" />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="mockup_type">Placement Type *</Label>
          <select id="mockup_type" name="mockup_type" className={selectCls} required>
            {Object.entries(mockupTypes).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
          </select>
        </div>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="ai_prompt">AI Generation Prompt</Label>
        <Textarea
          id="ai_prompt"
          name="ai_prompt"
          rows={3}
          placeholder="Describe the visual: 'Coritiba FC white and green jersey with Positivo logo in chest area, photorealistic, stadium lighting, close-up view of the jersey fabric...'"
        />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="negative_prompt">Negative Prompt (what to avoid)</Label>
        <Input id="negative_prompt" name="negative_prompt" placeholder="e.g. blurry, cartoon, competitor logos, low quality" />
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="space-y-1.5">
          <Label htmlFor="ai_provider">AI Provider</Label>
          <select id="ai_provider" name="ai_provider" className={selectCls}>
            <option value="manual">Manual Upload</option>
            <option value="dalle3">DALL-E 3 (configure API key)</option>
            <option value="stability">Stability AI (configure API key)</option>
            <option value="midjourney">Midjourney (architecture ready)</option>
          </select>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="placement_zone">Placement Zone</Label>
          <Input id="placement_zone" name="placement_zone" placeholder="e.g. jersey_chest" />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="sponsor_logo_url">Sponsor Logo URL</Label>
          <Input id="sponsor_logo_url" name="sponsor_logo_url" placeholder="https://..." />
        </div>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="notes">Notes / Brief</Label>
        <Textarea id="notes" name="notes" rows={2} placeholder="Visual brief, brand guidelines, special requirements..." />
      </div>

      {error && <div className="text-sm text-destructive bg-destructive/10 rounded-md p-2">{error}</div>}
      {success && <div className="text-sm text-green-700 bg-green-50 rounded-md p-2">✓ Mockup brief created</div>}

      <Button type="submit" disabled={saving}>
        <Sparkles className="h-4 w-4 mr-1" />
        {saving ? "Saving…" : "Create Visual Brief"}
      </Button>
    </form>
  );
}
