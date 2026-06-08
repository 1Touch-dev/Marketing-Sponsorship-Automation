"use client";

import { useState, useRef } from "react";
import { useRouter } from "next/navigation";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/components/ui/toaster";
import { Mail, Plus, Pencil, Trash2, Star, X, Eye, Copy, Variable, Upload, FileText, CheckCircle2, AlertCircle, Loader2 } from "lucide-react";

const SUPPORTED_VARIABLES = [
  "{{company_name}}", "{{contact_name}}", "{{contact_title}}",
  "{{proposal_link}}", "{{proposal_summary}}", "{{sender_name}}", "{{sender_title}}",
];

type Template = Record<string, unknown>;

function TemplateForm({
  initialData,
  onSaved,
  onCancel,
}: {
  initialData?: Template;
  onSaved: (t: Template) => void;
  onCancel: () => void;
}) {
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [preview, setPreview] = useState(false);
  const [bodyHtml, setBodyHtml] = useState(String(initialData?.body_html ?? ""));
  const isEdit = !!initialData?.id;

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    const fd = new FormData(e.currentTarget);

    // Extract variables from HTML
    const html = bodyHtml;
    const varMatches = [...html.matchAll(/\{\{(\w+)\}\}/g)].map(m => m[0]);
    const subjectMatches = [...String(fd.get("subject") ?? "").matchAll(/\{\{(\w+)\}\}/g)].map(m => m[0]);
    const variables = [...new Set([...varMatches, ...subjectMatches])];

    const payload = {
      name: String(fd.get("name") ?? "").trim(),
      description: String(fd.get("description") ?? "").trim() || null,
      subject: String(fd.get("subject") ?? "").trim(),
      body_html: html,
      body_text: String(fd.get("body_text") ?? "").trim() || null,
      variables,
      is_default: fd.get("is_default") === "on",
    };

    try {
      const url = isEdit ? `/api/email-templates/${String(initialData!.id)}` : "/api/email-templates";
      const method = isEdit ? "PATCH" : "POST";
      const res = await fetch(url, {
        method,
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j?.error ?? `Save failed (${res.status})`);
      }
      const { data } = await res.json();
      onSaved(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4 p-4 border rounded-xl bg-slate-50">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-slate-700">{isEdit ? "Edit Template" : "New Email Template"}</h3>
        <button type="button" onClick={onCancel} className="text-slate-400 hover:text-slate-600">
          <X className="h-4 w-4" />
        </button>
      </div>

      {/* Variable reference */}
      <div className="rounded-lg bg-blue-50 border border-blue-100 p-3">
        <p className="text-xs font-semibold text-blue-700 mb-2 flex items-center gap-1.5">
          <Variable className="h-3.5 w-3.5" /> Supported Variables (click to copy)
        </p>
        <div className="flex flex-wrap gap-1.5">
          {SUPPORTED_VARIABLES.map(v => (
            <button
              key={v}
              type="button"
              onClick={() => navigator.clipboard.writeText(v)}
              className="text-xs bg-white border border-blue-200 text-blue-600 px-2 py-0.5 rounded font-mono hover:bg-blue-600 hover:text-white transition-colors"
            >
              {v}
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label htmlFor="name" className="text-xs">Template Name *</Label>
          <Input id="name" name="name" required defaultValue={initialData?.name as string} placeholder="Outreach Padrão" />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="description" className="text-xs">Description</Label>
          <Input id="description" name="description" defaultValue={initialData?.description as string} placeholder="When to use this template..." />
        </div>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="subject" className="text-xs">Subject Line *</Label>
        <Input id="subject" name="subject" required defaultValue={initialData?.subject as string}
          placeholder="Proposta de Patrocínio — Coritiba FC × {{company_name}}" />
      </div>

      <div className="space-y-1.5">
        <div className="flex items-center justify-between">
          <Label htmlFor="body_html" className="text-xs">Body HTML *</Label>
          <button type="button" onClick={() => setPreview(!preview)}
            className="text-xs text-primary hover:underline flex items-center gap-1">
            <Eye className="h-3 w-3" /> {preview ? "Edit" : "Preview"}
          </button>
        </div>
        {preview ? (
          <div className="rounded-lg border bg-white p-4 min-h-32 text-sm" dangerouslySetInnerHTML={{ __html: bodyHtml }} />
        ) : (
          <Textarea
            id="body_html"
            name="body_html"
            required
            rows={8}
            value={bodyHtml}
            onChange={e => setBodyHtml(e.target.value)}
            placeholder="<p>Prezado(a) {{contact_name}},</p>..."
            className="font-mono text-xs"
          />
        )}
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="body_text" className="text-xs">Plain Text Version (optional)</Label>
        <Textarea id="body_text" name="body_text" rows={3} defaultValue={initialData?.body_text as string}
          placeholder="Plain text fallback for email clients that don't support HTML..."
          className="font-mono text-xs" />
      </div>

      <label className="flex items-center gap-2 text-sm cursor-pointer">
        <input type="checkbox" name="is_default" defaultChecked={initialData?.is_default as boolean} className="rounded" />
        <Star className="h-3.5 w-3.5 text-amber-500" />
        Default template (used when no specific template is selected)
      </label>

      {error && <div className="text-sm text-destructive bg-destructive/10 rounded-md p-2">{error}</div>}

      <div className="flex gap-2">
        <Button type="submit" disabled={saving} size="sm">
          {saving ? "Saving…" : isEdit ? "Save Changes" : "Create Template"}
        </Button>
        <Button type="button" variant="outline" size="sm" onClick={onCancel}>Cancel</Button>
      </div>
    </form>
  );
}

export function EmailTemplatesManager({ initialTemplates }: { initialTemplates: Template[] }) {
  const router = useRouter();
  const { toast } = useToast();
  const [templates, setTemplates] = useState<Template[]>(initialTemplates);
  const [showForm, setShowForm] = useState(false);
  const [editTemplate, setEditTemplate] = useState<Template | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState<{ imported: number; errors: string[] } | null>(null);
  const jsonInputRef = useRef<HTMLInputElement>(null);

  function handleSaved(saved: Template) {
    setTemplates(prev => {
      const idx = prev.findIndex(t => t.id === saved.id);
      if (idx >= 0) {
        const next = [...prev];
        next[idx] = saved;
        return next;
      }
      return [saved, ...prev];
    });
    setShowForm(false);
    setEditTemplate(null);
    toast({ variant: "success", title: editTemplate ? "Template updated" : "Template created" });
    router.refresh();
  }

  async function handleDelete(id: string) {
    if (!confirm("Delete this template?")) return;
    try {
      const res = await fetch(`/api/email-templates/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error("Delete failed");
      setTemplates(prev => prev.filter(t => t.id !== id));
      toast({ variant: "success", title: "Template deleted" });
    } catch {
      toast({ variant: "destructive", title: "Delete failed" });
    }
  }

  async function handleDuplicate(template: Template) {
    const payload = {
      name: `${template.name as string} (cópia)`,
      description: template.description,
      subject: template.subject,
      body_html: template.body_html,
      body_text: template.body_text,
      variables: template.variables,
      is_default: false,
    };
    try {
      const res = await fetch("/api/email-templates", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) throw new Error("Duplicate failed");
      const { data } = await res.json();
      setTemplates(prev => [...prev, data]);
      toast({ variant: "success", title: "Template duplicated" });
    } catch {
      toast({ variant: "destructive", title: "Duplicate failed" });
    }
  }

  async function handleJsonImport(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setImporting(true);
    setImportResult(null);
    try {
      const text = await file.text();
      let data: unknown;
      try {
        data = JSON.parse(text);
      } catch {
        throw new Error("Invalid JSON file");
      }
      const items: Template[] = Array.isArray(data) ? data : (data as { templates: Template[] }).templates ?? [];
      if (!items.length) throw new Error("No templates found in JSON");

      let imported = 0;
      const errors: string[] = [];

      for (let i = 0; i < items.length; i++) {
        const item = items[i];
        if (!item.name || !item.subject || !item.body_html) {
          errors.push(`Item ${i + 1}: missing name, subject, or body_html`);
          continue;
        }
        const payload = {
          name: item.name,
          description: item.description ?? null,
          subject: item.subject,
          body_html: item.body_html,
          body_text: item.body_text ?? null,
          variables: item.variables ?? [],
          is_default: false,
        };
        const res = await fetch("/api/email-templates", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(payload),
        });
        if (res.ok) {
          const { data: saved } = await res.json();
          setTemplates(prev => [...prev, saved]);
          imported++;
        } else {
          const j = await res.json().catch(() => ({}));
          errors.push(`Item ${i + 1} (${String(item.name)}): ${j?.error ?? "failed"}`);
        }
      }

      setImportResult({ imported, errors });
      toast({ variant: "success", title: `Imported ${imported} template(s)` });
      router.refresh();
    } catch (err) {
      toast({ variant: "destructive", title: String(err) });
    } finally {
      setImporting(false);
      if (jsonInputRef.current) jsonInputRef.current.value = "";
    }
  }

  const variables = (t: Template): string[] => {    if (Array.isArray(t.variables)) return t.variables as string[];
    if (typeof t.variables === "string") {
      try { return JSON.parse(t.variables as string) as string[]; } catch { return []; }
    }
    return [];
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-sm font-semibold text-slate-700 flex items-center gap-2">
          <Mail className="h-4 w-4" /> Email Templates ({templates.length})
        </h2>
        <div className="flex flex-wrap items-center gap-2 shrink-0">
          <label htmlFor="email-templates-json-input" className="inline-flex">
            <input
              id="email-templates-json-input"
              ref={jsonInputRef}
              type="file"
              accept=".json"
              className="sr-only"
              disabled={importing}
              onChange={handleJsonImport}
            />
            <Button
              size="sm"
              variant="outline"
              disabled={importing}
              className="gap-1.5 cursor-pointer"
              title="Import templates from JSON file"
              asChild
            >
              <span>
                {importing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Upload className="h-3.5 w-3.5" />}
                {importing ? "Importing…" : "Import JSON"}
              </span>
            </Button>
          </label>
          <Button size="sm" onClick={() => { setEditTemplate(null); setShowForm(true); }} className="gap-1.5">
            <Plus className="h-4 w-4" /> New Template
          </Button>
        </div>
      </div>

      {importResult && (
        <div className={`rounded-lg border p-3 text-sm flex items-start gap-2 ${importResult.errors.length === 0 ? "bg-green-50 border-green-200 text-green-800" : "bg-amber-50 border-amber-200 text-amber-800"}`}>
          {importResult.errors.length === 0 ? (
            <CheckCircle2 className="h-4 w-4 flex-shrink-0 mt-0.5" />
          ) : (
            <AlertCircle className="h-4 w-4 flex-shrink-0 mt-0.5" />
          )}
          <div className="flex-1 min-w-0">
            <strong>{importResult.imported} template(s) imported.</strong>
            {importResult.errors.length > 0 && (
              <ul className="mt-1 list-disc list-inside space-y-0.5">
                {importResult.errors.map((e, i) => <li key={i} className="truncate">{e}</li>)}
              </ul>
            )}
          </div>
          <button onClick={() => setImportResult(null)} className="flex-shrink-0 opacity-60 hover:opacity-100">
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      )}

      {(showForm || editTemplate) && (
        <TemplateForm
          initialData={editTemplate ?? undefined}
          onSaved={handleSaved}
          onCancel={() => { setShowForm(false); setEditTemplate(null); }}
        />
      )}

      <div className="space-y-3">
        {templates.length === 0 && (
          <div className="rounded-xl border-2 border-dashed border-slate-200 p-8 text-center">
            <Mail className="h-8 w-8 text-slate-300 mx-auto mb-3" />
            <p className="text-sm text-slate-500">No email templates yet.</p>
          </div>
        )}
        {templates.map(tmpl => (
          <div key={tmpl.id as string} className="rounded-xl border bg-white overflow-hidden">
            <div className="p-4 flex items-start gap-3">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <p className="text-sm font-semibold">{tmpl.name as string}</p>
                  {!!tmpl.is_default && (
                    <Badge className="text-xs bg-amber-50 text-amber-700 border-amber-200 gap-1">
                      <Star className="h-2.5 w-2.5" /> Default
                    </Badge>
                  )}
                </div>
                {!!tmpl.description && (
                    <p className="text-xs text-muted-foreground mt-0.5">{tmpl.description as string}</p>
                  )}
                <p className="text-xs text-slate-500 mt-1 font-medium truncate">
                  Assunto: {tmpl.subject as string}
                </p>
                {variables(tmpl).length > 0 && (
                  <div className="flex flex-wrap gap-1 mt-2">
                    {variables(tmpl).map(v => (
                      <span key={v} className="text-[10px] font-mono bg-blue-50 text-blue-600 px-1.5 py-0.5 rounded">{v}</span>
                    ))}
                  </div>
                )}
              </div>
              <div className="flex items-center gap-1.5 shrink-0">
                <button
                  onClick={() => setExpandedId(expandedId === (tmpl.id as string) ? null : (tmpl.id as string))}
                  className="p-1.5 rounded-md text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors"
                  title="Preview"
                >
                  <Eye className="h-3.5 w-3.5" />
                </button>
                <button
                  onClick={() => handleDuplicate(tmpl)}
                  className="p-1.5 rounded-md text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors"
                  title="Duplicate"
                >
                  <Copy className="h-3.5 w-3.5" />
                </button>
                <button
                  onClick={() => { setEditTemplate(tmpl); setShowForm(false); }}
                  className="p-1.5 rounded-md text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors"
                >
                  <Pencil className="h-3.5 w-3.5" />
                </button>
                <button
                  onClick={() => handleDelete(tmpl.id as string)}
                  className="p-1.5 rounded-md text-slate-300 hover:text-red-500 hover:bg-red-50 transition-colors"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>

            {expandedId === (tmpl.id as string) && (
              <div className="border-t bg-slate-50 p-4">
                <p className="text-xs font-semibold text-slate-500 mb-2 uppercase tracking-wider">HTML Preview</p>
                <div
                  className="rounded-lg border bg-white p-4 text-sm prose prose-sm max-w-none"
                  dangerouslySetInnerHTML={{ __html: String(tmpl.body_html ?? "") }}
                />
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
