"use client";

import { useState, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/components/ui/toaster";
import {
  Send, Loader2, Users, Mail, Clock,
  CheckCircle2, ChevronDown, ChevronRight, Newspaper,
  X, Eye, EyeOff, BarChart2, CalendarClock, UserMinus,
} from "lucide-react";
import { formatDate } from "@/lib/utils";

type Company = {
  id: string;
  company_name: string;
  industry: string | null;
  contact_count: number;
};

type Newsletter = {
  id: string;
  subject: string;
  recipient_count: number;
  status: string;
  sent_at: string | null;
  created_at: string;
};

type Template = {
  id: string;
  name: string;
  subject: string;
  body_html?: string;
};

export function NewsletterClient({
  companies,
  newsletters: initialNewsletters,
  templates,
  totalSent,
  unsubscribeCount,
}: {
  companies: Company[];
  newsletters: Newsletter[];
  templates: Template[];
  totalSent: number;
  unsubscribeCount: number;
}) {
  const { toast } = useToast();

  const [newsletters, setNewsletters] = useState<Newsletter[]>(initialNewsletters);
  const [sending, setSending] = useState(false);
  const [showPreview, setShowPreview] = useState(false);
  const [showHistory, setShowHistory] = useState(true);

  // Form state
  const [subject, setSubject] = useState("");
  const [bodyHtml, setBodyHtml] = useState("");
  const [recipientMode, setRecipientMode] = useState<"all" | "companies" | "manual">("all");
  const [selectedCompanies, setSelectedCompanies] = useState<Set<string>>(new Set());
  const [manualEmails, setManualEmails] = useState("");
  const [selectedTemplate, setSelectedTemplate] = useState<string>("");
  const [scheduledFor, setScheduledFor] = useState<string>("");

  const totalRecipients = useMemo(() => {
    if (recipientMode === "all") {
      return companies.reduce((sum, c) => sum + c.contact_count, 0);
    }
    if (recipientMode === "companies") {
      return companies
        .filter((c) => selectedCompanies.has(c.id))
        .reduce((sum, c) => sum + c.contact_count, 0);
    }
    return manualEmails
      .split(/[,\n]/)
      .map((e) => e.trim())
      .filter((e) => e.includes("@")).length;
  }, [recipientMode, companies, selectedCompanies, manualEmails]);

  function applyTemplate(templateId: string) {
    const t = templates.find((t) => t.id === templateId);
    if (!t) return;
    setSubject(t.subject ?? "");
    setBodyHtml(t.body_html ?? "");
    setSelectedTemplate(templateId);
  }

  function toggleCompany(id: string) {
    setSelectedCompanies((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function selectAllWithContacts() {
    setSelectedCompanies(new Set(companies.filter((c) => c.contact_count > 0).map((c) => c.id)));
  }

  async function handleSend() {
    if (!subject.trim()) {
      toast({ variant: "destructive", title: "Subject is required" });
      return;
    }
    if (!bodyHtml.trim()) {
      toast({ variant: "destructive", title: "Email body is required" });
      return;
    }
    if (totalRecipients === 0) {
      toast({ variant: "destructive", title: "No recipients selected" });
      return;
    }
    const isScheduled = !!scheduledFor;
    const confirmMsg = isScheduled
      ? `Schedule newsletter for ${new Date(scheduledFor).toLocaleString("pt-BR")} to ${totalRecipients} contact${totalRecipients !== 1 ? "s" : ""}?`
      : `Send newsletter to ${totalRecipients} contact${totalRecipients !== 1 ? "s" : ""}?`;
    if (!confirm(confirmMsg)) return;

    setSending(true);
    try {
      const payload: Record<string, unknown> = { subject, body_html: bodyHtml };
      if (scheduledFor) payload.scheduled_for = scheduledFor;
      if (recipientMode === "all") {
        payload.send_to_all_contacts = true;
      } else if (recipientMode === "companies") {
        payload.recipient_company_ids = [...selectedCompanies];
      } else {
        payload.recipient_emails = manualEmails
          .split(/[,\n]/)
          .map((e) => e.trim())
          .filter((e) => e.includes("@"));
      }

      const res = await fetch("/api/newsletter", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
      });
      const j = await res.json();
      if (!res.ok) throw new Error(j?.error ?? "Send failed");

      toast({ variant: "success", title: j.message ?? `Sent to ${j.recipient_count} recipients` });

      // Reset form
      setSubject("");
      setBodyHtml("");
      setSelectedCompanies(new Set());
      setManualEmails("");
      setSelectedTemplate("");
      setScheduledFor("");

      // Add to history optimistically
      if (j.newsletter) {
        setNewsletters((prev) => [j.newsletter, ...prev]);
      }
    } catch (e) {
      toast({ variant: "destructive", title: String(e) });
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
      {/* Analytics summary */}
      <div className="lg:col-span-3 grid grid-cols-2 sm:grid-cols-2 gap-3">
        <div className="rounded-xl border border-slate-200 dark:border-slate-700 p-4 flex items-center gap-3">
          <div className="h-9 w-9 rounded-lg bg-indigo-50 dark:bg-indigo-900/30 flex items-center justify-center flex-shrink-0">
            <BarChart2 className="h-4 w-4 text-indigo-600 dark:text-indigo-400" />
          </div>
          <div>
            <p className="text-2xl font-bold text-slate-800 dark:text-slate-200">{totalSent.toLocaleString()}</p>
            <p className="text-xs text-muted-foreground">Total sent</p>
          </div>
        </div>
        <div className="rounded-xl border border-slate-200 dark:border-slate-700 p-4 flex items-center gap-3">
          <div className="h-9 w-9 rounded-lg bg-red-50 dark:bg-red-900/30 flex items-center justify-center flex-shrink-0">
            <UserMinus className="h-4 w-4 text-red-500 dark:text-red-400" />
          </div>
          <div>
            <p className="text-2xl font-bold text-slate-800 dark:text-slate-200">{unsubscribeCount.toLocaleString()}</p>
            <p className="text-xs text-muted-foreground">Unsubscribes</p>
          </div>
        </div>
      </div>

      {/* Composer — main column */}
      <div className="lg:col-span-2 space-y-5">
        {/* Template picker */}
        {templates.length > 0 && (
          <div className="rounded-xl border border-slate-200 dark:border-slate-700 p-4 space-y-3">
            <div className="flex items-center gap-2">
              <Mail className="h-4 w-4 text-muted-foreground" />
              <span className="text-sm font-semibold">Start from template</span>
            </div>
            <div className="flex gap-2 flex-wrap">
              {templates.map((t) => (
                <button
                  key={t.id}
                  onClick={() => applyTemplate(t.id)}
                  className={`text-xs px-3 py-1.5 rounded-full border transition-colors ${
                    selectedTemplate === t.id
                      ? "bg-primary text-primary-foreground border-primary"
                      : "border-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300"
                  }`}
                >
                  {t.name}
                </button>
              ))}
              {selectedTemplate && (
                <button
                  onClick={() => { setSelectedTemplate(""); setSubject(""); setBodyHtml(""); }}
                  className="text-xs px-3 py-1.5 rounded-full border border-red-200 text-red-600 hover:bg-red-50"
                >
                  <X className="h-3 w-3 inline mr-1" />Clear
                </button>
              )}
            </div>
          </div>
        )}

        {/* Subject */}
        <div className="space-y-1.5">
          <Label>Subject *</Label>
          <Input
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
            placeholder="e.g. Coritiba FC — Oportunidade de Patrocínio 2025/26"
            className="text-base"
          />
        </div>

        {/* Body */}
        <div className="space-y-1.5">
          <div className="flex items-center justify-between">
            <Label>Email body (HTML or plain text) *</Label>
            <button
              type="button"
              onClick={() => setShowPreview((v) => !v)}
              className="text-xs text-indigo-600 flex items-center gap-1 hover:underline"
            >
              {showPreview ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
              {showPreview ? "Hide preview" : "Preview"}
            </button>
          </div>
          {showPreview ? (
            <div
              className="min-h-48 rounded-xl border border-slate-200 dark:border-slate-700 p-4 bg-white dark:bg-slate-900 prose prose-sm max-w-none overflow-auto"
              dangerouslySetInnerHTML={{ __html: bodyHtml || "<p class='text-muted-foreground'>No content yet…</p>" }}
            />
          ) : (
            <Textarea
              value={bodyHtml}
              onChange={(e) => setBodyHtml(e.target.value)}
              placeholder="Write your email here. Supports HTML for rich formatting."
              rows={14}
              className="font-mono text-xs"
            />
          )}
          <p className="text-xs text-muted-foreground">
            Tip: use <code className="bg-muted px-1 rounded">{"{{company_name}}"}</code>, <code className="bg-muted px-1 rounded">{"{{contact_name}}"}</code> for personalization.
          </p>
        </div>

        {/* Send / Schedule */}
        <div className="rounded-xl border border-slate-200 dark:border-slate-700 p-4 space-y-3">
          <div className="flex items-start justify-between gap-4 flex-wrap">
            <div>
              <p className="text-sm font-semibold text-slate-800 dark:text-slate-200">
                Ready to send
              </p>
              <p className="text-xs text-muted-foreground">
                {totalRecipients > 0
                  ? `${totalRecipients} recipient${totalRecipients !== 1 ? "s" : ""} selected`
                  : "Select recipients on the right →"}
              </p>
            </div>
            <Button
              onClick={handleSend}
              disabled={sending || totalRecipients === 0 || !subject.trim() || !bodyHtml.trim()}
              className="gap-2"
            >
              {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
              {scheduledFor ? "Schedule" : "Send Now"}
            </Button>
          </div>
          {/* Schedule option */}
          <div className="flex items-center gap-2 pt-1 border-t border-slate-100 dark:border-slate-800">
            <CalendarClock className="h-4 w-4 text-muted-foreground flex-shrink-0" />
            <Label className="text-xs text-muted-foreground whitespace-nowrap">Schedule for later</Label>
            <input
              type="datetime-local"
              value={scheduledFor}
              onChange={(e) => setScheduledFor(e.target.value)}
              className="flex-1 min-w-0 text-xs rounded-lg border border-slate-200 dark:border-slate-700 bg-transparent px-2.5 py-1.5 text-slate-700 dark:text-slate-300 focus:outline-none focus:ring-2 focus:ring-primary/50"
            />
            {scheduledFor && (
              <button
                type="button"
                onClick={() => setScheduledFor("")}
                className="text-xs text-red-500 hover:underline flex-shrink-0"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Sidebar — recipients + history */}
      <div className="space-y-5">
        {/* Recipient picker */}
        <div className="rounded-xl border border-slate-200 dark:border-slate-700 overflow-hidden">
          <div className="px-4 py-3 border-b border-slate-100 dark:border-slate-800 flex items-center gap-2">
            <Users className="h-4 w-4 text-muted-foreground" />
            <span className="text-sm font-semibold">Recipients</span>
            {totalRecipients > 0 && (
              <span className="ml-auto text-xs font-semibold bg-indigo-100 text-indigo-700 px-2 py-0.5 rounded-full">
                {totalRecipients}
              </span>
            )}
          </div>
          <div className="p-4 space-y-4">
            {/* Mode selector */}
            <div className="flex flex-col gap-2">
              {(["all", "companies", "manual"] as const).map((mode) => (
                <label key={mode} className="flex items-center gap-2.5 cursor-pointer">
                  <input
                    type="radio"
                    name="recipientMode"
                    value={mode}
                    checked={recipientMode === mode}
                    onChange={() => setRecipientMode(mode)}
                    className="accent-primary"
                  />
                  <span className="text-sm capitalize">
                    {mode === "all" ? `All contacts (${companies.reduce((s, c) => s + c.contact_count, 0)})` :
                      mode === "companies" ? "Select companies" : "Manual email list"}
                  </span>
                </label>
              ))}
            </div>

            {/* Company picker */}
            {recipientMode === "companies" && (
              <div className="space-y-2">
                <button
                  onClick={selectAllWithContacts}
                  className="text-xs text-indigo-600 hover:underline"
                >
                  Select all with contacts
                </button>
                <div className="max-h-64 overflow-y-auto space-y-1">
                  {companies.map((c) => (
                    <label key={c.id} className="flex items-center gap-2.5 cursor-pointer rounded p-1.5 hover:bg-slate-50 dark:hover:bg-slate-800">
                      <input
                        type="checkbox"
                        checked={selectedCompanies.has(c.id)}
                        onChange={() => toggleCompany(c.id)}
                        className="accent-primary"
                        disabled={c.contact_count === 0}
                      />
                      <span className="flex-1 text-sm truncate text-slate-700 dark:text-slate-300">{c.company_name}</span>
                      <span className={`text-xs px-1.5 py-0.5 rounded-full ${c.contact_count > 0 ? "bg-slate-100 text-slate-600" : "bg-red-50 text-red-400"}`}>
                        {c.contact_count} contacts
                      </span>
                    </label>
                  ))}
                </div>
              </div>
            )}

            {/* Manual emails */}
            {recipientMode === "manual" && (
              <div className="space-y-1">
                <Label className="text-xs">Emails (comma or newline separated)</Label>
                <Textarea
                  value={manualEmails}
                  onChange={(e) => setManualEmails(e.target.value)}
                  placeholder={"email1@company.com\nemail2@sponsor.com"}
                  rows={5}
                  className="text-xs"
                />
              </div>
            )}
          </div>
        </div>

        {/* Send history */}
        <div className="rounded-xl border border-slate-200 dark:border-slate-700 overflow-hidden">
          <button
            type="button"
            onClick={() => setShowHistory((v) => !v)}
            className="w-full px-4 py-3 border-b border-slate-100 dark:border-slate-800 flex items-center gap-2 hover:bg-slate-50/50 dark:hover:bg-slate-800/30 transition-colors"
          >
            <Clock className="h-4 w-4 text-muted-foreground" />
            <span className="text-sm font-semibold">Send history</span>
            <span className="ml-auto text-xs text-muted-foreground">{newsletters.length}</span>
            {showHistory ? <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" /> : <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />}
          </button>
          {showHistory && (
            <div className="divide-y divide-slate-100 dark:divide-slate-800">
              {newsletters.length === 0 ? (
                <div className="px-4 py-6 text-center text-sm text-muted-foreground">
                  <Newspaper className="h-6 w-6 mx-auto mb-2 opacity-30" />
                  No newsletters sent yet
                </div>
              ) : (
                newsletters.map((n) => (
                  <div key={n.id} className="px-4 py-3 space-y-1">
                    <div className="flex items-start justify-between gap-2">
                      <p className="text-sm font-medium text-slate-700 dark:text-slate-300 truncate">{n.subject}</p>
                      <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full flex-shrink-0 ${
                        n.status === "sent" ? "bg-emerald-100 text-emerald-700" : "bg-amber-100 text-amber-700"
                      }`}>
                        {n.status}
                      </span>
                    </div>
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                      <Users className="h-3 w-3" />
                      <span>{n.recipient_count} recipients</span>
                      <span>·</span>
                      <span>{formatDate(n.sent_at ?? n.created_at)}</span>
                    </div>
                  </div>
                ))
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
