"use client";

import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/components/ui/toaster";
import {
  Type, Image as ImageIcon, Save, Loader2, ExternalLink, UploadCloud,
} from "lucide-react";
import type { PlaceholderConfig, ImagePlaceholderType } from "@/lib/presentations/placeholder-parser";
import { TemplateRenderPanel } from "./template-render-panel";

const IMAGE_TYPES: { value: ImagePlaceholderType; label: string }[] = [
  { value: "jersey", label: "Jersey mockup" },
  { value: "stadium", label: "Stadium mockup" },
  { value: "campaign", label: "Campaign creative" },
  { value: "logo", label: "Company logo (direct)" },
];

const JERSEY_PLACEMENTS = [
  "chest_sponsor", "chest_above_name", "sleeve_left", "sleeve_right",
  "back", "number", "shorts", "socks",
];
const STADIUM_PLACEMENTS = [
  "led_board_main", "led_board_near_goal", "main_stand_facade", "exterior_facade", "scoreboard",
];
const CAMPAIGN_SCENES = ["matchday_street", "training_ground", "fan_lifestyle"];

function placementOptionsFor(imageType?: ImagePlaceholderType): string[] {
  if (imageType === "jersey") return JERSEY_PLACEMENTS;
  if (imageType === "stadium") return STADIUM_PLACEMENTS;
  if (imageType === "campaign") return CAMPAIGN_SCENES;
  return [];
}

export function TemplateDetailEditor({
  templateId,
  templateName,
  htmlUrl,
  initialPlaceholders,
}: {
  templateId: string;
  templateName: string;
  htmlUrl: string | null;
  initialPlaceholders: PlaceholderConfig[];
}) {
  const { toast } = useToast();
  const [placeholders, setPlaceholders] = useState<PlaceholderConfig[]>(initialPlaceholders);
  const [saving, setSaving] = useState(false);
  const [uploadingFor, setUploadingFor] = useState<string | null>(null);

  function updatePlaceholder(token: string, patch: Partial<PlaceholderConfig>) {
    setPlaceholders((prev) => prev.map((p) => (p.token === token ? { ...p, ...patch } : p)));
  }

  async function save() {
    setSaving(true);
    try {
      const res = await fetch(`/api/proposal-templates/${templateId}/placeholders`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ placeholder_config: placeholders }),
      });
      const json = await res.json();
      if (!res.ok) {
        toast({ variant: "destructive", title: "Save failed", description: json.error });
        return;
      }
      toast({ variant: "success", title: "Placeholders saved" });
    } catch {
      toast({ variant: "destructive", title: "Network error" });
    } finally {
      setSaving(false);
    }
  }

  async function uploadBaseImage(token: string, file: File) {
    setUploadingFor(token);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch(`/api/proposal-templates/${templateId}/upload-asset`, { method: "POST", body: fd });
      const json = await res.json();
      if (!res.ok) {
        toast({ variant: "destructive", title: "Upload failed", description: json.error });
        return;
      }
      updatePlaceholder(token, { base_image_url: json.url });
      toast({ variant: "success", title: "Base image uploaded" });
    } catch {
      toast({ variant: "destructive", title: "Network error" });
    } finally {
      setUploadingFor(null);
    }
  }

  const textPlaceholders = placeholders.filter((p) => p.kind === "text");
  const imagePlaceholders = placeholders.filter((p) => p.kind === "image");

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
      <div className="lg:col-span-2 space-y-4">
        <Card>
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="text-base">Placeholders ({placeholders.length})</CardTitle>
                <CardDescription>
                  Configure each detected token — text fields fill automatically from company + proposal data;
                  image slots generate via the AI mockup pipeline.
                </CardDescription>
              </div>
              <div className="flex items-center gap-2">
                {htmlUrl && (
                  <a href={htmlUrl} target="_blank" rel="noopener noreferrer">
                    <Button size="sm" variant="ghost" className="gap-1 text-xs">
                      <ExternalLink className="h-3 w-3" /> Raw HTML
                    </Button>
                  </a>
                )}
                <Button size="sm" onClick={save} disabled={saving} className="gap-1.5">
                  {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
                  Save
                </Button>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            {textPlaceholders.length > 0 && (
              <div className="space-y-2">
                <div className="text-xs font-semibold text-muted-foreground flex items-center gap-1.5">
                  <Type className="h-3.5 w-3.5" /> Text tokens (auto-filled)
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {textPlaceholders.map((p) => (
                    <Badge key={p.token} variant="secondary" className="text-[11px] font-mono">
                      [[{p.token}]]
                    </Badge>
                  ))}
                </div>
              </div>
            )}

            {imagePlaceholders.length > 0 && (
              <div className="space-y-3">
                <div className="text-xs font-semibold text-muted-foreground flex items-center gap-1.5">
                  <ImageIcon className="h-3.5 w-3.5" /> Image slots
                </div>
                {imagePlaceholders.map((p) => {
                  const placementOptions = placementOptionsFor(p.image_type);
                  return (
                    <div key={p.token} className="rounded-lg border p-3 space-y-2.5">
                      <div className="flex items-center justify-between">
                        <Badge variant="outline" className="text-[11px] font-mono">
                          [[{p.token}]]
                        </Badge>
                      </div>
                      <div className="grid grid-cols-2 gap-2.5">
                        <div className="space-y-1">
                          <Label className="text-xs">Image type</Label>
                          <select
                            value={p.image_type ?? "jersey"}
                            onChange={(e) =>
                              updatePlaceholder(p.token, {
                                image_type: e.target.value as ImagePlaceholderType,
                                placement: undefined,
                              })
                            }
                            className="w-full text-xs rounded-md border bg-background px-2 py-1.5"
                          >
                            {IMAGE_TYPES.map((t) => (
                              <option key={t.value} value={t.value}>{t.label}</option>
                            ))}
                          </select>
                        </div>
                        {placementOptions.length > 0 && (
                          <div className="space-y-1">
                            <Label className="text-xs">Placement</Label>
                            <select
                              value={p.placement ?? placementOptions[0]}
                              onChange={(e) => updatePlaceholder(p.token, { placement: e.target.value })}
                              className="w-full text-xs rounded-md border bg-background px-2 py-1.5"
                            >
                              {placementOptions.map((opt) => (
                                <option key={opt} value={opt}>{opt.replace(/_/g, " ")}</option>
                              ))}
                            </select>
                          </div>
                        )}
                      </div>

                      {p.image_type !== "logo" && (
                        <>
                          <div className="space-y-1">
                            <Label className="text-xs">Prompt hint (optional)</Label>
                            <Input
                              value={p.prompt_hint ?? ""}
                              onChange={(e) => updatePlaceholder(p.token, { prompt_hint: e.target.value })}
                              placeholder="ex: emphasize the sponsor logo on the chest, well lit"
                              className="text-xs h-8"
                            />
                          </div>
                          <div className="flex items-center justify-between gap-2">
                            <label className="flex items-center gap-1.5 text-xs cursor-pointer">
                              <input
                                type="checkbox"
                                checked={p.use_company_logo !== false}
                                onChange={(e) => updatePlaceholder(p.token, { use_company_logo: e.target.checked })}
                              />
                              Use company&apos;s scraped/uploaded logo
                            </label>
                            <label className="flex items-center gap-1.5 text-xs cursor-pointer text-muted-foreground hover:text-foreground">
                              <UploadCloud className="h-3.5 w-3.5" />
                              {uploadingFor === p.token ? "Uploading…" : p.base_image_url ? "Replace base photo" : "Upload custom base photo"}
                              <input
                                type="file"
                                accept="image/png,image/jpeg,image/webp"
                                className="hidden"
                                disabled={uploadingFor === p.token}
                                onChange={(e) => {
                                  const file = e.target.files?.[0];
                                  if (file) void uploadBaseImage(p.token, file);
                                }}
                              />
                            </label>
                          </div>
                          {p.base_image_url && (
                            <img src={p.base_image_url} alt="Custom base" className="h-16 rounded border object-cover" />
                          )}
                        </>
                      )}
                    </div>
                  );
                })}
              </div>
            )}

            {placeholders.length === 0 && (
              <p className="text-sm text-muted-foreground text-center py-6">
                No placeholders detected in this template&apos;s HTML.
              </p>
            )}
          </CardContent>
        </Card>
      </div>

      <div className="space-y-4">
        <TemplateRenderPanel templateId={templateId} templateName={templateName} />
      </div>
    </div>
  );
}
