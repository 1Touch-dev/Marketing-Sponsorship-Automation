"use client";

import React, { useState } from "react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toaster";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import {
  Sparkles, Check, X, Loader2, Plus, Eye, Download, Wand2,
  Image as ImageIcon, Clock, Zap,
} from "lucide-react";

type Job = Record<string, unknown>;

const JOB_TYPES = [
  { value: "jersey_mockup", label: "Jersey Mockup" },
  { value: "led_board", label: "LED Board" },
  { value: "stadium_banner", label: "Stadium Banner" },
  { value: "social_post", label: "Social Post" },
  { value: "press_backdrop", label: "Press Backdrop" },
  { value: "scoreboard", label: "Scoreboard" },
  { value: "fan_zone", label: "Fan Zone Activation" },
  { value: "custom", label: "Custom" },
];

const PROMPT_TEMPLATES: Record<string, string> = {
  jersey_mockup: "Photorealistic Coritiba FC official green and white jersey hanging on a minimalist display, sponsor logo placement visible on chest, professional product photography, white background, high detail",
  led_board: "Wide-angle broadcast photography of Couto Pereira stadium Curitiba during a night match, LED perimeter boards glowing with sponsor branding in Coritiba green and white colors, crowd visible in background",
  stadium_banner: "Large vinyl sponsor banner hanging inside Couto Pereira stadium grandstand, Coritiba FC green and white colors, professional event photography, crowd atmosphere",
  social_post: "Modern Brazilian football social media post design, Coritiba FC Verde e Branco identity, sponsor brand integration, clean typography, vibrant greens, professional graphic design",
  press_backdrop: "Post-match press conference backdrop at Couto Pereira stadium, Coritiba FC green and white design, sponsor logos arranged in grid pattern, press zone lighting",
  scoreboard: "Couto Pereira stadium giant LED scoreboard displaying sponsor advertisement, night match atmosphere, crowd visible, dramatic stadium lighting",
};

const STATUS_COLORS: Record<string, string> = {
  pending_approval: "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300",
  approved: "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300",
  generating: "bg-purple-100 text-purple-700 dark:bg-purple-900/40 dark:text-purple-300",
  completed: "bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300",
  failed: "bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300",
  rejected: "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300",
};

export function ImageGenerationManager({ jobs, proposals, companies }: { jobs: Job[]; proposals: Job[]; companies: Job[] }) {
  const { toast } = useToast();
  const [localJobs, setLocalJobs] = useState<Job[]>(jobs);
  const [showNew, setShowNew] = useState(false);
  const [loadingId, setLoadingId] = useState<string | null>(null);
  const [previewJob, setPreviewJob] = useState<Job | null>(null);

  // New job form state
  const [form, setForm] = useState({
    job_type: "jersey_mockup",
    prompt: PROMPT_TEMPLATES.jersey_mockup,
    negative_prompt: "blurry, low quality, text errors, wrong colors, competitor clubs",
    style_notes: "",
    proposal_id: "",
    company_id: "",
    size: "1024x1024",
    quality: "standard",
  });

  async function createJob() {
    if (!form.prompt.trim()) return;
    setLoadingId("new");
    try {
      const payload = {
        ...form,
        proposal_id: form.proposal_id?.trim() || undefined,
        company_id: form.company_id?.trim() || undefined,
        style_notes: form.style_notes?.trim() || undefined,
        triggered_by: "manual",
      };
      const res = await fetch("/api/image-generation", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
      });
      const j = await res.json() as { job?: Job; error?: string };
      if (!res.ok || !j.job) throw new Error(j.error ?? "Failed");
      setLocalJobs(prev => [j.job!, ...prev]);
      setShowNew(false);
      toast({ variant: "success", title: "Job created", description: "Review and approve before generating." });
    } catch (err) {
      toast({ variant: "destructive", title: "Error", description: err instanceof Error ? err.message : "Failed" });
    } finally {
      setLoadingId(null);
    }
  }

  /** One-click: create → approve → generate */
  async function createAndGenerate() {
    if (!form.prompt.trim()) return;
    setLoadingId("new_generate");
    try {
      // Step 1: create
      const payload = {
        ...form,
        proposal_id: form.proposal_id?.trim() || undefined,
        company_id: form.company_id?.trim() || undefined,
        style_notes: form.style_notes?.trim() || undefined,
        triggered_by: "manual",
      };
      const res1 = await fetch("/api/image-generation", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
      });
      const j1 = await res1.json() as { job?: Job; error?: string };
      if (!res1.ok || !j1.job) throw new Error(j1.error ?? "Failed to create job");

      const jobId = (j1.job as Record<string, string>).id;
      setLocalJobs(prev => [j1.job!, ...prev]);
      setShowNew(false);

      // Step 2: approve
      await fetch("/api/image-generation", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ job_id: jobId, action: "approve", approved_by: "admin" }),
      });
      setLocalJobs(prev => prev.map(j => (j.id as string) === jobId ? { ...j, status: "approved" } : j));
      toast({ title: "Generating image…", description: "This may take 15–30 seconds." });

      // Step 3: generate
      const res3 = await fetch("/api/image-generation", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ job_id: jobId, action: "generate" }),
      });
      const d3 = await res3.json() as { output_urls?: Array<{ url: string }>; error?: string };
      if (!res3.ok) throw new Error(d3.error ?? "Generation failed");

      setLocalJobs(prev => prev.map(j => (j.id as string) === jobId
        ? { ...j, status: "completed", output_urls: d3.output_urls, selected_url: d3.output_urls?.[0]?.url }
        : j
      ));
      toast({ variant: "success", title: "Image generated!" });
    } catch (err) {
      toast({ variant: "destructive", title: "Generation failed", description: err instanceof Error ? err.message : "Error" });
    } finally {
      setLoadingId(null);
    }
  }

  async function approveJob(jobId: string) {
    setLoadingId(jobId + "_approve");
    try {
      const res = await fetch("/api/image-generation", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ job_id: jobId, action: "approve", approved_by: "admin" }),
      });
      if (res.ok) setLocalJobs(prev => prev.map(j => (j.id as string) === jobId ? { ...j, status: "approved" } : j));
      toast({ variant: "success", title: "Job approved" });
    } finally { setLoadingId(null); }
  }

  async function rejectJob(jobId: string) {
    setLoadingId(jobId + "_reject");
    try {
      const res = await fetch("/api/image-generation", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ job_id: jobId, action: "reject", rejection_reason: "Rejected by admin" }),
      });
      if (res.ok) setLocalJobs(prev => prev.map(j => (j.id as string) === jobId ? { ...j, status: "rejected" } : j));
    } finally { setLoadingId(null); }
  }

  async function generateJob(jobId: string) {
    setLoadingId(jobId + "_gen");
    toast({ title: "Generating image…", description: "This may take 15–30 seconds." });
    try {
      const res = await fetch("/api/image-generation", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ job_id: jobId, action: "generate" }),
      });
      const data = await res.json() as { output_urls?: Array<{ url: string }>; error?: string };
      if (!res.ok) throw new Error(data.error ?? "Generation failed");
      setLocalJobs(prev => prev.map(j => (j.id as string) === jobId
        ? { ...j, status: "completed", output_urls: data.output_urls, selected_url: data.output_urls?.[0]?.url }
        : j
      ));
      toast({ variant: "success", title: "Image generated!" });
    } catch (err) {
      setLocalJobs(prev => prev.map(j => (j.id as string) === jobId ? { ...j, status: "failed" } : j));
      toast({ variant: "destructive", title: "Generation failed", description: err instanceof Error ? err.message : "Error" });
    } finally { setLoadingId(null); }
  }

  async function retryJob(jobId: string) {
    setLoadingId(jobId + "_retry");
    try {
      // Reset to approved
      await fetch("/api/image-generation", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ job_id: jobId, action: "approve", approved_by: "admin" }),
      });
      setLocalJobs(prev => prev.map(j => (j.id as string) === jobId ? { ...j, status: "approved" } : j));
      toast({ title: "Retrying generation…", description: "This may take 15–30 seconds." });

      const res = await fetch("/api/image-generation", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ job_id: jobId, action: "generate" }),
      });
      const data = await res.json() as { output_urls?: Array<{ url: string }>; error?: string };
      if (!res.ok) throw new Error(data.error ?? "Generation failed");
      setLocalJobs(prev => prev.map(j => (j.id as string) === jobId
        ? { ...j, status: "completed", output_urls: data.output_urls, selected_url: data.output_urls?.[0]?.url }
        : j
      ));
      toast({ variant: "success", title: "Image generated!" });
    } catch (err) {
      setLocalJobs(prev => prev.map(j => (j.id as string) === jobId ? { ...j, status: "failed" } : j));
      toast({ variant: "destructive", title: "Retry failed", description: err instanceof Error ? err.message : "Error" });
    } finally { setLoadingId(null); }
  }

  return (
    <div className="space-y-4">
      {/* New Job Button */}
      <div className="flex justify-between items-center">
        <div className="text-sm text-muted-foreground">{localJobs.length} job{localJobs.length !== 1 ? "s" : ""} · Approval-first pipeline</div>
        <Button size="sm" onClick={() => setShowNew(v => !v)} className="gap-1.5">
          <Plus className="h-3.5 w-3.5" /> New Generation Job
        </Button>
      </div>

      {/* New job form */}
      {showNew && (
        <div className="rounded-xl border bg-card p-4 space-y-3">
          <div className="font-semibold text-sm">New Image Generation Job</div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <Label className="text-xs">Job Type</Label>
              <select
                value={form.job_type}
                onChange={e => setForm(f => ({ ...f, job_type: e.target.value, prompt: PROMPT_TEMPLATES[e.target.value] ?? f.prompt }))}
                className="w-full mt-1 rounded-md border bg-background px-3 py-1.5 text-sm"
              >
                {JOB_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
              </select>
            </div>
            <div>
              <Label className="text-xs">Proposal (optional)</Label>
              <select
                value={form.proposal_id}
                onChange={e => setForm(f => ({ ...f, proposal_id: e.target.value }))}
                className="w-full mt-1 rounded-md border bg-background px-3 py-1.5 text-sm"
              >
                <option value="">None</option>
                {proposals.map(p => <option key={p.id as string} value={p.id as string}>{(p.title as string).slice(0, 60)}</option>)}
              </select>
            </div>
          </div>
          <div>
            <Label className="text-xs">Prompt *</Label>
            <Textarea rows={4} value={form.prompt} onChange={e => setForm(f => ({ ...f, prompt: e.target.value }))} className="mt-1 text-sm" />
          </div>
          <div>
            <Label className="text-xs">Negative Prompt</Label>
            <Input value={form.negative_prompt} onChange={e => setForm(f => ({ ...f, negative_prompt: e.target.value }))} className="mt-1 text-sm" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs">Size</Label>
              <select value={form.size} onChange={e => setForm(f => ({ ...f, size: e.target.value }))} className="w-full mt-1 rounded-md border bg-background px-3 py-1.5 text-sm">
                <option value="1024x1024">1024×1024 (Square)</option>
                <option value="1536x1024">1536×1024 (Landscape)</option>
                <option value="1024x1536">1024×1536 (Portrait)</option>
              </select>
            </div>
            <div>
              <Label className="text-xs">Quality</Label>
              <select value={form.quality} onChange={e => setForm(f => ({ ...f, quality: e.target.value }))} className="w-full mt-1 rounded-md border bg-background px-3 py-1.5 text-sm">
                <option value="standard">Standard</option>
                <option value="hd">HD</option>
              </select>
            </div>
          </div>
          <div className="flex gap-2 pt-1 flex-wrap">
            <Button size="sm" onClick={createAndGenerate} disabled={!!loadingId} className="gap-1.5 bg-purple-600 hover:bg-purple-700 text-white">
              {loadingId === "new_generate" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Wand2 className="h-3.5 w-3.5" />}
              Generate Now
            </Button>
            <Button size="sm" variant="outline" onClick={createJob} disabled={!!loadingId} className="gap-1.5">
              {loadingId === "new" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />}
              Save for Later
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setShowNew(false)}>Cancel</Button>
          </div>
        </div>
      )}

      {/* Job list */}
      {localJobs.length === 0 ? (
        <div className="text-center py-10 text-muted-foreground text-sm">
          No generation jobs yet. Create one above.<br />
          <span className="text-xs opacity-70">Jobs require approval before DALL-E generates images.</span>
        </div>
      ) : (
        <div className="space-y-3">
          {localJobs.map(job => {
            const jobId = job.id as string;
            const status = job.status as string;
            const outputs = (job.output_urls as Array<{ url: string }>) ?? [];
            return (
              <div key={jobId} className="rounded-xl border bg-card p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${STATUS_COLORS[status] ?? "bg-muted text-muted-foreground"}`}>
                        {status.replace(/_/g, " ")}
                      </span>
                      <span className="text-xs text-muted-foreground bg-muted px-2 py-0.5 rounded-full">
                        {JOB_TYPES.find(t => t.value === String(job.job_type ?? ""))?.label ?? String(job.job_type ?? "custom")}
                      </span>
                      {!!job.size && <span className="text-xs text-muted-foreground">{String(job.size)}</span>}
                    </div>
                    <div className="mt-2 text-sm text-foreground/80 line-clamp-2">{job.prompt as string}</div>
                  </div>
                  <div className="flex items-center gap-1 flex-shrink-0">
                    {status === "pending_approval" && (
                      <>
                        <Button size="sm" variant="outline" className="h-7 px-2 gap-1 text-green-600 hover:text-green-600 border-green-300" onClick={() => approveJob(jobId)} disabled={!!loadingId}>
                          {loadingId === jobId + "_approve" ? <Loader2 className="h-3 w-3 animate-spin" /> : <Check className="h-3 w-3" />}
                          Approve
                        </Button>
                        <Button size="sm" variant="outline" className="h-7 px-2 gap-1 text-red-500 hover:text-red-500 border-red-200" onClick={() => rejectJob(jobId)} disabled={!!loadingId}>
                          <X className="h-3 w-3" /> Reject
                        </Button>
                      </>
                    )}
                    {status === "approved" && (
                      <Button size="sm" className="h-7 px-3 gap-1 bg-purple-600 hover:bg-purple-700 text-white" onClick={() => generateJob(jobId)} disabled={!!loadingId}>
                        {loadingId === jobId + "_gen" ? <Loader2 className="h-3 w-3 animate-spin" /> : <Sparkles className="h-3 w-3" />}
                        Generate
                      </Button>
                    )}
                    {status === "generating" && (
                      <Button size="sm" variant="outline" className="h-7 px-2" disabled>
                        <Loader2 className="h-3 w-3 animate-spin" /> Generating…
                      </Button>
                    )}
                    {status === "failed" && (
                      <Button size="sm" variant="outline" className="h-7 px-2 gap-1 text-amber-600 border-amber-300" onClick={() => retryJob(jobId)} disabled={!!loadingId}>
                        {loadingId === jobId + "_retry" ? <Loader2 className="h-3 w-3 animate-spin" /> : <Sparkles className="h-3 w-3" />}
                        Retry
                      </Button>
                    )}
                    {status === "completed" && outputs.length > 0 && (
                      <Button size="sm" variant="outline" className="h-7 px-2 gap-1" onClick={() => setPreviewJob(job)}>
                        <Eye className="h-3 w-3" /> View
                      </Button>
                    )}
                  </div>
                </div>

                {/* Generated image preview (inline) */}
                {status === "completed" && outputs.length > 0 && (
                  <div className="mt-3 flex gap-2 flex-wrap">
                    {outputs.map((img, i) => (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img key={i} src={img.url} alt="Generated" className="w-24 h-24 object-cover rounded-lg border cursor-pointer hover:opacity-80 transition-opacity" onClick={() => setPreviewJob({ ...job, _preview_url: img.url })} />
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Image preview modal */}
      {previewJob && (
        <div className="fixed inset-0 bg-black/80 z-50 flex items-center justify-center p-4" onClick={() => setPreviewJob(null)}>
          <div className="bg-card rounded-2xl max-w-2xl w-full p-4 space-y-3" onClick={e => e.stopPropagation()}>
            <div className="flex justify-between items-center">
              <div className="font-semibold">Generated Image</div>
              <Button size="sm" variant="ghost" onClick={() => setPreviewJob(null)}><X className="h-4 w-4" /></Button>
            </div>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={(previewJob._preview_url as string | undefined) ?? (previewJob.output_urls as Array<{url:string}>)?.[0]?.url ?? ""} alt="Generated" className="w-full rounded-xl object-contain max-h-[500px]" />
            <div className="text-xs text-muted-foreground line-clamp-3">{previewJob.prompt as string}</div>
            <div className="flex gap-2">
              <Button size="sm" asChild variant="outline" className="gap-1.5">
                <a href={(previewJob._preview_url as string) ?? ((previewJob.output_urls as Array<{ url: string }>)?.[0]?.url)} download target="_blank">
                  <Download className="h-3.5 w-3.5" /> Download
                </a>
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
