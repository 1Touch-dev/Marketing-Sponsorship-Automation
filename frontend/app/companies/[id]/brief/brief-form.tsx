"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export function BriefForm({ companyId }: { companyId: string }) {
  const router = useRouter();
  const [full, setFull] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const g = (k: string) => String(fd.get(k) ?? "").trim();
    const body: Record<string, unknown> = {
      level: full ? "full" : "quick",
      objective: g("objective"),
      period_start: g("period_start"),
      period_end: g("period_end"),
      contact_name: g("contact_name"),
      contact_email: g("contact_email") || null,
      next_action: g("next_action"),
      next_action_due: g("next_action_due") || null,
    };
    if (full) {
      body.why_sponsor = g("why_sponsor");
      body.why_package = g("why_package");
      body.evidence = g("evidence_claim")
        ? [{ claim: g("evidence_claim"), source_name: g("evidence_source") || undefined, source_url: g("evidence_url") || undefined, confidence: g("evidence_confidence") || undefined }]
        : [];
      body.unverified = g("unverified").split("\n").map((s) => s.trim()).filter(Boolean);
    }
    setBusy(true);
    setError(null);
    const res = await fetch(`/api/companies/${companyId}/briefs`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
    setBusy(false);
    if (res.ok) {
      router.refresh();
      return;
    }
    const j = (await res.json().catch(() => ({}))) as { error?: string };
    setError(j.error ?? `Could not save (${res.status})`);
  }

  const label = "text-xs space-y-1 block";
  return (
    <form onSubmit={submit} className="rounded-lg border bg-card p-4 space-y-3" data-testid="brief-form">
      <p className="text-sm font-semibold">Write a brief</p>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <label className={`${label} sm:col-span-2`}>What does the buyer want?
          <Input name="objective" required />
        </label>
        <label className={label}>Period starts<Input name="period_start" type="date" required /></label>
        <label className={label}>Period ends<Input name="period_end" type="date" required /></label>
        <label className={label}>Point of contact<Input name="contact_name" required /></label>
        <label className={label}>Contact email (optional)<Input name="contact_email" type="email" /></label>
        <label className={label}>Next action<Input name="next_action" required /></label>
        <label className={label}>Next action due (optional)<Input name="next_action_due" type="date" /></label>
      </div>
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" checked={full} onChange={(e) => setFull(e.target.checked)} data-testid="full-toggle" />
        Add research (why this sponsor, why this package, cited evidence)
      </label>
      {full && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 border-t pt-3">
          <label className={label}>Why this sponsor<Input name="why_sponsor" /></label>
          <label className={label}>Why this package<Input name="why_package" /></label>
          <label className={`${label} sm:col-span-2`}>Evidence (a claim and where it comes from)<Input name="evidence_claim" /></label>
          <label className={label}>Source name<Input name="evidence_source" /></label>
          <label className={label}>Source link<Input name="evidence_url" /></label>
          <label className={label}>Confidence
            <select name="evidence_confidence" className="w-full h-9 rounded-md border border-input bg-background px-3 text-sm">
              <option value="">unstated</option><option value="high">high</option><option value="medium">medium</option><option value="low">low</option>
            </select>
          </label>
          <label className={`${label} sm:col-span-2`}>Still unverified (one per line)
            <textarea name="unverified" rows={3} className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm" />
          </label>
        </div>
      )}
      <Button type="submit" size="sm" disabled={busy}>Save brief</Button>
      {error && <p className="text-xs text-red-600" data-testid="brief-error">{error}</p>}
    </form>
  );
}
