"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Save, X, Tag, Plus } from "lucide-react";

const SEGMENTS = ["local", "state", "national", "international"];
const SIZES = ["small", "medium", "large"];
const BUSINESS_TYPES = ["B2C", "B2B", "Both"];
const PIPELINE_STAGES = ["prospect", "qualified", "contacted", "proposal_sent", "negotiation", "closed_won", "closed_lost"];

export function CompanyEditForm({ company }: { company: Record<string, unknown> }) {
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const [tags, setTags] = useState<string[]>((company.tags as string[]) || []);
  const [tagInput, setTagInput] = useState("");

  function addTag() {
    const t = tagInput.trim();
    if (t && !tags.includes(t)) {
      setTags([...tags, t]);
    }
    setTagInput("");
  }

  function removeTag(tag: string) {
    setTags(tags.filter((t) => t !== tag));
  }

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    setSuccess(false);

    const fd = new FormData(e.currentTarget);
    const payload: Record<string, unknown> = {
      company_name: String(fd.get("company_name") ?? "").trim(),
      industry: String(fd.get("industry") ?? "").trim() || null,
      website: String(fd.get("website") ?? "").trim() || null,
      country: String(fd.get("country") ?? "BR").trim() || "BR",
      notes: String(fd.get("notes") ?? "").trim() || null,
      status: String(fd.get("status") ?? "prospect"),
      segment: String(fd.get("segment") ?? "local"),
      company_size: String(fd.get("company_size") ?? "medium"),
      business_type: String(fd.get("business_type") ?? "B2C"),
      pipeline_stage: String(fd.get("pipeline_stage") ?? "prospect"),
      contact_name: String(fd.get("contact_name") ?? "").trim() || null,
      contact_email: String(fd.get("contact_email") ?? "").trim() || null,
      contact_phone: String(fd.get("contact_phone") ?? "").trim() || null,
      sponsorship_history: String(fd.get("sponsorship_history") ?? "").trim() || null,
      tags,
    };

    try {
      const res = await fetch(`/api/companies/${company.id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j?.error ?? `Save failed (${res.status})`);
      }
      setSuccess(true);
      router.refresh();
      setTimeout(() => setSuccess(false), 3000);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setSaving(false);
    }
  }

  const selectCls = "w-full h-9 rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring";

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="space-y-1.5">
          <Label htmlFor="company_name">Company Name *</Label>
          <Input id="company_name" name="company_name" defaultValue={company.company_name as string} required />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="industry">Industry</Label>
          <Input id="industry" name="industry" defaultValue={(company.industry as string) || ""} placeholder="Technology" />
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="space-y-1.5">
          <Label htmlFor="website">Website</Label>
          <Input id="website" name="website" defaultValue={(company.website as string) || ""} placeholder="https://example.com" />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="country">Country</Label>
          <Input id="country" name="country" defaultValue={(company.country as string) || "BR"} />
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="space-y-1.5">
          <Label htmlFor="segment">Segment</Label>
          <select id="segment" name="segment" defaultValue={(company.segment as string) || "local"} className={selectCls}>
            {SEGMENTS.map((s) => <option key={s} value={s} className="capitalize">{s.charAt(0).toUpperCase() + s.slice(1)}</option>)}
          </select>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="company_size">Size</Label>
          <select id="company_size" name="company_size" defaultValue={(company.company_size as string) || "medium"} className={selectCls}>
            {SIZES.map((s) => <option key={s} value={s} className="capitalize">{s.charAt(0).toUpperCase() + s.slice(1)}</option>)}
          </select>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="business_type">Business Type</Label>
          <select id="business_type" name="business_type" defaultValue={(company.business_type as string) || "B2C"} className={selectCls}>
            {BUSINESS_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
          </select>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="space-y-1.5">
          <Label htmlFor="status">Status</Label>
          <select id="status" name="status" defaultValue={(company.status as string) || "prospect"} className={selectCls}>
            {["competitor", "prospect", "active", "paused", "closed"].map((s) => <option key={s} value={s} className="capitalize">{s.charAt(0).toUpperCase() + s.slice(1)}</option>)}
          </select>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="pipeline_stage">Pipeline Stage</Label>
          <select id="pipeline_stage" name="pipeline_stage" defaultValue={(company.pipeline_stage as string) || "prospect"} className={selectCls}>
            {PIPELINE_STAGES.map((s) => <option key={s} value={s}>{s.replace("_", " ").replace(/\b\w/g, (c) => c.toUpperCase())}</option>)}
          </select>
        </div>
      </div>

      {/* Tags */}
      <div className="space-y-1.5">
        <Label>Tags</Label>
        <div className="flex gap-2">
          <Input
            value={tagInput}
            onChange={(e) => setTagInput(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addTag(); } }}
            placeholder="Add tag and press Enter"
            className="flex-1"
          />
          <Button type="button" variant="outline" size="sm" onClick={addTag}>
            <Plus className="h-4 w-4" />
          </Button>
        </div>
        {tags.length > 0 && (
          <div className="flex flex-wrap gap-1.5 mt-2">
            {tags.map((tag) => (
              <Badge key={tag} variant="secondary" className="text-xs gap-1">
                <Tag className="h-3 w-3" />
                {tag}
                <button type="button" onClick={() => removeTag(tag)} className="hover:text-destructive ml-0.5">
                  <X className="h-3 w-3" />
                </button>
              </Badge>
            ))}
          </div>
        )}
      </div>

      {/* Contact info */}
      <div className="space-y-2 pt-2 border-t">
        <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Contact Person</p>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div className="space-y-1.5">
            <Label htmlFor="contact_name">Name</Label>
            <Input id="contact_name" name="contact_name" defaultValue={(company.contact_name as string) || ""} placeholder="João Silva" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="contact_email">Email</Label>
            <Input id="contact_email" name="contact_email" type="email" defaultValue={(company.contact_email as string) || ""} placeholder="joao@empresa.com" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="contact_phone">Phone</Label>
            <Input id="contact_phone" name="contact_phone" defaultValue={(company.contact_phone as string) || ""} placeholder="+55 41 99999-9999" />
          </div>
        </div>
      </div>

      {/* Notes + history */}
      <div className="space-y-3">
        <div className="space-y-1.5">
          <Label htmlFor="notes">Notes</Label>
          <Textarea id="notes" name="notes" rows={3} defaultValue={(company.notes as string) || ""} placeholder="Strategic context, contacts, objectives..." />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="sponsorship_history">Sponsorship History</Label>
          <Textarea id="sponsorship_history" name="sponsorship_history" rows={2} defaultValue={(company.sponsorship_history as string) || ""} placeholder="Past sponsorships, partnerships, marketing history..." />
        </div>
      </div>

      {error && <div className="text-sm text-destructive bg-destructive/10 rounded-md p-2">{error}</div>}
      {success && <div className="text-sm text-green-700 bg-green-50 rounded-md p-2">✓ Company saved successfully</div>}

      <Button type="submit" disabled={saving} className="w-full sm:w-auto">
        <Save className="h-4 w-4 mr-2" />
        {saving ? "Saving…" : "Save Changes"}
      </Button>
    </form>
  );
}
