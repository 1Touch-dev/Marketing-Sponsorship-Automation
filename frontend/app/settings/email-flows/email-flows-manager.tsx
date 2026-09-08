"use client";

import React, { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/components/ui/toaster";
import { Loader2, Plus, Trash2, Save, Play, Workflow, AlertCircle } from "lucide-react";

type FlowType = "intro" | "follow_up" | "negotiation" | "barter";
type Tone = "warm" | "formal" | "urgent";

type Step = { flow_type: FlowType; template_id: string | null; delay_days: number; tone?: Tone | null };

const TONE_LABEL: Record<Tone, string> = { warm: "Warm", formal: "Formal", urgent: "Urgent" };
const TONES: Tone[] = ["warm", "formal", "urgent"];

type Sequence = {
  id: string;
  name: string;
  description?: string | null;
  steps: Step[] | string;
  is_default?: boolean;
};

type TemplateLite = { id: string; name: string; flow_type?: string };

const FLOW_LABEL: Record<FlowType, string> = {
  intro: "Introdução / Outreach",
  follow_up: "Follow-up",
  negotiation: "Negociação",
  barter: "Barter / Permuta",
};

const FLOW_TYPES: FlowType[] = ["intro", "follow_up", "negotiation", "barter"];

function parseSteps(raw: Step[] | string): Step[] {
  if (Array.isArray(raw)) return raw;
  try {
    return JSON.parse(raw) as Step[];
  } catch {
    return [];
  }
}

export function EmailFlowsManager({
  initialSequences,
  templates,
  migrationPending,
}: {
  initialSequences: Record<string, unknown>[];
  templates: Record<string, unknown>[];
  migrationPending: boolean;
}) {
  const router = useRouter();
  const { toast } = useToast();
  const [sequences, setSequences] = useState<Sequence[]>(initialSequences as unknown as Sequence[]);
  const [creating, setCreating] = useState(false);
  const [busy, setBusy] = useState(false);

  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [steps, setSteps] = useState<Step[]>([
    { flow_type: "intro", template_id: null, delay_days: 0, tone: "warm" },
    { flow_type: "follow_up", template_id: null, delay_days: 4, tone: "warm" },
  ]);

  const templateList = templates as unknown as TemplateLite[];

  const templatesForFlow = (flow: FlowType) =>
    templateList.filter((t) => !t.flow_type || t.flow_type === flow || flow === "intro");

  function updateStep(i: number, patch: Partial<Step>) {
    setSteps((prev) => prev.map((s, idx) => (idx === i ? { ...s, ...patch } : s)));
  }
  function addStep() {
    setSteps((prev) => [...prev, { flow_type: "negotiation", template_id: null, delay_days: 7, tone: "warm" }]);
  }
  function removeStep(i: number) {
    setSteps((prev) => prev.filter((_, idx) => idx !== i));
  }

  async function createSequence() {
    if (!name.trim() || steps.length === 0) {
      toast({ variant: "destructive", title: "Name and at least one step required" });
      return;
    }
    setBusy(true);
    try {
      const res = await fetch("/api/email-sequences", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name, description, steps }),
      });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error ?? "Failed to create");
      setSequences((prev) => [...prev, j.data]);
      setCreating(false);
      setName("");
      setDescription("");
      setSteps([
        { flow_type: "intro", template_id: null, delay_days: 0, tone: "warm" },
        { flow_type: "follow_up", template_id: null, delay_days: 4, tone: "warm" },
      ]);
      toast({ variant: "success", title: "Flow created" });
      router.refresh();
    } catch (e) {
      toast({ variant: "destructive", title: "Create failed", description: e instanceof Error ? e.message : "" });
    } finally {
      setBusy(false);
    }
  }

  async function deleteSequence(id: string) {
    setBusy(true);
    try {
      const res = await fetch(`/api/email-sequences/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error("Delete failed");
      setSequences((prev) => prev.filter((s) => s.id !== id));
      toast({ variant: "success", title: "Flow removed" });
    } catch (e) {
      toast({ variant: "destructive", title: "Delete failed", description: e instanceof Error ? e.message : "" });
    } finally {
      setBusy(false);
    }
  }

  async function runScheduler() {
    setBusy(true);
    try {
      const res = await fetch("/api/email-sequences/advance", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ run_due: true }),
      });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error ?? "Failed");
      toast({ variant: "success", title: `Processed ${j.processed} due step(s)` });
      router.refresh();
    } catch (e) {
      toast({ variant: "destructive", title: "Scheduler failed", description: e instanceof Error ? e.message : "" });
    } finally {
      setBusy(false);
    }
  }

  if (migrationPending) {
    return (
      <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 flex items-start gap-3">
        <AlertCircle className="h-5 w-5 text-amber-600 shrink-0 mt-0.5" />
        <div>
          <p className="text-sm font-medium text-amber-800">Database migration required</p>
          <p className="text-sm text-amber-700 mt-1">
            Run <code>0038_email_flows.sql</code> in the Supabase SQL Editor to enable email flows.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          {sequences.length} flow{sequences.length === 1 ? "" : "s"} · steps generate drafts + log to Pipedrive
        </p>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={runScheduler} disabled={busy} className="gap-1.5">
            {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Play className="h-3.5 w-3.5" />}
            Run due steps
          </Button>
          <Button size="sm" onClick={() => setCreating((v) => !v)} className="gap-1.5">
            <Plus className="h-3.5 w-3.5" /> New flow
          </Button>
        </div>
      </div>

      {creating && (
        <div className="rounded-xl border bg-card p-4 space-y-3">
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Flow name — e.g. Prospecção B2C Regional"
            className="w-full text-sm border rounded-md px-3 py-2 bg-background outline-none focus:ring-2 ring-primary/30"
          />
          <input
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Description (optional)"
            className="w-full text-sm border rounded-md px-3 py-2 bg-background outline-none focus:ring-2 ring-primary/30"
          />

          <div className="space-y-2">
            {steps.map((s, i) => (
              <div key={i} className="flex flex-wrap items-center gap-2 rounded-lg border p-2">
                <span className="text-xs font-semibold text-muted-foreground w-6">{i + 1}.</span>
                <select
                  value={s.flow_type}
                  onChange={(e) => updateStep(i, { flow_type: e.target.value as FlowType, template_id: null })}
                  className="text-xs border rounded-md px-2 py-1.5 bg-background"
                >
                  {FLOW_TYPES.map((f) => (
                    <option key={f} value={f}>
                      {FLOW_LABEL[f]}
                    </option>
                  ))}
                </select>
                <select
                  value={s.template_id ?? ""}
                  onChange={(e) => updateStep(i, { template_id: e.target.value || null })}
                  className="text-xs border rounded-md px-2 py-1.5 bg-background max-w-[200px]"
                >
                  <option value="">Auto (AI + default template)</option>
                  {templatesForFlow(s.flow_type).map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name}
                    </option>
                  ))}
                </select>
                <label className="text-xs flex items-center gap-1">
                  after
                  <input
                    type="number"
                    min={0}
                    value={s.delay_days}
                    onChange={(e) => updateStep(i, { delay_days: Number(e.target.value) })}
                    className="w-16 text-xs border rounded-md px-2 py-1.5 bg-background"
                  />
                  days
                </label>
                <select
                  value={s.tone ?? "warm"}
                  onChange={(e) => updateStep(i, { tone: e.target.value as Tone })}
                  className="text-xs border rounded-md px-2 py-1.5 bg-background"
                  title="Tone"
                >
                  {TONES.map((t) => (
                    <option key={t} value={t}>
                      {TONE_LABEL[t]}
                    </option>
                  ))}
                </select>
                <button
                  onClick={() => removeStep(i)}
                  className="ml-auto text-red-500 hover:text-red-700"
                  title="Remove step"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            ))}
            <Button variant="outline" size="sm" onClick={addStep} className="gap-1.5">
              <Plus className="h-3.5 w-3.5" /> Add step
            </Button>
          </div>

          <div className="flex gap-2 pt-1">
            <Button size="sm" onClick={createSequence} disabled={busy} className="gap-1.5">
              {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
              Save flow
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setCreating(false)}>
              Cancel
            </Button>
          </div>
        </div>
      )}

      <div className="space-y-3">
        {sequences.map((seq) => {
          const seqSteps = parseSteps(seq.steps);
          return (
            <div key={seq.id} className="rounded-xl border bg-card p-4">
              <div className="flex items-start justify-between gap-2">
                <div className="flex items-center gap-2">
                  <Workflow className="h-4 w-4 text-primary" />
                  <span className="font-medium text-sm">{seq.name}</span>
                  {seq.is_default && (
                    <Badge variant="outline" className="text-[9px]">
                      Default
                    </Badge>
                  )}
                </div>
                <button
                  onClick={() => deleteSequence(seq.id)}
                  disabled={busy}
                  className="text-red-500 hover:text-red-700"
                  title="Deactivate flow"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
              {seq.description && <p className="text-xs text-muted-foreground mt-1">{seq.description}</p>}
              <div className="flex flex-wrap items-center gap-1.5 mt-3">
                {seqSteps.map((s, i) => (
                  <React.Fragment key={i}>
                    <Badge variant="secondary" className="text-[10px]">
                      {FLOW_LABEL[s.flow_type]}
                      {s.delay_days > 0 ? ` · +${s.delay_days}d` : ""}
                      {s.tone && s.tone !== "warm" ? ` · ${TONE_LABEL[s.tone]}` : ""}
                    </Badge>
                    {i < seqSteps.length - 1 && <span className="text-muted-foreground">→</span>}
                  </React.Fragment>
                ))}
              </div>
            </div>
          );
        })}
        {sequences.length === 0 && !creating && (
          <p className="text-sm text-muted-foreground text-center py-8">
            No flows yet. Create one to chain introduction, follow-up and negotiation emails.
          </p>
        )}
      </div>
    </div>
  );
}
