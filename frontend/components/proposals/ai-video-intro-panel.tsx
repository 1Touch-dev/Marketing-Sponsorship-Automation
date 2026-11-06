"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import { Loader2, Sparkles, Check, AlertCircle, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";

type Image = { id: string; url: string; job_type: string; label: string };
type Job = {
  id: string;
  source_image_url: string;
  status: "queued" | "processing" | "completed" | "failed";
  output_url: string | null;
  error_message: string | null;
  duration_s: number;
  created_at: string;
};
type Options = {
  durations: number[];
  model_label: string;
  has_audio: boolean;
  estimated_cost_usd: Record<string, number>;
  max_prompt_chars: number;
};

const POLL_MS = 6000;

/**
 * "Generate with AI" for the Personalized Video Intro: pick one of this proposal's generated images, and it is
 * turned into a short video. The finished video is saved to our storage and can be set as the proposal's intro.
 */
export function AiVideoIntroPanel({
  proposalId,
  currentUrl,
  onUse,
}: {
  proposalId: string;
  currentUrl: string;
  onUse: (url: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [configured, setConfigured] = useState(true);
  const [images, setImages] = useState<Image[]>([]);
  const [jobs, setJobs] = useState<Job[]>([]);
  const [options, setOptions] = useState<Options | null>(null);

  const [selected, setSelected] = useState<string | null>(null);
  const [prompt, setPrompt] = useState("");
  const [duration, setDuration] = useState(5);
  const [starting, setStarting] = useState(false);
  const [startError, setStartError] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const res = await fetch(`/api/media/video?proposal_id=${encodeURIComponent(proposalId)}`, { cache: "no-store" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? "Could not load");
      setConfigured(data.configured !== false);
      setImages(data.images ?? []);
      setJobs(data.videos ?? []);
      setOptions(data.options ?? null);
      setSelected((cur) => cur ?? data.images?.[0]?.id ?? null);
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : "Could not load");
    } finally {
      setLoading(false);
    }
  }, [proposalId]);

  useEffect(() => {
    if (open) void load();
  }, [open, load]);

  // While any video is rendering, check on it every few seconds.
  const rendering = jobs.some((j) => j.status === "queued" || j.status === "processing");
  useEffect(() => {
    if (!open || !rendering) return;
    timer.current = setTimeout(async () => {
      const pending = jobs.filter((j) => j.status === "queued" || j.status === "processing");
      const updated = await Promise.all(
        pending.map(async (j) => {
          try {
            const res = await fetch(`/api/media/video/${j.id}`, { cache: "no-store" });
            const data = await res.json();
            return res.ok && data.job ? (data.job as Job) : j;
          } catch {
            return j;
          }
        }),
      );
      setJobs((cur) => cur.map((j) => updated.find((u) => u.id === j.id) ?? j));
    }, POLL_MS);
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, [open, rendering, jobs]);

  async function start() {
    if (!selected) return;
    setStarting(true);
    setStartError(null);
    try {
      const res = await fetch("/api/media/video", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ proposal_id: proposalId, image_job_id: selected, prompt: prompt.trim() || undefined, duration_s: duration }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? "Could not start the video");
      setJobs((cur) => [data.job as Job, ...cur]);
    } catch (e) {
      setStartError(e instanceof Error ? e.message : "Could not start the video");
    } finally {
      setStarting(false);
    }
  }

  const cost = options?.estimated_cost_usd?.[String(duration)];

  return (
    <div className="mt-2">
      {!open ? (
        <Button type="button" variant="outline" size="sm" onClick={() => setOpen(true)}>
          <Sparkles className="h-4 w-4 mr-1.5 text-primary" /> Generate with AI
        </Button>
      ) : (
        <div className="rounded-lg border bg-muted/30 p-4 space-y-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-sm font-semibold flex items-center gap-1.5">
                <Sparkles className="h-4 w-4 text-primary" /> Generate a video from this proposal&apos;s images
              </p>
              <p className="text-xs text-muted-foreground mt-0.5">
                Pick an image (jersey, stadium or campaign creative) and it becomes a short video with the sponsor&apos;s logo.
                {options && ` Made with ${options.model_label}${options.has_audio ? " (with sound)" : ", no sound"}.`}
              </p>
            </div>
            <Button type="button" variant="ghost" size="sm" onClick={() => setOpen(false)} aria-label="Close">
              <X className="h-4 w-4" />
            </Button>
          </div>

          {loading && (
            <p className="text-sm text-muted-foreground flex items-center gap-2">
              <Loader2 className="h-4 w-4 animate-spin" /> Loading images…
            </p>
          )}
          {loadError && (
            <p className="text-sm text-red-600 flex items-center gap-2">
              <AlertCircle className="h-4 w-4" /> {loadError}
            </p>
          )}
          {!configured && !loading && (
            <p className="text-sm text-amber-700">Video generation is not set up yet. Ask an admin to finish setup.</p>
          )}

          {!loading && !loadError && configured && (
            <>
              {images.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  This proposal has no generated images yet. Create a jersey, stadium or campaign image first, then come back here.
                </p>
              ) : (
                <div className="space-y-3">
                  <div>
                    <Label className="text-xs font-semibold">1. Choose the image</Label>
                    <div className="mt-1.5 grid grid-cols-3 sm:grid-cols-4 gap-2">
                      {images.map((img) => (
                        <button
                          key={img.id}
                          type="button"
                          onClick={() => setSelected(img.id)}
                          className={`relative rounded-md overflow-hidden border-2 text-left ${
                            selected === img.id ? "border-primary" : "border-transparent hover:border-muted-foreground/30"
                          }`}
                          title={img.label}
                        >
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img src={img.url} alt={img.label} className="aspect-video w-full object-cover" loading="lazy" />
                          <span className="block truncate bg-background/90 px-1.5 py-0.5 text-[10px]">{img.label}</span>
                          {selected === img.id && (
                            <span className="absolute top-1 right-1 rounded-full bg-primary p-0.5 text-primary-foreground">
                              <Check className="h-3 w-3" />
                            </span>
                          )}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div>
                    <Label htmlFor="video_motion_prompt" className="text-xs font-semibold">
                      2. Describe the movement <span className="font-normal text-muted-foreground">(optional)</span>
                    </Label>
                    <Textarea
                      id="video_motion_prompt"
                      rows={2}
                      maxLength={options?.max_prompt_chars ?? 500}
                      value={prompt}
                      onChange={(e) => setPrompt(e.target.value)}
                      placeholder="Leave empty for a ready-made motion that fits the image. Example: slow camera move across the stadium, flags waving."
                      className="mt-1.5"
                    />
                  </div>

                  <div className="flex flex-wrap items-end gap-4">
                    <div>
                      <Label className="text-xs font-semibold">3. Length</Label>
                      <div className="mt-1.5 flex gap-2">
                        {(options?.durations ?? [5, 10]).map((d) => (
                          <button
                            key={d}
                            type="button"
                            onClick={() => setDuration(d)}
                            className={`rounded-md border px-3 py-1.5 text-sm ${
                              duration === d ? "border-primary bg-primary/10 font-medium" : "hover:bg-accent"
                            }`}
                          >
                            {d} seconds
                          </button>
                        ))}
                      </div>
                    </div>
                    <Button type="button" onClick={start} disabled={!selected || starting}>
                      {starting ? <Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> : <Sparkles className="h-4 w-4 mr-1.5" />}
                      {starting ? "Starting…" : "Generate video"}
                    </Button>
                    {cost !== undefined && <span className="text-xs text-muted-foreground pb-2">About ${cost.toFixed(2)} per video</span>}
                  </div>
                  {startError && (
                    <p className="text-sm text-red-600 flex items-center gap-2">
                      <AlertCircle className="h-4 w-4" /> {startError}
                    </p>
                  )}
                </div>
              )}

              {jobs.length > 0 && (
                <div className="space-y-2">
                  <Label className="text-xs font-semibold">Your videos</Label>
                  <div className="grid gap-3 sm:grid-cols-2">
                    {jobs.map((j) => (
                      <div key={j.id} className="rounded-md border bg-background p-2.5 space-y-2">
                        {j.status === "completed" && j.output_url ? (
                          <video src={j.output_url} controls playsInline preload="metadata" className="w-full rounded aspect-video bg-black" />
                        ) : j.status === "failed" ? (
                          <p className="text-xs text-red-600 flex items-start gap-1.5">
                            <AlertCircle className="h-3.5 w-3.5 mt-0.5 shrink-0" /> {j.error_message ?? "The video could not be made."}
                          </p>
                        ) : (
                          <div className="relative">
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img src={j.source_image_url} alt="" className="w-full rounded aspect-video object-cover opacity-60" />
                            <span className="absolute inset-0 flex items-center justify-center gap-2 text-sm font-medium">
                              <Loader2 className="h-4 w-4 animate-spin" /> Making your video… about 1–3 minutes
                            </span>
                          </div>
                        )}
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-[11px] text-muted-foreground">
                            {j.duration_s}s · {new Date(j.created_at).toLocaleString()}
                          </span>
                          {j.status === "completed" && j.output_url && (
                            j.output_url === currentUrl ? (
                              <span className="text-xs font-medium text-green-700 flex items-center gap-1">
                                <Check className="h-3.5 w-3.5" /> In use
                              </span>
                            ) : (
                              <Button type="button" size="sm" onClick={() => onUse(j.output_url!)}>
                                Use as intro
                              </Button>
                            )
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                  <p className="text-xs text-muted-foreground">After choosing &ldquo;Use as intro&rdquo;, remember to save the proposal.</p>
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}
