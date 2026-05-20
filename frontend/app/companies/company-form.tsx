"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";

const INDUSTRIES = [
  "Bebidas / FMCG", "Bebidas Energéticas / Lifestyle", "Tecnologia", "Tecnologia / Educação",
  "Automóveis / Mobilidade", "Energia / Utilities", "Varejo / E-commerce", "Saúde / Bem-estar",
  "Cosméticos / Beleza", "Financeiro / Bancos", "Seguros", "Educação", "Construção / Imóveis",
  "Alimentação / Bebidas", "Moda / Vestuário", "Telecomunicações", "Turismo / Hospitalidade",
  "Agronegócio", "Logística / Transporte", "Outros",
];

const selectCls = "w-full rounded-md border bg-background px-3 py-2 text-sm outline-none focus:ring-1 focus:ring-ring";

export function CompanyForm() {
  const router = useRouter();
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    const fd = new FormData(e.currentTarget);

    const payload = {
      company_name: String(fd.get("company_name") ?? "").trim(),
      industry: String(fd.get("industry") ?? "").trim() || null,
      website: String(fd.get("website") ?? "").trim() || null,
      country: String(fd.get("country") ?? "BR") || "BR",
      notes: String(fd.get("notes") ?? "").trim() || null,
      segment: String(fd.get("segment") ?? "local"),
      company_size: String(fd.get("company_size") ?? "medium"),
      business_type: String(fd.get("business_type") ?? "B2C"),
      pipeline_stage: String(fd.get("pipeline_stage") ?? "prospect"),
      contact_name: String(fd.get("contact_name") ?? "").trim() || null,
      contact_email: String(fd.get("contact_email") ?? "").trim() || null,
      contact_phone: String(fd.get("contact_phone") ?? "").trim() || null,
    };

    try {
      const res = await fetch("/api/companies", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({})) as { error?: string };
        throw new Error(j?.error ?? `Request failed (${res.status})`);
      }
      const { data } = await res.json() as { data: { id: string } };
      router.push(`/companies/${data.id}`);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="space-y-5">
      {/* Basic info */}
      <div className="space-y-4">
        <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">Basic Information</h3>

        <div className="space-y-1.5">
          <Label htmlFor="company_name">Company Name *</Label>
          <Input id="company_name" name="company_name" required placeholder="e.g. Heineken Brasil" />
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label htmlFor="industry">Industry</Label>
            <select id="industry" name="industry" className={selectCls} defaultValue="">
              <option value="">Select industry…</option>
              {INDUSTRIES.map(i => <option key={i} value={i}>{i}</option>)}
            </select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="country">Country</Label>
            <Input id="country" name="country" defaultValue="BR" placeholder="BR" />
          </div>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="website">Website</Label>
          <Input id="website" name="website" type="url" placeholder="https://example.com" />
        </div>
      </div>

      {/* Business classification */}
      <div className="space-y-4">
        <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">Business Profile</h3>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div className="space-y-1.5">
            <Label htmlFor="business_type">Business Type</Label>
            <select id="business_type" name="business_type" className={selectCls} defaultValue="B2C">
              <option value="B2C">B2C</option>
              <option value="B2B">B2B</option>
              <option value="B2B2C">B2B2C</option>
            </select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="company_size">Company Size</Label>
            <select id="company_size" name="company_size" className={selectCls} defaultValue="medium">
              <option value="startup">Startup</option>
              <option value="small">Small</option>
              <option value="medium">Medium</option>
              <option value="large">Large</option>
              <option value="enterprise">Enterprise</option>
            </select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="segment">Geographic Reach</Label>
            <select id="segment" name="segment" className={selectCls} defaultValue="local">
              <option value="local">Local</option>
              <option value="state">State (Paraná)</option>
              <option value="national">National (Brazil)</option>
              <option value="global">Global</option>
            </select>
          </div>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="pipeline_stage">Pipeline Stage</Label>
          <select id="pipeline_stage" name="pipeline_stage" className={selectCls} defaultValue="prospect">
            <option value="prospect">Prospect</option>
            <option value="qualified">Qualified</option>
            <option value="contacted">Contacted</option>
            <option value="proposal_sent">Proposal Sent</option>
            <option value="negotiation">Negotiation</option>
            <option value="closed_won">Closed Won</option>
            <option value="closed_lost">Closed Lost</option>
          </select>
        </div>
      </div>

      {/* Contact */}
      <div className="space-y-4">
        <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">Contact Person</h3>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div className="space-y-1.5">
            <Label htmlFor="contact_name">Name</Label>
            <Input id="contact_name" name="contact_name" placeholder="João Silva" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="contact_email">Email</Label>
            <Input id="contact_email" name="contact_email" type="email" placeholder="joao@empresa.com" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="contact_phone">Phone / WhatsApp</Label>
            <Input id="contact_phone" name="contact_phone" placeholder="+55 41 99999-0000" />
          </div>
        </div>
      </div>

      {/* Notes */}
      <div className="space-y-1.5">
        <Label htmlFor="notes">Strategic Notes</Label>
        <Textarea id="notes" name="notes" rows={3} placeholder="Sponsorship history, key contacts, budget signals, past interactions…" />
      </div>

      {error && <div className="text-sm text-destructive bg-destructive/10 rounded px-3 py-2">{error}</div>}

      <Button type="submit" disabled={submitting} className="w-full" size="lg">
        {submitting ? "Saving…" : "Add Company"}
      </Button>
    </form>
  );
}
