"use client";

import React, { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/components/ui/toaster";
import type { ProposalContent } from "@/types/database";
import {
  FileText, MessageSquare, Target, TrendingUp,
  Package, DollarSign, Zap, Save, ArrowLeft,
  AlertCircle, Info, CheckCircle2, History,
  Sparkles, Loader2, PenLine, ChevronDown, ChevronUp,
  type LucideIcon,
} from "lucide-react";

type ContentFieldKey = "executive_summary" | "campaign_rationale" | "sponsorship_value" | "activation_plan" | "investment_note" | "cta";

const SECTIONS: Array<{
  key: ContentFieldKey;
  label: string;
  description: string;
  icon: LucideIcon;
  rows: number;
  recommended: number;
}> = [
  { key: "executive_summary",  label: "Executive summary",   description: "Powerful opening about this Coritiba FC partnership (~120 words)",   icon: FileText,    rows: 5, recommended: 120 },
  { key: "campaign_rationale", label: "Campaign rationale",  description: "Why this sponsorship at Coritiba FC makes business sense (~150 words)", icon: Target,      rows: 5, recommended: 150 },
  { key: "sponsorship_value",  label: "Sponsorship value",   description: "Concrete value delivered to the sponsor (~120 words)",                icon: TrendingUp,  rows: 5, recommended: 120 },
  { key: "activation_plan",    label: "Activation plan",     description: "Specific phased activation at Couto Pereira (~200 words)",            icon: Zap,         rows: 7, recommended: 200 },
  { key: "investment_note",    label: "Investment overview", description: "High-level investment framing (aspirational)",                        icon: DollarSign,  rows: 3, recommended: 80  },
  { key: "cta",                label: "Call to action",      description: "Single compelling CTA to partner with Coritiba FC",                  icon: MessageSquare, rows: 2, recommended: 40 },
];

const STYLE_LABELS: Record<string, string> = {
  "professional and data-driven": "Data-driven",
  "emotional and storytelling": "Storytelling",
  "concise and executive": "Executive",
};

interface SectionVariant {
  label: string; // A, B, C
  style: string;
  text: string;
}

function wordCount(text: string): number {
  return text.trim().split(/\s+/).filter(Boolean).length;
}

function WordCountBadge({ text, recommended }: { text: string; recommended: number }) {
  const words = wordCount(text);
  const ratio = words / recommended;
  let color = "text-muted-foreground";
  if (ratio >= 0.7 && ratio <= 1.4) color = "text-green-600 dark:text-green-400";
  else if (ratio < 0.4) color = "text-amber-600 dark:text-amber-400";
  else if (ratio > 1.6) color = "text-amber-600 dark:text-amber-400";
  return (
    <span className={`text-xs ${color}`}>
      {words} words {words > 0 && `(~${recommended} recommended)`}
    </span>
  );
}

// ─── Section option picker ─────────────────────────────────────────────────
function SectionPicker({
  sectionKey,
  currentText,
  proposalId,
  companyName,
  industry,
  campaignTitle,
  onSelect,
}: {
  sectionKey: string;
  currentText: string;
  proposalId: string;
  companyName?: string;
  industry?: string;
  campaignTitle?: string;
  onSelect: (text: string) => void;
}) {
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [variants, setVariants] = useState<SectionVariant[]>([]);
  const [selected, setSelected] = useState<string | null>(null);

  async function generate() {
    setLoading(true);
    setOpen(true);
    try {
      const res = await fetch(`/api/proposals/${proposalId}/section-variants`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          section: sectionKey,
          company_name: companyName,
          industry,
          campaign_title: campaignTitle,
          current_text: currentText,
        }),
      });
      const j = await res.json() as { variants?: SectionVariant[]; error?: string };
      if (!res.ok || !j.variants) throw new Error(j.error ?? "Generation failed");
      setVariants(j.variants);
      setSelected(null);
    } catch (err) {
      toast({
        variant: "destructive",
        title: "Could not generate options",
        description: err instanceof Error ? err.message : "Unknown error",
      });
      setOpen(false);
    } finally {
      setLoading(false);
    }
  }

  function apply() {
    if (!selected) return;
    const variant = variants.find((v) => v.label === selected);
    if (variant) onSelect(variant.text);
    setOpen(false);
    toast({ variant: "success", title: `Option ${selected} applied`, description: "Text updated — remember to save." });
  }

  const styleColors: Record<string, string> = {
    A: "border-blue-400 bg-blue-50 dark:bg-blue-900/20",
    B: "border-emerald-400 bg-emerald-50 dark:bg-emerald-900/20",
    C: "border-purple-400 bg-purple-50 dark:bg-purple-900/20",
  };
  const styleBadgeColors: Record<string, string> = {
    A: "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300",
    B: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300",
    C: "bg-purple-100 text-purple-700 dark:bg-purple-900/40 dark:text-purple-300",
  };

  return (
    <div className="mt-2">
      <Button
        type="button"
        size="sm"
        variant="outline"
        onClick={open ? () => setOpen(false) : generate}
        className="gap-1.5 text-xs h-7 border-dashed"
        disabled={loading}
      >
        {loading ? (
          <Loader2 className="h-3 w-3 animate-spin" />
        ) : (
          <Sparkles className="h-3 w-3 text-amber-500" />
        )}
        {loading ? "Generating A / B / C options…" : open ? "Hide options" : "Generate A / B / C options"}
        {!loading && (open ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />)}
      </Button>

      {open && !loading && variants.length > 0 && (
        <div className="mt-3 space-y-3">
          <div className="text-xs text-muted-foreground font-medium">
            Pick an option — or keep your current text and close
          </div>

          {variants.map((v) => (
            <button
              key={v.label}
              type="button"
              onClick={() => setSelected(v.label === selected ? null : v.label)}
              className={`w-full text-left rounded-xl border-2 p-4 transition-all ${
                selected === v.label
                  ? styleColors[v.label] + " border-opacity-100 ring-2 ring-offset-1 " + (v.label === "A" ? "ring-blue-400" : v.label === "B" ? "ring-emerald-400" : "ring-purple-400")
                  : "border-border hover:border-muted-foreground/40 bg-card"
              }`}
            >
              <div className="flex items-center gap-2 mb-2">
                <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${styleBadgeColors[v.label]}`}>
                  Option {v.label}
                </span>
                <span className="text-xs text-muted-foreground">
                  {STYLE_LABELS[v.style] ?? v.style}
                </span>
                {selected === v.label && (
                  <CheckCircle2 className="h-3.5 w-3.5 text-green-500 ml-auto" />
                )}
              </div>
              <p className="text-sm leading-relaxed text-foreground/90 whitespace-pre-wrap line-clamp-5">
                {v.text}
              </p>
              <div className="mt-1.5 text-xs text-muted-foreground">
                {wordCount(v.text)} words
              </div>
            </button>
          ))}

          {/* Custom option */}
          <button
            type="button"
            onClick={() => setSelected("CUSTOM")}
            className={`w-full text-left rounded-xl border-2 p-4 transition-all ${
              selected === "CUSTOM"
                ? "border-slate-400 bg-slate-50 dark:bg-slate-800 ring-2 ring-slate-400 ring-offset-1"
                : "border-dashed border-border hover:border-muted-foreground/40 bg-card"
            }`}
          >
            <div className="flex items-center gap-2 mb-1">
              <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-slate-100 text-slate-700 dark:bg-slate-700 dark:text-slate-300">
                Custom
              </span>
              <span className="text-xs text-muted-foreground">Keep my current text and edit manually</span>
              {selected === "CUSTOM" && <CheckCircle2 className="h-3.5 w-3.5 text-green-500 ml-auto" />}
            </div>
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground mt-1">
              <PenLine className="h-3 w-3" /> Edit the text field directly below
            </div>
          </button>

          <div className="flex gap-2 pt-1">
            <Button
              type="button"
              size="sm"
              disabled={!selected || selected === "CUSTOM"}
              onClick={apply}
              className="gap-1.5"
            >
              <CheckCircle2 className="h-3.5 w-3.5" />
              Apply option {selected && selected !== "CUSTOM" ? selected : ""}
            </Button>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              onClick={() => setOpen(false)}
            >
              Close
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Main editor ──────────────────────────────────────────────────────────
export function ProposalEditor({
  id,
  initialTitle,
  initialContent,
  proposalStatus,
  versions,
  companyName,
  industry,
  campaignTitle,
}: {
  id: string;
  initialTitle: string;
  initialContent: ProposalContent;
  proposalStatus: string;
  versions?: Array<{ version: number; edit_reason: string | null; created_at: string }>;
  companyName?: string;
  industry?: string;
  campaignTitle?: string;
}) {
  const router = useRouter();
  const { toast } = useToast();
  const [title, setTitle] = useState(initialTitle);
  const [content, setContent] = useState<ProposalContent>({
    executive_summary: initialContent?.executive_summary ?? "",
    campaign_rationale: initialContent?.campaign_rationale ?? "",
    sponsorship_value: initialContent?.sponsorship_value ?? "",
    activation_plan: initialContent?.activation_plan ?? "",
    deliverables: initialContent?.deliverables ?? [],
    investment_note: initialContent?.investment_note ?? "",
    cta: initialContent?.cta ?? "",
    title: initialContent?.title ?? initialTitle,
  });
  const [reason, setReason] = useState("");
  const [deliverablesText, setDeliverablesText] = useState(
    (initialContent?.deliverables ?? []).join("\n"),
  );
  const [busy, setBusy] = useState(false);
  const [activeSection, setActiveSection] = useState<ContentFieldKey | null>(null);

  const isApproved = proposalStatus === "approved" || proposalStatus === "sent";

  async function onSave(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      const deliverables = deliverablesText
        .split("\n")
        .map((s) => s.trim())
        .filter(Boolean);
      const payload = {
        title,
        content: { ...content, title, deliverables },
        edit_reason: reason || "Manual edit",
      };
      const res = await fetch(`/api/proposals/${id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
      });
      const j = await res.json() as { data?: { version?: number }; error?: string };
      if (!res.ok) throw new Error(j?.error ?? `Failed (${res.status})`);
      toast({
        variant: "success",
        title: "Draft saved",
        description: `Version ${j.data?.version ?? "?"} created successfully.`,
      });
      router.push(`/proposals/${id}`);
      router.refresh();
    } catch (err) {
      toast({
        variant: "destructive",
        title: "Save failed",
        description: err instanceof Error ? err.message : "Unknown error",
      });
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={onSave}>
      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
        {/* Left nav */}
        <div className="lg:col-span-1 space-y-1">
          <div className="text-xs font-medium text-muted-foreground mb-2 uppercase tracking-wide">
            Sections
          </div>
          {SECTIONS.map((s) => {
            const val = (content[s.key] as string) ?? "";
            const hasContent = wordCount(val) > 10;
            return (
              <button
                key={s.key}
                type="button"
                onClick={() => {
                  setActiveSection(s.key as ContentFieldKey);
                  document.getElementById(`section-${s.key}`)?.scrollIntoView({ behavior: "smooth", block: "center" });
                }}
                className={`w-full flex items-center gap-2 rounded-lg px-3 py-2 text-sm text-left transition-colors ${
                  activeSection === s.key ? "bg-primary/10 text-primary" : "hover:bg-accent"
                }`}
              >
                <s.icon className="h-3.5 w-3.5 flex-shrink-0" />
                <span className="flex-1 truncate">{s.label}</span>
                {hasContent ? (
                  <CheckCircle2 className="h-3 w-3 text-green-500 flex-shrink-0" />
                ) : (
                  <div className="h-3 w-3 rounded-full border border-muted-foreground/30 flex-shrink-0" />
                )}
              </button>
            );
          })}
          <button
            type="button"
            onClick={() => document.getElementById("section-deliverables")?.scrollIntoView({ behavior: "smooth", block: "center" })}
            className="w-full flex items-center gap-2 rounded-lg px-3 py-2 text-sm text-left transition-colors hover:bg-accent"
          >
            <Package className="h-3.5 w-3.5 flex-shrink-0" />
            <span className="flex-1">Deliverables</span>
            {deliverablesText.trim() ? (
              <CheckCircle2 className="h-3 w-3 text-green-500 flex-shrink-0" />
            ) : (
              <div className="h-3 w-3 rounded-full border border-muted-foreground/30 flex-shrink-0" />
            )}
          </button>

          {/* Version history */}
          {versions && versions.length > 0 && (
            <div className="pt-4 border-t mt-4">
              <div className="text-xs font-medium text-muted-foreground mb-2 flex items-center gap-1">
                <History className="h-3 w-3" /> Version history
              </div>
              {versions.slice(0, 5).map((v) => (
                <div key={v.version} className="text-xs text-muted-foreground px-2 py-1">
                  <span className="font-mono font-medium">v{v.version}</span>
                  {v.edit_reason && (
                    <span className="truncate block text-muted-foreground/70 pl-3">
                      {v.edit_reason}
                    </span>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Main edit area */}
        <div className="lg:col-span-3 space-y-5">
          {/* Status warning */}
          {isApproved && (
            <div className="flex items-start gap-2 p-3 rounded-lg bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800">
              <AlertCircle className="h-4 w-4 text-amber-600 mt-0.5 flex-shrink-0" />
              <div className="text-sm text-amber-700 dark:text-amber-300">
                <strong>This proposal is {proposalStatus}.</strong> Saving a new version will keep its current status and create a new version snapshot.
              </div>
            </div>
          )}

          {/* Coritiba context reminder */}
          <div className="flex items-start gap-2 p-3 rounded-lg bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800">
            <Info className="h-4 w-4 text-green-600 mt-0.5 flex-shrink-0" />
            <div className="text-xs text-green-700 dark:text-green-300">
              All edits should maintain <strong>Coritiba FC / Couto Pereira</strong> context.{" "}
              Use <span className="font-medium">Generate A / B / C options</span> on any section to get AI-written alternatives to choose from.
            </div>
          </div>

          {/* Title */}
          <div className="space-y-1.5">
            <Label htmlFor="title" className="flex items-center gap-2 font-semibold">
              <FileText className="h-4 w-4 text-primary" /> Proposal title
            </Label>
            <Input
              id="title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              required
              className="text-base font-medium"
              placeholder="Coritiba FC × [Company Name] — Partnership Proposal"
            />
          </div>

          {/* Dynamic sections */}
          {SECTIONS.map((s) => (
            <div
              key={s.key}
              id={`section-${s.key}`}
              className="space-y-1.5 scroll-mt-20 rounded-xl border border-border/60 p-4 hover:border-border transition-colors"
              onClick={() => setActiveSection(s.key as ContentFieldKey)}
            >
              <Label htmlFor={s.key} className="flex items-center gap-2 font-semibold">
                <s.icon className="h-4 w-4 text-primary" />
                {s.label}
              </Label>
              <div className="text-xs text-muted-foreground mb-1">{s.description}</div>

              <Textarea
                id={s.key}
                rows={s.rows}
                value={(content[s.key] as string) ?? ""}
                onChange={(e) => setContent({ ...content, [s.key]: e.target.value })}
                className={`transition-all ${activeSection === s.key ? "ring-1 ring-primary" : ""}`}
              />

              <div className="flex items-center justify-between">
                <SectionPicker
                  sectionKey={s.key}
                  currentText={(content[s.key] as string) ?? ""}
                  proposalId={id}
                  companyName={companyName}
                  industry={industry}
                  campaignTitle={campaignTitle}
                  onSelect={(text) => setContent({ ...content, [s.key]: text })}
                />
                <WordCountBadge
                  text={(content[s.key] as string) ?? ""}
                  recommended={s.recommended}
                />
              </div>
            </div>
          ))}

          {/* Deliverables */}
          <div id="section-deliverables" className="space-y-1.5 scroll-mt-20 rounded-xl border border-border/60 p-4">
            <Label htmlFor="deliverables" className="flex items-center gap-2 font-semibold">
              <Package className="h-4 w-4 text-primary" /> Deliverables
            </Label>
            <div className="text-xs text-muted-foreground mb-1">
              One deliverable per line. Each becomes a bullet point in the proposal.
            </div>
            <Textarea
              id="deliverables"
              rows={5}
              value={deliverablesText}
              onChange={(e) => setDeliverablesText(e.target.value)}
              placeholder={"Coritiba FC jersey brand placement (chest)\nCouto Pereira LED board x20 matchday\nSocial media activation — 4 posts/month\nMatchday PA announcement\nYouth academy co-branding"}
            />
            <div className="text-xs text-muted-foreground text-right">
              {deliverablesText.split("\n").filter((l) => l.trim()).length} deliverables
            </div>
          </div>

          {/* Edit reason */}
          <div className="space-y-1.5 pt-2 border-t">
            <Label htmlFor="reason" className="flex items-center gap-2 font-semibold">
              <History className="h-4 w-4 text-muted-foreground" /> Reason for edit
              <span className="text-muted-foreground font-normal text-xs">(optional but recommended)</span>
            </Label>
            <Input
              id="reason"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="e.g. Updated activation plan with Couto Pereira LED boards, tightened executive summary"
            />
          </div>

          {/* Actions */}
          <div className="flex gap-3 pt-2">
            <Button type="submit" disabled={busy} className="gap-2">
              <Save className="h-4 w-4" />
              {busy ? "Saving draft…" : "Save as new version"}
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={() => router.push(`/proposals/${id}`)}
              className="gap-2"
            >
              <ArrowLeft className="h-4 w-4" /> Back to proposal
            </Button>
          </div>
        </div>
      </div>
    </form>
  );
}
