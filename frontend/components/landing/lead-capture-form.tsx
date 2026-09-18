"use client";

import { useState } from "react";
import { Loader2, CheckCircle2 } from "lucide-react";

export function LeadCaptureForm({ niche, accentClassName }: { niche: string; accentClassName: string }) {
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    const form = new FormData(e.currentTarget);
    try {
      const res = await fetch("/api/leads", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          company_name: form.get("company_name"),
          contact_name: form.get("contact_name") || undefined,
          contact_email: form.get("contact_email"),
          contact_phone: form.get("contact_phone") || undefined,
          message: form.get("message") || undefined,
          niche,
          website_hp: form.get("website_hp") || undefined,
        }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        setError(j.error ?? "Something went wrong — please try again.");
        return;
      }
      setDone(true);
    } catch {
      setError("Network error — please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  if (done) {
    return (
      <div className="rounded-xl border bg-white p-6 text-center shadow-sm">
        <CheckCircle2 className="h-8 w-8 text-green-600 mx-auto mb-2" />
        <p className="font-semibold">Thanks — we got it.</p>
        <p className="text-sm text-muted-foreground mt-1">Someone from our team will reach out shortly.</p>
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} className="rounded-xl border bg-white p-6 shadow-sm space-y-3">
      <input type="text" name="website_hp" tabIndex={-1} autoComplete="off" className="hidden" aria-hidden="true" />
      <div>
        <label className="text-xs font-medium text-muted-foreground">Organization name</label>
        <input name="company_name" required maxLength={200} className="mt-1 w-full rounded-md border px-3 py-2 text-sm" />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="text-xs font-medium text-muted-foreground">Your name</label>
          <input name="contact_name" maxLength={200} className="mt-1 w-full rounded-md border px-3 py-2 text-sm" />
        </div>
        <div>
          <label className="text-xs font-medium text-muted-foreground">Phone (optional)</label>
          <input name="contact_phone" maxLength={50} className="mt-1 w-full rounded-md border px-3 py-2 text-sm" />
        </div>
      </div>
      <div>
        <label className="text-xs font-medium text-muted-foreground">Email</label>
        <input type="email" name="contact_email" required maxLength={200} className="mt-1 w-full rounded-md border px-3 py-2 text-sm" />
      </div>
      <div>
        <label className="text-xs font-medium text-muted-foreground">What are you looking for? (optional)</label>
        <textarea name="message" maxLength={2000} rows={3} className="mt-1 w-full rounded-md border px-3 py-2 text-sm" />
      </div>
      {error && <p className="text-xs text-red-600">{error}</p>}
      <button
        type="submit"
        disabled={submitting}
        className={`w-full rounded-md px-4 py-2.5 text-sm font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-60 flex items-center justify-center gap-2 ${accentClassName}`}
      >
        {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
        {submitting ? "Sending…" : "Get in touch"}
      </button>
    </form>
  );
}
