"use client";

import { useState, useMemo, useRef } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/components/ui/toaster";
import {
  UserPlus, Search, Mail, Phone, Linkedin, Building2,
  Loader2, Trash2, ExternalLink, X, ChevronDown, Tag,
  Upload, FileText, CheckCircle2, AlertCircle,
} from "lucide-react";

type Contact = {
  id: string;
  company_id: string;
  email: string;
  full_name: string | null;
  title: string | null;
  department: string | null;
  seniority: string | null;
  phone: string | null;
  linkedin_url: string | null;
  source: string | null;
  confidence: number | null;
  notes: string | null;
  created_at: string;
  companies: { company_name: string; industry: string | null } | null;
};

type Company = { id: string; company_name: string };

function SeniorityBadge({ level }: { level: string | null }) {
  const map: Record<string, string> = {
    c_level: "bg-purple-100 text-purple-700",
    vp: "bg-blue-100 text-blue-700",
    director: "bg-indigo-100 text-indigo-700",
    manager: "bg-slate-100 text-slate-600",
    analyst: "bg-gray-100 text-gray-500",
  };
  if (!level) return null;
  const cls = map[level] ?? "bg-gray-100 text-gray-500";
  return (
    <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full uppercase tracking-wide ${cls}`}>
      {level.replace(/_/g, " ")}
    </span>
  );
}

function SourceBadge({ source }: { source: string | null }) {
  const map: Record<string, string> = {
    manual: "bg-green-50 text-green-600 border-green-200",
    hunter: "bg-orange-50 text-orange-600 border-orange-200",
    apollo: "bg-blue-50 text-blue-600 border-blue-200",
    linkedin: "bg-sky-50 text-sky-600 border-sky-200",
  };
  if (!source) return null;
  const cls = map[source] ?? "bg-gray-50 text-gray-500 border-gray-200";
  return (
    <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded border ${cls}`}>
      {source}
    </span>
  );
}

export function ContactsClient({
  contacts: initial,
  companies,
}: {
  contacts: Contact[];
  companies: Company[];
}) {
  const router = useRouter();
  const { toast } = useToast();

  const [contacts, setContacts] = useState<Contact[]>(initial);
  const [search, setSearch] = useState("");
  const [filterCompany, setFilterCompany] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [csvImporting, setCsvImporting] = useState(false);
  const [csvResult, setCsvResult] = useState<{ imported: number; errors: string[] } | null>(null);
  const csvInputRef = useRef<HTMLInputElement>(null);

  const [form, setForm] = useState({
    company_id: "",
    email: "",
    full_name: "",
    title: "",
    department: "",
    seniority: "manager",
    phone: "",
    linkedin_url: "",
    source: "manual" as const,
    notes: "",
  });

  const filtered = useMemo(() => {
    return contacts.filter((c) => {
      const q = search.toLowerCase();
      const matchSearch =
        !q ||
        c.email.toLowerCase().includes(q) ||
        (c.full_name ?? "").toLowerCase().includes(q) ||
        (c.title ?? "").toLowerCase().includes(q) ||
        (c.companies?.company_name ?? "").toLowerCase().includes(q);
      const matchCompany = !filterCompany || c.company_id === filterCompany;
      return matchSearch && matchCompany;
    });
  }, [contacts, search, filterCompany]);

  async function handleCsvImport(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setCsvImporting(true);
    setCsvResult(null);
    try {
      const formData = new FormData();
      formData.append("file", file);
      const res = await fetch("/api/contacts/bulk-import", {
        method: "POST",
        body: formData,
      });
      const j = await res.json();
      if (!res.ok) throw new Error(j?.error ?? "Import failed");
      const imported = j.imported ?? 0;
      const errors: string[] = j.errors ?? [];
      setCsvResult({ imported, errors });
      toast({ variant: "success", title: `Imported ${imported} contact(s)` });
      router.refresh();
    } catch (err) {
      toast({ variant: "destructive", title: String(err) });
    } finally {
      setCsvImporting(false);
      if (csvInputRef.current) csvInputRef.current.value = "";
    }
  }

  async function handleSave() {
    if (!form.company_id || !form.email) {
      toast({ variant: "destructive", title: "Company and email are required" });
      return;
    }
    setSaving(true);
    try {
      const res = await fetch("/api/contacts", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(form),
      });
      const j = await res.json();
      if (!res.ok) throw new Error(j?.error ?? "Failed");
      toast({ variant: "success", title: `Contact saved` });
      setShowForm(false);
      setForm({
        company_id: "", email: "", full_name: "", title: "",
        department: "", seniority: "manager", phone: "",
        linkedin_url: "", source: "manual", notes: "",
      });
      router.refresh();
      // Optimistically add if returned
      if (j.contacts?.[0]) {
        const company = companies.find((c) => c.id === form.company_id);
        setContacts((prev) => [
          {
            ...j.contacts[0],
            companies: company ? { company_name: company.company_name, industry: null } : null,
          },
          ...prev,
        ]);
      }
    } catch (e) {
      toast({ variant: "destructive", title: String(e) });
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id: string) {
    if (!confirm("Delete this contact?")) return;
    setDeleting(id);
    try {
      const res = await fetch(`/api/contacts/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error("Failed");
      setContacts((prev) => prev.filter((c) => c.id !== id));
      toast({ variant: "success", title: "Contact deleted" });
    } catch {
      toast({ variant: "destructive", title: "Delete failed" });
    } finally {
      setDeleting(null);
    }
  }

  return (
    <div className="space-y-5">
      {/* Toolbar */}
      <div className="flex flex-wrap gap-3 items-center">
        <div className="relative flex-1 min-w-48">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            className="pl-8"
            placeholder="Search name, email, title, company…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>

        <select
          value={filterCompany}
          onChange={(e) => setFilterCompany(e.target.value)}
          className="rounded-md border border-input bg-background px-3 py-2 text-sm"
        >
          <option value="">All companies</option>
          {companies.map((c) => (
            <option key={c.id} value={c.id}>{c.company_name}</option>
          ))}
        </select>

        <Button onClick={() => setShowForm((v) => !v)} className="gap-1.5">
          <UserPlus className="h-4 w-4" />
          Add Contact
        </Button>

        <label htmlFor="contacts-csv-input" className="inline-flex">
          <input
            id="contacts-csv-input"
            ref={csvInputRef}
            type="file"
            accept=".csv"
            className="sr-only"
            disabled={csvImporting}
            onChange={handleCsvImport}
          />
          <Button
            variant="outline"
            disabled={csvImporting}
            className="gap-1.5 cursor-pointer"
            title="Import contacts from CSV (email, full_name, company_name, ...)"
            asChild
          >
            <span>
              {csvImporting ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Upload className="h-4 w-4" />
              )}
              {csvImporting ? "Importing…" : "Import CSV"}
            </span>
          </Button>
        </label>
        <a
          href="/api/contacts/bulk-import"
          download="contacts_import_template.csv"
          className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground px-2 py-1.5 rounded border border-dashed border-slate-300 dark:border-slate-600 hover:border-slate-400 transition-colors"
          title="Download CSV template"
        >
          <FileText className="h-3.5 w-3.5" />
          CSV template
        </a>
      </div>

      {/* CSV import result banner */}
      {csvResult && (
        <div className={`rounded-lg border p-3 text-sm flex items-start gap-2 ${csvResult.errors.length === 0 ? "bg-green-50 border-green-200 text-green-800" : "bg-amber-50 border-amber-200 text-amber-800"}`}>
          {csvResult.errors.length === 0 ? (
            <CheckCircle2 className="h-4 w-4 flex-shrink-0 mt-0.5" />
          ) : (
            <AlertCircle className="h-4 w-4 flex-shrink-0 mt-0.5" />
          )}
          <div className="flex-1 min-w-0">
            <strong>{csvResult.imported} contact(s) imported.</strong>
            {csvResult.errors.length > 0 && (
              <ul className="mt-1 list-disc list-inside space-y-0.5">
                {csvResult.errors.slice(0, 5).map((e, i) => <li key={i} className="truncate">{e}</li>)}
                {csvResult.errors.length > 5 && <li>…and {csvResult.errors.length - 5} more</li>}
              </ul>
            )}
          </div>
          <button onClick={() => setCsvResult(null)} className="flex-shrink-0 opacity-60 hover:opacity-100">
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      )}

      {/* Add Contact Form */}
      {showForm && (
        <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-5 space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="font-semibold text-slate-800 dark:text-slate-200">New Contact</h3>
            <button onClick={() => setShowForm(false)} className="text-slate-400 hover:text-slate-600">
              <X className="h-4 w-4" />
            </button>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1">
              <Label>Company *</Label>
              <select
                value={form.company_id}
                onChange={(e) => setForm((f) => ({ ...f, company_id: e.target.value }))}
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              >
                <option value="">Select company…</option>
                {companies.map((c) => (
                  <option key={c.id} value={c.id}>{c.company_name}</option>
                ))}
              </select>
            </div>

            <div className="space-y-1">
              <Label>Email *</Label>
              <Input
                type="email"
                value={form.email}
                onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
                placeholder="contact@company.com"
              />
            </div>

            <div className="space-y-1">
              <Label>Full Name</Label>
              <Input
                value={form.full_name}
                onChange={(e) => setForm((f) => ({ ...f, full_name: e.target.value }))}
                placeholder="Maria Silva"
              />
            </div>

            <div className="space-y-1">
              <Label>Title / Role</Label>
              <Input
                value={form.title}
                onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
                placeholder="Marketing Director"
              />
            </div>

            <div className="space-y-1">
              <Label>Department</Label>
              <Input
                value={form.department}
                onChange={(e) => setForm((f) => ({ ...f, department: e.target.value }))}
                placeholder="Marketing"
              />
            </div>

            <div className="space-y-1">
              <Label>Seniority</Label>
              <select
                value={form.seniority}
                onChange={(e) => setForm((f) => ({ ...f, seniority: e.target.value }))}
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              >
                <option value="analyst">Analyst</option>
                <option value="manager">Manager</option>
                <option value="director">Director</option>
                <option value="vp">VP</option>
                <option value="c_level">C-Level</option>
              </select>
            </div>

            <div className="space-y-1">
              <Label>Phone</Label>
              <Input
                value={form.phone}
                onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))}
                placeholder="+55 41 99999-9999"
              />
            </div>

            <div className="space-y-1">
              <Label>LinkedIn URL</Label>
              <Input
                value={form.linkedin_url}
                onChange={(e) => setForm((f) => ({ ...f, linkedin_url: e.target.value }))}
                placeholder="https://linkedin.com/in/…"
              />
            </div>

            <div className="space-y-1 sm:col-span-2">
              <Label>Notes</Label>
              <Input
                value={form.notes}
                onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
                placeholder="Best time to call, intro context…"
              />
            </div>
          </div>

          <div className="flex gap-3 justify-end">
            <Button variant="outline" onClick={() => setShowForm(false)}>Cancel</Button>
            <Button onClick={handleSave} disabled={saving} className="gap-1.5">
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <UserPlus className="h-4 w-4" />}
              Save Contact
            </Button>
          </div>
        </div>
      )}

      {/* Stats */}
      <div className="text-sm text-muted-foreground">
        Showing <strong>{filtered.length}</strong> of {contacts.length} contacts
      </div>

      {/* Contact table */}
      {filtered.length === 0 ? (
        <div className="rounded-xl border border-dashed border-slate-200 dark:border-slate-700 py-16 text-center text-muted-foreground">
          <UserPlus className="h-8 w-8 mx-auto mb-2 opacity-30" />
          <p className="text-sm">{contacts.length === 0 ? "No contacts yet — add your first contact above." : "No contacts match your search."}</p>
        </div>
      ) : (
        <div className="rounded-xl border border-slate-200 dark:border-slate-700 overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 dark:bg-slate-800/50">
              <tr>
                <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wide">Contact</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wide hidden md:table-cell">Company</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wide hidden lg:table-cell">Role</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wide hidden xl:table-cell">Source</th>
                <th className="px-4 py-3 w-12" />
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {filtered.map((c) => (
                <tr key={c.id} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/20 transition-colors">
                  <td className="px-4 py-3">
                    <div className="flex items-start gap-3">
                      <div className="h-8 w-8 rounded-full bg-indigo-100 dark:bg-indigo-900/40 flex items-center justify-center text-xs font-bold text-indigo-600 flex-shrink-0">
                        {(c.full_name ?? c.email)[0].toUpperCase()}
                      </div>
                      <div className="min-w-0">
                        <div className="font-medium text-slate-800 dark:text-slate-200 truncate">
                          {c.full_name ?? <span className="text-muted-foreground italic">No name</span>}
                        </div>
                        <a href={`mailto:${c.email}`} className="text-xs text-indigo-600 hover:underline flex items-center gap-1">
                          <Mail className="h-3 w-3" />{c.email}
                        </a>
                        {c.phone && (
                          <a href={`tel:${c.phone}`} className="text-xs text-slate-500 flex items-center gap-1 mt-0.5">
                            <Phone className="h-3 w-3" />{c.phone}
                          </a>
                        )}
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3 hidden md:table-cell">
                    <div className="flex items-center gap-1.5 text-slate-600 dark:text-slate-400">
                      <Building2 className="h-3.5 w-3.5 flex-shrink-0" />
                      <span className="truncate">{c.companies?.company_name ?? "—"}</span>
                    </div>
                    {c.companies?.industry && (
                      <div className="text-xs text-muted-foreground mt-0.5">{c.companies.industry}</div>
                    )}
                  </td>
                  <td className="px-4 py-3 hidden lg:table-cell">
                    <div className="space-y-1">
                      {c.title && <div className="text-slate-700 dark:text-slate-300">{c.title}</div>}
                      {c.department && <div className="text-xs text-muted-foreground">{c.department}</div>}
                      <SeniorityBadge level={c.seniority} />
                    </div>
                  </td>
                  <td className="px-4 py-3 hidden xl:table-cell">
                    <SourceBadge source={c.source} />
                    {c.confidence != null && (
                      <div className="text-xs text-muted-foreground mt-1">{c.confidence}% confidence</div>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-1.5 justify-end">
                      {c.linkedin_url && (
                        <a
                          href={c.linkedin_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-blue-500 hover:text-blue-700 p-1 rounded"
                          title="LinkedIn"
                        >
                          <Linkedin className="h-3.5 w-3.5" />
                        </a>
                      )}
                      <button
                        onClick={() => handleDelete(c.id)}
                        disabled={deleting === c.id}
                        className="text-slate-400 hover:text-red-500 p-1 rounded transition-colors disabled:opacity-50"
                        title="Delete contact"
                      >
                        {deleting === c.id ? (
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        ) : (
                          <Trash2 className="h-3.5 w-3.5" />
                        )}
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
