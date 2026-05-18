"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Plus } from "lucide-react";

const PROJECT_TYPES = ["esporte", "educacao", "cultura", "saude", "meio_ambiente", "comunidade"];
const LEI_TYPES = ["Lei de Incentivo ao Esporte", "Lei Rouanet", "Lei Municipal de Curitiba", "Sem Lei"];

export function SocialProjectForm() {
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
      name: String(fd.get("name") ?? "").trim(),
      description: String(fd.get("description") ?? "").trim() || null,
      project_type: String(fd.get("project_type") ?? "esporte"),
      lei_type: String(fd.get("lei_type") ?? "").trim() || null,
      budget_total: fd.get("budget_total") ? Number(fd.get("budget_total")) : null,
      location: String(fd.get("location") ?? "Curitiba, PR").trim() || "Curitiba, PR",
      beneficiaries: String(fd.get("beneficiaries") ?? "").trim() || null,
      social_impact: String(fd.get("social_impact") ?? "").trim() || null,
      tax_benefit: String(fd.get("tax_benefit") ?? "").trim() || null,
      deadline_apply: String(fd.get("deadline_apply") ?? "") || null,
    };
    try {
      const res = await fetch("/api/social-projects", {
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
          <Label htmlFor="name">Project Name *</Label>
          <Input id="name" name="name" required placeholder="e.g. Coxa Academy Digital" />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="project_type">Project Type *</Label>
          <select id="project_type" name="project_type" className={selectCls} required>
            {PROJECT_TYPES.map((t) => <option key={t} value={t}>{t.replace("_", " ").replace(/\b\w/g, (l) => l.toUpperCase())}</option>)}
          </select>
        </div>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="description">Description</Label>
        <Textarea id="description" name="description" rows={2} placeholder="What the project does, who it helps..." />
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="space-y-1.5">
          <Label htmlFor="lei_type">Lei de Incentivo Type</Label>
          <select id="lei_type" name="lei_type" className={selectCls}>
            <option value="">None</option>
            {LEI_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
          </select>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="budget_total">Budget (BRL)</Label>
          <Input id="budget_total" name="budget_total" type="number" placeholder="150000" />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="deadline_apply">Application Deadline</Label>
          <Input id="deadline_apply" name="deadline_apply" type="date" />
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="space-y-1.5">
          <Label htmlFor="location">Location</Label>
          <Input id="location" name="location" defaultValue="Curitiba, PR" />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="beneficiaries">Beneficiaries</Label>
          <Input id="beneficiaries" name="beneficiaries" placeholder="e.g. 200 jovens atletas" />
        </div>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="social_impact">Social Impact</Label>
        <Textarea id="social_impact" name="social_impact" rows={2} placeholder="Measurable social outcomes..." />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="tax_benefit">Tax Benefit for Donors</Label>
        <Input id="tax_benefit" name="tax_benefit" placeholder="e.g. Dedução de até 1% do IR (pessoa jurídica)" />
      </div>

      {error && <div className="text-sm text-destructive bg-destructive/10 rounded-md p-2">{error}</div>}
      {success && <div className="text-sm text-green-700 bg-green-50 rounded-md p-2">✓ Social project added successfully</div>}

      <Button type="submit" disabled={saving}>
        <Plus className="h-4 w-4 mr-1" />
        {saving ? "Saving…" : "Add Project"}
      </Button>
    </form>
  );
}
