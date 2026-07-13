"use client";

import { useState } from "react";
import { PageHeader } from "@/components/shared/page-header";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Newspaper, Mail, Send, Settings2, BarChart3, Users, Plus, X, ExternalLink,
  CheckCircle2, Clock, ChevronDown, ChevronUp
} from "lucide-react";

const INDUSTRIES = [
  "Automotivo", "Financeiro", "Alimentos e Bebidas", "Saúde",
  "Construção e Imobiliário", "Comércio - Atacado e Varejo", "Energia",
  "Educação", "Transporte e Logística", "Tecnologia", "Bebidas / FMCG",
  "Beleza / Cosméticos / ESG", "Moda Esportiva",
];

const DAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
const HOURS = Array.from({ length: 24 }, (_, i) => `${i.toString().padStart(2, "0")}:00`);

type NewsItem = { title: string; body: string; link: string };

type NewsletterBlock = {
  header: { logo: boolean; title: string };
  intro: string;
  newsItems: NewsItem[];
  cta: { text: string; url: string };
};

const DEFAULT_BLOCKS: NewsletterBlock = {
  header: { logo: true, title: "Coritiba FC — Sponsorship Update" },
  intro: "Olá! Confira as últimas oportunidades de patrocínio do Coritiba FC.",
  newsItems: [
    { title: "Nova oportunidade de patrocínio", body: "Detalhe da oportunidade aqui.", link: "" },
    { title: "Resultados da última rodada", body: "Coritiba continua em destaque.", link: "" },
  ],
  cta: { text: "Ver propostas", url: "https://coritiba.com.br/patrocinio" },
};

function NewsItemEditor({ item, index, onChange, onRemove }: {
  item: NewsItem;
  index: number;
  onChange: (i: number, field: keyof NewsItem, val: string) => void;
  onRemove: (i: number) => void;
}) {
  return (
    <div className="rounded-lg border p-3 space-y-2 bg-slate-50">
      <div className="flex items-center justify-between">
        <span className="text-xs font-semibold text-slate-600">News Item {index + 1}</span>
        <button onClick={() => onRemove(index)} className="text-slate-400 hover:text-red-500 transition-colors">
          <X className="h-3.5 w-3.5" />
        </button>
      </div>
      <div className="space-y-1.5">
        <Label className="text-xs">Title</Label>
        <Input value={item.title} onChange={(e) => onChange(index, "title", e.target.value)} placeholder="News item title" />
      </div>
      <div className="space-y-1.5">
        <Label className="text-xs">Body</Label>
        <Textarea value={item.body} onChange={(e) => onChange(index, "body", e.target.value)} rows={2} placeholder="Body text..." />
      </div>
      <div className="space-y-1.5">
        <Label className="text-xs">Link (optional)</Label>
        <Input value={item.link} onChange={(e) => onChange(index, "link", e.target.value)} placeholder="https://..." />
      </div>
    </div>
  );
}

function renderPreviewHtml(blocks: NewsletterBlock, subject: string): string {
  const newsHtml = blocks.newsItems.map((n, i) => `
    <div style="margin-bottom:20px;padding:16px;background:#f8fafc;border-radius:8px;border-left:3px solid #16a34a;">
      <h3 style="margin:0 0 8px;font-size:15px;color:#1e293b;">${n.title || `News ${i + 1}`}</h3>
      <p style="margin:0;font-size:13px;color:#475569;">${n.body}</p>
      ${n.link ? `<a href="${n.link}" style="display:inline-block;margin-top:8px;font-size:12px;color:#16a34a;">Read more →</a>` : ""}
    </div>
  `).join("");

  return `
<!DOCTYPE html>
<html>
<head><meta charset="UTF-8"><title>${subject}</title></head>
<body style="font-family:Inter,Arial,sans-serif;max-width:600px;margin:0 auto;padding:24px;background:#f1f5f9;">
  <div style="background:white;border-radius:12px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,.1);">
    ${blocks.header.logo ? `<div style="background:linear-gradient(135deg,#14532d,#166534);padding:24px;text-align:center;">
      <h1 style="margin:0;color:white;font-size:20px;font-weight:700;">${blocks.header.title}</h1>
    </div>` : ""}
    <div style="padding:24px;">
      <p style="font-size:14px;color:#475569;margin-bottom:20px;">${blocks.intro}</p>
      ${newsHtml}
      <div style="text-align:center;margin-top:24px;">
        <a href="${blocks.cta.url}" style="display:inline-block;padding:12px 28px;background:#16a34a;color:white;border-radius:8px;font-size:14px;font-weight:600;text-decoration:none;">
          ${blocks.cta.text}
        </a>
      </div>
    </div>
    <div style="padding:16px 24px;background:#f8fafc;border-top:1px solid #e2e8f0;font-size:11px;color:#94a3b8;text-align:center;">
      Coritiba FC Commercial Intelligence — <a href="#" style="color:#94a3b8;">Unsubscribe</a>
    </div>
  </div>
</body>
</html>`.trim();
}

export default function NewsletterSettingsPage() {
  const [selectedIndustries, setSelectedIndustries] = useState<string[]>([]);
  const [subject, setSubject] = useState("Coritiba FC — Oportunidade de Patrocínio");
  const [sendDay, setSendDay] = useState("Tuesday");
  const [sendHour, setSendHour] = useState("09:00");
  const [blocks, setBlocks] = useState<NewsletterBlock>(DEFAULT_BLOCKS);
  const [showPreview, setShowPreview] = useState(false);
  const [testEmail, setTestEmail] = useState("");
  const [testSending, setTestSending] = useState(false);
  const [testResult, setTestResult] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [configSaved, setConfigSaved] = useState(false);

  // Mock past newsletters data
  const pastNewsletters = [
    { id: "1", subject: "Coritiba FC — Proposta de Parceria Jul/2026", sent_at: "2026-07-01", recipient_count: 42, open_rate: 38, click_rate: 12, unsubscribe_count: 1 },
    { id: "2", subject: "Oportunidades de Patrocínio — Copa do Brasil", sent_at: "2026-06-15", recipient_count: 38, open_rate: 45, click_rate: 18, unsubscribe_count: 0 },
    { id: "3", subject: "Coritiba FC — Newsletter Jun/2026", sent_at: "2026-06-01", recipient_count: 35, open_rate: 32, click_rate: 9, unsubscribe_count: 2 },
  ];

  const mockUnsubscribes = [
    { email: "contato@empresa.com.br", date: "2026-07-01", reason: "Not interested" },
    { email: "marketing@exemplo.com", date: "2026-06-15", reason: "Too frequent" },
  ];

  function toggleIndustry(ind: string) {
    setSelectedIndustries((prev) =>
      prev.includes(ind) ? prev.filter((i) => i !== ind) : [...prev, ind]
    );
  }

  function updateNewsItem(i: number, field: keyof NewsItem, val: string) {
    setBlocks((prev) => {
      const items = [...prev.newsItems];
      items[i] = { ...items[i], [field]: val };
      return { ...prev, newsItems: items };
    });
  }

  function removeNewsItem(i: number) {
    setBlocks((prev) => ({ ...prev, newsItems: prev.newsItems.filter((_, idx) => idx !== i) }));
  }

  function addNewsItem() {
    if (blocks.newsItems.length >= 3) return;
    setBlocks((prev) => ({
      ...prev,
      newsItems: [...prev.newsItems, { title: "", body: "", link: "" }],
    }));
  }

  async function sendTestEmail() {
    if (!testEmail) return;
    setTestSending(true);
    setTestResult(null);
    try {
      const res = await fetch("/api/newsletter", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          subject,
          body_html: renderPreviewHtml(blocks, subject),
          recipient_emails: [testEmail],
        }),
      });
      const j = await res.json();
      setTestResult(res.ok ? `Test sent to ${testEmail}` : j.error ?? "Failed");
    } catch {
      setTestResult("Send error");
    } finally {
      setTestSending(false);
    }
  }

  async function saveConfig() {
    setSaving(true);
    await new Promise((r) => setTimeout(r, 600));
    setSaving(false);
    setConfigSaved(true);
    setTimeout(() => setConfigSaved(false), 3000);
  }

  const previewHtml = renderPreviewHtml(blocks, subject);

  return (
    <>
      <PageHeader
        title="Newsletter Configuration"
        description="Configure, build, and schedule your sponsor outreach newsletter"
      />

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left: Config + Builder */}
        <div className="lg:col-span-2 space-y-6">
          {/* Section 1: Configure */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <Settings2 className="h-4 w-4 text-blue-500" /> Configure Newsletter
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-1.5">
                <Label className="text-xs">Subject Template</Label>
                <Input
                  value={subject}
                  onChange={(e) => setSubject(e.target.value)}
                  placeholder="e.g. Coritiba FC — Sponsorship Opportunity"
                />
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs">Industry Segments (multi-select)</Label>
                <div className="flex flex-wrap gap-1.5 p-2 border rounded-md bg-background min-h-[40px]">
                  {INDUSTRIES.map((ind) => (
                    <button
                      key={ind}
                      type="button"
                      onClick={() => toggleIndustry(ind)}
                      className={`px-2 py-1 rounded-full text-xs border font-medium transition-colors ${
                        selectedIndustries.includes(ind)
                          ? "bg-green-600 text-white border-green-600"
                          : "bg-background text-muted-foreground border-input hover:bg-muted"
                      }`}
                    >
                      {ind}
                    </button>
                  ))}
                </div>
                <p className="text-xs text-muted-foreground">
                  {selectedIndustries.length === 0 ? "Sends to all industries" : `${selectedIndustries.length} segment(s) selected`}
                </p>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label className="text-xs">Send Day</Label>
                  <select
                    value={sendDay}
                    onChange={(e) => setSendDay(e.target.value)}
                    className="w-full rounded-md border bg-background px-3 py-2 text-sm outline-none"
                  >
                    {DAYS.map((d) => <option key={d} value={d}>{d}</option>)}
                  </select>
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Send Time</Label>
                  <select
                    value={sendHour}
                    onChange={(e) => setSendHour(e.target.value)}
                    className="w-full rounded-md border bg-background px-3 py-2 text-sm outline-none"
                  >
                    {HOURS.map((h) => <option key={h} value={h}>{h}</option>)}
                  </select>
                </div>
              </div>

              <div className="flex items-center gap-2 pt-2">
                <div className="flex gap-2 flex-1">
                  <Input
                    type="email"
                    value={testEmail}
                    onChange={(e) => setTestEmail(e.target.value)}
                    placeholder="test@example.com"
                    className="flex-1"
                  />
                  <Button size="sm" variant="outline" onClick={sendTestEmail} disabled={testSending || !testEmail}>
                    <Send className="h-3.5 w-3.5 mr-1" />
                    {testSending ? "Sending…" : "Test Email"}
                  </Button>
                </div>
                <Button size="sm" onClick={saveConfig} disabled={saving}>
                  {saving ? "Saving…" : configSaved ? <><CheckCircle2 className="h-3.5 w-3.5 mr-1" />Saved!</> : "Save Config"}
                </Button>
              </div>
              {testResult && (
                <p className={`text-xs rounded p-2 ${testResult.startsWith("Test sent") ? "bg-green-50 text-green-700" : "bg-red-50 text-red-700"}`}>
                  {testResult}
                </p>
              )}
            </CardContent>
          </Card>

          {/* Section 2: Template Builder */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <Newspaper className="h-4 w-4 text-purple-500" /> Template Builder
              </CardTitle>
              <CardDescription className="text-xs">Build your newsletter block by block</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Header Block */}
              <div className="rounded-lg border p-3 space-y-2 bg-green-50 border-green-200">
                <p className="text-xs font-semibold text-green-700">Header Block</p>
                <div className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    id="show-logo"
                    checked={blocks.header.logo}
                    onChange={(e) => setBlocks((b) => ({ ...b, header: { ...b.header, logo: e.target.checked } }))}
                    className="rounded"
                  />
                  <Label htmlFor="show-logo" className="text-xs">Show Coritiba FC logo banner</Label>
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Header Title</Label>
                  <Input
                    value={blocks.header.title}
                    onChange={(e) => setBlocks((b) => ({ ...b, header: { ...b.header, title: e.target.value } }))}
                    placeholder="Header title text"
                  />
                </div>
              </div>

              {/* Intro Block */}
              <div className="rounded-lg border p-3 space-y-2">
                <p className="text-xs font-semibold text-slate-600">Intro Text Block</p>
                <Textarea
                  value={blocks.intro}
                  onChange={(e) => setBlocks((b) => ({ ...b, intro: e.target.value }))}
                  rows={2}
                  placeholder="Opening paragraph..."
                />
              </div>

              {/* News Items */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <p className="text-xs font-semibold text-slate-600">News Items ({blocks.newsItems.length}/3)</p>
                  {blocks.newsItems.length < 3 && (
                    <button
                      onClick={addNewsItem}
                      className="text-xs text-primary hover:underline flex items-center gap-1"
                    >
                      <Plus className="h-3 w-3" /> Add news item
                    </button>
                  )}
                </div>
                {blocks.newsItems.map((item, i) => (
                  <NewsItemEditor
                    key={i}
                    item={item}
                    index={i}
                    onChange={updateNewsItem}
                    onRemove={removeNewsItem}
                  />
                ))}
              </div>

              {/* CTA Block */}
              <div className="rounded-lg border p-3 space-y-2 bg-blue-50 border-blue-200">
                <p className="text-xs font-semibold text-blue-700">CTA Block</p>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label className="text-xs">Button Text</Label>
                    <Input
                      value={blocks.cta.text}
                      onChange={(e) => setBlocks((b) => ({ ...b, cta: { ...b.cta, text: e.target.value } }))}
                      placeholder="Ver propostas"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs">Button URL</Label>
                    <Input
                      value={blocks.cta.url}
                      onChange={(e) => setBlocks((b) => ({ ...b, cta: { ...b.cta, url: e.target.value } }))}
                      placeholder="https://..."
                    />
                  </div>
                </div>
              </div>

              <Button variant="outline" size="sm" onClick={() => setShowPreview((v) => !v)} className="gap-1.5">
                {showPreview ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
                {showPreview ? "Hide Preview" : "Preview HTML"}
              </Button>

              {showPreview && (
                <div className="rounded-lg border overflow-hidden">
                  <div className="bg-muted px-3 py-2 flex items-center justify-between">
                    <span className="text-xs font-medium">Email Preview</span>
                    <button
                      onClick={() => {
                        const w = window.open("", "_blank");
                        if (w) { w.document.write(previewHtml); w.document.close(); }
                      }}
                      className="text-xs text-primary hover:underline flex items-center gap-1"
                    >
                      <ExternalLink className="h-3 w-3" /> Open full preview
                    </button>
                  </div>
                  <iframe
                    srcDoc={previewHtml}
                    className="w-full h-[400px] border-0"
                    title="Newsletter preview"
                    sandbox="allow-same-origin"
                  />
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Right: Analytics + Unsubscribes */}
        <div className="space-y-6">
          {/* Analytics */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <BarChart3 className="h-4 w-4 text-amber-500" /> Newsletter Analytics
              </CardTitle>
            </CardHeader>
            <CardContent>
              {pastNewsletters.length === 0 ? (
                <p className="text-sm text-muted-foreground">No newsletters sent yet.</p>
              ) : (
                <div className="space-y-3">
                  {pastNewsletters.map((n) => (
                    <div key={n.id} className="rounded-lg border p-3 space-y-2">
                      <p className="text-xs font-semibold truncate" title={n.subject}>{n.subject}</p>
                      <div className="text-xs text-muted-foreground flex items-center gap-1">
                        <Clock className="h-3 w-3" /> {n.sent_at} · {n.recipient_count} recipients
                      </div>
                      <div className="grid grid-cols-3 gap-2 mt-1">
                        <div className="text-center rounded bg-green-50 p-1.5">
                          <p className="text-sm font-bold text-green-700">{n.open_rate}%</p>
                          <p className="text-[10px] text-muted-foreground">Open Rate</p>
                        </div>
                        <div className="text-center rounded bg-blue-50 p-1.5">
                          <p className="text-sm font-bold text-blue-700">{n.click_rate}%</p>
                          <p className="text-[10px] text-muted-foreground">Click Rate</p>
                        </div>
                        <div className="text-center rounded bg-red-50 p-1.5">
                          <p className="text-sm font-bold text-red-700">{n.unsubscribe_count}</p>
                          <p className="text-[10px] text-muted-foreground">Unsubs</p>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Unsubscribe management */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <Users className="h-4 w-4 text-red-500" /> Unsubscribes
              </CardTitle>
              <CardDescription className="text-xs">
                {mockUnsubscribes.length} contact{mockUnsubscribes.length !== 1 ? "s" : ""} unsubscribed
              </CardDescription>
            </CardHeader>
            <CardContent>
              {mockUnsubscribes.length === 0 ? (
                <p className="text-sm text-muted-foreground">No unsubscribes yet.</p>
              ) : (
                <div className="space-y-2">
                  {mockUnsubscribes.map((u, i) => (
                    <div key={i} className="rounded-md border p-2.5 space-y-1">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-medium truncate">{u.email}</span>
                        <Badge className="bg-red-100 text-red-700 border-red-200 text-[10px]">Unsubscribed</Badge>
                      </div>
                      <div className="flex items-center gap-2 text-xs text-muted-foreground">
                        <Clock className="h-3 w-3" /> {u.date}
                        {u.reason && <span>· {u.reason}</span>}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Quick link to main newsletter */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <Mail className="h-4 w-4 text-sky-500" /> Send Newsletter
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground mb-3">
                Compose and send a newsletter to your sponsor contacts.
              </p>
              <Button asChild variant="outline" size="sm" className="w-full gap-1.5">
                <a href="/newsletter">
                  <Newspaper className="h-3.5 w-3.5" /> Open Newsletter Composer
                </a>
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>
    </>
  );
}
