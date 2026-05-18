"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Plus } from "lucide-react";

const STAGES = ["prospect", "qualified", "contacted", "proposal_sent", "negotiation", "closed_won", "closed_lost"];

export function PipelineLeadForm({ companies }: { companies: Record<string, unknown>[] }) {
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
      title: String(fd.get("title") ?? "").trim(),
      company_id: String(fd.get("company_id") ?? "") || null,
      stage: String(fd.get("stage") ?? "prospect"),
      owner: String(fd.get("owner") ?? "").trim() || null,
      value: fd.get("value") ? Number(fd.get("value")) : null,
      probability: fd.get("probability") ? Number(fd.get("probability")) : 0,
      source: String(fd.get("source") ?? "outbound"),
      expected_close: String(fd.get("expected_close") ?? "") || null,
      next_followup: String(fd.get("next_followup") ?? "") || null,
      notes: String(fd.get("notes") ?? "").trim() || null,
    };
    try {
      const res = await fetch("/api/pipeline", {
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
          <Label htmlFor="title">Deal Title *</Label>
          <Input id="title" name="title" required placeholder="e.g. Positivo — Jersey Principal Sponsor" />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="company_id">Company</Label>
          <select id="company_id" name="company_id" className={selectCls}>
            <option value="">Select company...</option>
            {companies.map((c) => <option key={c.id as string} value={c.id as string}>{c.company_name as string}</option>)}
          </select>
        </div>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="space-y-1.5">
          <Label htmlFor="stage">Stage</Label>
          <select id="stage" name="stage" className={selectCls}>
            {STAGES.map((s) => <option key={s} value={s}>{s.replace("_", " ").replace(/\b\w/g, (l) => l.toUpperCase())}</option>)}
          </select>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="source">Source</Label>
          <select id="source" name="source" className={selectCls}>
            {["outbound", "inbound", "referral", "event"].map((s) => <option key={s} value={s} className="capitalize">{s.charAt(0).toUpperCase() + s.slice(1)}</option>)}
          </select>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="value">Deal Value (BRL)</Label>
          <Input id="value" name="value" type="number" placeholder="120000" />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="probability">Probability (%)</Label>
          <Input id="probability" name="probability" type="number" min="0" max="100" placeholder="30" />
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="space-y-1.5">
          <Label htmlFor="owner">Owner</Label>
          <Input id="owner" name="owner" placeholder="Team member name" />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="expected_close">Expected Close</Label>
          <Input id="expected_close" name="expected_close" type="date" />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="next_followup">Next Follow-up</Label>
          <Input id="next_followup" name="next_followup" type="date" />
        </div>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="notes">Notes</Label>
        <Textarea id="notes" name="notes" rows={2} placeholder="Deal context, decision makers, blockers..." />
      </div>

      {error && <div className="text-sm text-destructive bg-destructive/10 rounded-md p-2">{error}</div>}
      {success && <div className="text-sm text-green-700 bg-green-50 rounded-md p-2">✓ Lead added to pipeline</div>}

      <Button type="submit" disabled={saving}>
        <Plus className="h-4 w-4 mr-1" />
        {saving ? "Saving…" : "Add to Pipeline"}
      </Button>
    </form>
  );
}
