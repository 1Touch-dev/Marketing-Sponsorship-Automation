"use client";

import { useCallback, useEffect, useState, type ReactNode } from "react";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { validateBrief } from "@/lib/briefs/model";
import { cn, formatDateOnly } from "@/lib/utils";

export type GenerateAttempt =
  | { ok: true }
  | { ok: false; error: string; code?: string };

type GatePayload = {
  ok: boolean;
  enforced?: boolean;
  level?: "quick" | "full" | null;
  missing?: string[];
  message?: string | null;
};

type BriefsResponse = {
  gate?: GatePayload;
  briefs?: Array<{ id: string; level: string; created_at: string }>;
  error?: string;
};

function BriefFields({
  stacked,
  busy,
  objective,
  setObjective,
  periodStart,
  setPeriodStart,
  periodEnd,
  setPeriodEnd,
  pointOfContact,
  setPointOfContact,
  pointOfContactEmail,
  setPointOfContactEmail,
  nextAction,
  setNextAction,
  nextActionDue,
  setNextActionDue,
}: {
  stacked: boolean;
  busy: boolean;
  objective: string;
  setObjective: (v: string) => void;
  periodStart: string;
  setPeriodStart: (v: string) => void;
  periodEnd: string;
  setPeriodEnd: (v: string) => void;
  pointOfContact: string;
  setPointOfContact: (v: string) => void;
  pointOfContactEmail: string;
  setPointOfContactEmail: (v: string) => void;
  nextAction: string;
  setNextAction: (v: string) => void;
  nextActionDue: string;
  setNextActionDue: (v: string) => void;
}) {
  const labelClass = "text-xs space-y-1 block";
  return (
    <div className={cn("grid gap-3", stacked ? "grid-cols-1" : "grid-cols-1 sm:grid-cols-2")}>
      <label className={cn(labelClass, stacked ? "" : "sm:col-span-2")}>
        What does the buyer want?
        <Input
          name="objective"
          value={objective}
          onChange={(e) => setObjective(e.target.value)}
          required
          disabled={busy}
          data-testid="quick-brief-objective"
        />
      </label>
      <label className={labelClass}>
        Period starts
        <Input
          name="period_start"
          type="date"
          value={periodStart}
          onChange={(e) => setPeriodStart(e.target.value)}
          required
          disabled={busy}
        />
      </label>
      <label className={labelClass}>
        Period ends
        <Input
          name="period_end"
          type="date"
          value={periodEnd}
          onChange={(e) => setPeriodEnd(e.target.value)}
          required
          disabled={busy}
        />
      </label>
      <label className={labelClass}>
        Point of contact
        <Input
          name="contact_name"
          value={pointOfContact}
          onChange={(e) => setPointOfContact(e.target.value)}
          required
          disabled={busy}
        />
      </label>
      <label className={labelClass}>
        Contact email (optional)
        <Input
          name="contact_email"
          type="email"
          value={pointOfContactEmail}
          onChange={(e) => setPointOfContactEmail(e.target.value)}
          disabled={busy}
        />
      </label>
      <label className={labelClass}>
        Next action
        <Input
          name="next_action"
          value={nextAction}
          onChange={(e) => setNextAction(e.target.value)}
          required
          disabled={busy}
        />
      </label>
      <label className={labelClass}>
        Next action due (optional)
        <Input
          name="next_action_due"
          type="date"
          value={nextActionDue}
          onChange={(e) => setNextActionDue(e.target.value)}
          disabled={busy}
        />
      </label>
    </div>
  );
}

export function QuickBriefPanel({
  companyId,
  contactName,
  contactEmail,
  generateLabel = "Generate Proposal",
  saveAndGenerateLabel = "Save and generate",
  generateIcon,
  primaryClassName,
  leftAction,
  layout = "wide",
  onGenerate,
}: {
  companyId: string;
  contactName?: string | null;
  contactEmail?: string | null;
  generateLabel?: string;
  saveAndGenerateLabel?: string;
  generateIcon?: ReactNode;
  primaryClassName?: string;
  leftAction?: ReactNode;
  /** wide: wizard two-column. stack: one field per row for the campaign rail. */
  layout?: "wide" | "stack";
  onGenerate: () => Promise<GenerateAttempt>;
}) {
  const [gateLoading, setGateLoading] = useState(true);
  const [gateOk, setGateOk] = useState(false);
  const [gateLevel, setGateLevel] = useState<string | null>(null);
  const [briefDate, setBriefDate] = useState<string | null>(null);
  const [forceForm, setForceForm] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [generating, setGenerating] = useState(false);

  const [objective, setObjective] = useState("");
  const [periodStart, setPeriodStart] = useState("");
  const [periodEnd, setPeriodEnd] = useState("");
  const [pointOfContact, setPointOfContact] = useState(contactName ?? "");
  const [pointOfContactEmail, setPointOfContactEmail] = useState(contactEmail ?? "");
  const [nextAction, setNextAction] = useState("");
  const [nextActionDue, setNextActionDue] = useState("");

  const loadGate = useCallback(async (id: string) => {
    setGateLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/companies/${id}/briefs`);
      const j = (await res.json().catch(() => ({}))) as BriefsResponse;
      if (!res.ok) {
        setGateOk(false);
        setForceForm(false);
        setError(j.error ?? `Could not check the buyer brief (${res.status})`);
        return;
      }
      const latest = j.briefs?.[0] ?? null;
      const ok = j.gate?.ok === true || j.gate?.enforced === false;
      setGateOk(ok);
      setForceForm(!ok);
      setGateLevel(j.gate?.level ?? latest?.level ?? null);
      setBriefDate(latest?.created_at ?? null);
    } catch (err) {
      setGateOk(false);
      setForceForm(false);
      setError(err instanceof Error ? err.message : "Could not check the buyer brief");
    } finally {
      setGateLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!companyId) return;
    setObjective("");
    setPeriodStart("");
    setPeriodEnd("");
    setPointOfContact(contactName ?? "");
    setPointOfContactEmail(contactEmail ?? "");
    setNextAction("");
    setNextActionDue("");
    setForceForm(false);
    setGateOk(false);
    void loadGate(companyId);
  }, [companyId, contactName, contactEmail, loadGate]);

  const showForm = !gateLoading && (forceForm || !gateOk);
  const busy = gateLoading || saving || generating;
  const stacked = layout === "stack";

  async function runGenerate(): Promise<boolean> {
    setGenerating(true);
    try {
      const result = await onGenerate();
      if (result.ok) return true;
      setError(result.error);
      if (result.code === "discovery_brief_required") {
        setGateOk(false);
        setForceForm(true);
      }
      return false;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Generation failed");
      return false;
    } finally {
      setGenerating(false);
    }
  }

  async function saveThenGenerate() {
    const body = {
      level: "quick" as const,
      objective,
      period_start: periodStart,
      period_end: periodEnd,
      contact_name: pointOfContact,
      contact_email: pointOfContactEmail.trim() === "" ? null : pointOfContactEmail,
      next_action: nextAction,
      next_action_due: nextActionDue.trim() === "" ? null : nextActionDue,
    };
    const bad = validateBrief(body);
    if (bad) {
      setError(bad);
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`/api/companies/${companyId}/briefs`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "idempotency-key": crypto.randomUUID(),
        },
        body: JSON.stringify(body),
      });
      const j = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        setError(j.error ?? `Could not save the brief (${res.status})`);
        return;
      }
      setGateOk(true);
      setForceForm(false);
      setGateLevel("quick");
      setBriefDate(new Date().toISOString());
      setGenerating(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save the brief");
      return;
    } finally {
      setSaving(false);
    }
    await runGenerate();
  }

  async function onPrimary() {
    if (showForm) {
      await saveThenGenerate();
      return;
    }
    setError(null);
    await runGenerate();
  }

  if (!companyId) {
    return (
      <div className="space-y-3" data-testid="quick-brief-panel">
        <p className="text-sm text-red-600">A company is needed before a proposal can be generated.</p>
        {leftAction ? <div className="flex pt-2">{leftAction}</div> : null}
      </div>
    );
  }

  const primaryLabel = generating
    ? "Generating…"
    : saving
      ? "Saving…"
      : gateLoading
        ? "Checking brief…"
        : showForm
          ? saveAndGenerateLabel
          : generateLabel;

  return (
    <div className="space-y-3" data-testid="quick-brief-panel">
      {gateLoading && (
        <p className="text-xs text-muted-foreground">Checking whether a buyer brief is on file…</p>
      )}
      {!gateLoading && !showForm && (
        <p className="text-xs text-muted-foreground" data-testid="quick-brief-skip">
          Using {gateLevel ?? "buyer"} brief{briefDate ? ` from ${formatDateOnly(briefDate)}` : ""}.
        </p>
      )}
      {showForm && (
        <div className={cn("space-y-3", stacked ? "" : "rounded-lg border bg-card p-4")}>
          <p className="text-sm font-medium">A buyer brief is needed before this proposal can be generated.</p>
          {!stacked && (
            <p className="text-xs text-muted-foreground">
              The four discovery fields, written by you. Contact is filled from the company when we have it; objective is not invented.
            </p>
          )}
          <BriefFields
            stacked={stacked}
            busy={busy}
            objective={objective}
            setObjective={setObjective}
            periodStart={periodStart}
            setPeriodStart={setPeriodStart}
            periodEnd={periodEnd}
            setPeriodEnd={setPeriodEnd}
            pointOfContact={pointOfContact}
            setPointOfContact={setPointOfContact}
            pointOfContactEmail={pointOfContactEmail}
            setPointOfContactEmail={setPointOfContactEmail}
            nextAction={nextAction}
            setNextAction={setNextAction}
            nextActionDue={nextActionDue}
            setNextActionDue={setNextActionDue}
          />
        </div>
      )}
      {error && (
        <p className="text-sm text-red-600" data-testid="quick-brief-error">
          {error}
        </p>
      )}
      <div className={cn("flex pt-2", leftAction ? "justify-between" : "")}>
        {leftAction}
        <Button
          type="button"
          onClick={() => void onPrimary()}
          disabled={busy || !companyId}
          className={cn(leftAction ? "gap-2" : "w-full gap-2", primaryClassName)}
          data-testid="quick-brief-generate"
        >
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : generateIcon}
          {primaryLabel}
        </Button>
      </div>
    </div>
  );
}
