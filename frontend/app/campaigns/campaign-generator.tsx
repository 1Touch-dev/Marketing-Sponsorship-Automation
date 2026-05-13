"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

interface Company {
  id: string;
  company_name: string;
}

export function CampaignGenerator({
  companies,
  preselectedCompanyId,
}: {
  companies: Company[];
  preselectedCompanyId?: string;
}) {
  const router = useRouter();
  const [companyId, setCompanyId] = useState(preselectedCompanyId || companies[0]?.id || "");
  const [objective, setObjective] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!companyId) {
      setError("Pick a company first.");
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch("/api/campaigns/generate", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ company_id: companyId, objective: objective || undefined }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j?.error ?? `Request failed (${res.status})`);
      }
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Generation failed");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="space-y-3">
      <div className="space-y-1.5">
        <Label htmlFor="company">Company *</Label>
        <select
          id="company"
          name="company"
          value={companyId}
          onChange={(e) => setCompanyId(e.target.value)}
          className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
          required
        >
          {companies.length === 0 ? (
            <option value="">No companies — add one first</option>
          ) : (
            companies.map((c) => (
              <option key={c.id} value={c.id}>
                {c.company_name}
              </option>
            ))
          )}
        </select>
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="objective">Objective / context</Label>
        <Textarea
          id="objective"
          rows={3}
          placeholder="e.g. Drive brand awareness during Q3 with sports activation."
          value={objective}
          onChange={(e) => setObjective(e.target.value)}
        />
      </div>
      {error ? <div className="text-sm text-destructive">{error}</div> : null}
      <Button type="submit" disabled={submitting || !companyId} className="w-full">
        {submitting ? "Generating ideas…" : "Generate ideas"}
      </Button>
      <p className="text-xs text-muted-foreground">Uses AWS Bedrock — Claude Sonnet.</p>
    </form>
  );
}
