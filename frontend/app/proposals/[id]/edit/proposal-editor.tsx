"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import type { ProposalContent } from "@/types/database";

export function ProposalEditor({
  id,
  initialTitle,
  initialContent,
}: {
  id: string;
  initialTitle: string;
  initialContent: ProposalContent;
}) {
  const router = useRouter();
  const [title, setTitle] = useState(initialTitle);
  const [content, setContent] = useState<ProposalContent>({
    executive_summary: initialContent?.executive_summary ?? "",
    campaign_rationale: initialContent?.campaign_rationale ?? "",
    sponsorship_value: initialContent?.sponsorship_value ?? "",
    activation_plan: initialContent?.activation_plan ?? "",
    deliverables: initialContent?.deliverables ?? [],
    investment_note: initialContent?.investment_note ?? "",
    cta: initialContent?.cta ?? "",
  });
  const [reason, setReason] = useState("");
  const [deliverablesText, setDeliverablesText] = useState((initialContent?.deliverables ?? []).join("\n"));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function field(name: keyof ProposalContent, label: string, rows = 3) {
    return (
      <div className="space-y-1.5">
        <Label htmlFor={name as string}>{label}</Label>
        <Textarea
          id={name as string}
          rows={rows}
          value={(content[name] as string) ?? ""}
          onChange={(e) => setContent({ ...content, [name]: e.target.value })}
        />
      </div>
    );
  }

  async function onSave(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const deliverables = deliverablesText
        .split("\n")
        .map((s) => s.trim())
        .filter(Boolean);
      const payload = {
        title,
        content: { ...content, deliverables },
        edit_reason: reason || undefined,
      };
      const res = await fetch(`/api/proposals/${id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
      });
      const j = await res.json();
      if (!res.ok) throw new Error(j?.error ?? `Failed (${res.status})`);
      router.push(`/proposals/${id}`);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Save failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={onSave} className="space-y-4">
      <div className="space-y-1.5">
        <Label htmlFor="title">Title</Label>
        <Input id="title" value={title} onChange={(e) => setTitle(e.target.value)} required />
      </div>
      {field("executive_summary", "Executive summary", 4)}
      {field("campaign_rationale", "Campaign rationale", 4)}
      {field("sponsorship_value", "Sponsorship value", 4)}
      {field("activation_plan", "Activation plan", 4)}
      <div className="space-y-1.5">
        <Label htmlFor="deliverables">Deliverables (one per line)</Label>
        <Textarea
          id="deliverables"
          rows={4}
          value={deliverablesText}
          onChange={(e) => setDeliverablesText(e.target.value)}
        />
      </div>
      {field("investment_note", "Investment", 3)}
      {field("cta", "Call to action", 2)}
      <div className="space-y-1.5">
        <Label htmlFor="reason">Reason for edit</Label>
        <Input id="reason" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. tightened summary" />
      </div>
      {error ? <div className="text-sm text-destructive">{error}</div> : null}
      <div className="flex gap-2">
        <Button type="submit" disabled={busy}>{busy ? "Saving…" : "Save new version"}</Button>
        <Button type="button" variant="outline" onClick={() => router.back()}>Cancel</Button>
      </div>
    </form>
  );
}
