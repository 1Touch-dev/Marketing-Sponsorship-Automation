"use client";
import { useState, useEffect } from "react";
import React from "react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toaster";
import { useRouter } from "next/navigation";
import { Plus, Trash2, Star, User } from "lucide-react";

type Profile = { id: string; full_name: string; title: string | null; email: string; phone: string | null; linkedin_url: string | null; html_signature: string | null; is_default: boolean };

export function SenderProfilesClient({ initialProfiles }: { initialProfiles: Profile[] }) {
  const [profiles, setProfiles] = useState(initialProfiles);
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({ full_name: "", title: "", email: "", phone: "", linkedin_url: "", html_signature: "", is_default: false });
  const { toast } = useToast();
  const router = useRouter();

  useEffect(() => { setProfiles(initialProfiles); }, [initialProfiles]);

  async function handleAdd() {
    if (!form.full_name || !form.email) { toast({ variant: "destructive", title: "Name and email are required" }); return; }
    setSaving(true);
    try {
      const res = await fetch("/api/sender-profiles", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(form) });
      if (res.ok) {
        const created = await res.json() as { data?: Profile };
        if (created?.data) setProfiles(prev => [...prev, created.data!]);
        toast({ title: "✓ Sender profile added" });
        setShowForm(false);
        setForm({ full_name: "", title: "", email: "", phone: "", linkedin_url: "", html_signature: "", is_default: false });
        router.refresh();
      } else { const d = await res.json() as { error?: string }; toast({ variant: "destructive", title: d.error ?? "Failed" }); }
    } finally { setSaving(false); }
  }

  return (
    <div className="space-y-4 max-w-2xl">
      <div className="space-y-2">
        {profiles.length === 0 && !showForm && (
          <div className="rounded-xl border bg-card p-8 text-center">
            <User className="h-10 w-10 text-muted-foreground mx-auto mb-3" />
            <p className="text-sm text-muted-foreground">No sender profiles yet. Add team members who send outreach emails.</p>
          </div>
        )}
        {profiles.map(p => (
          <div key={p.id} className="rounded-lg border bg-card p-4 flex items-center justify-between">
            <div>
              <div className="font-medium flex items-center gap-2">{p.full_name} {p.is_default && <Star className="h-3.5 w-3.5 text-amber-500 fill-amber-500" />}</div>
              <div className="text-xs text-muted-foreground">{p.title ?? ""} · {p.email}{p.phone ? ` · ${p.phone}` : ""}</div>
            </div>
            <div className="flex items-center gap-2">
              {!p.is_default && <Button variant="ghost" size="sm" className="text-xs">Set Default</Button>}
              <Button variant="ghost" size="sm" className="text-destructive hover:text-destructive"><Trash2 className="h-4 w-4" /></Button>
            </div>
          </div>
        ))}
      </div>
      {showForm ? (
        <div className="rounded-xl border bg-card p-4 space-y-3">
          <div className="text-sm font-semibold">Add Sender Profile</div>
          <div className="grid grid-cols-2 gap-3">
            {([["full_name","Full Name *"],["title","Job Title"],["email","Email Address *"],["phone","Phone / WhatsApp"],["linkedin_url","LinkedIn URL"]] as [string, string][]).map(([k,l]) => (
              <div key={k}>
                <label className="text-xs font-medium block mb-1">{l}</label>
                <input className="w-full border rounded-md px-3 py-1.5 text-sm" value={(form as unknown as Record<string,string>)[k]} onChange={e => setForm(f => ({...f,[k]:e.target.value}))} />
              </div>
            ))}
          </div>
          <div>
            <label className="text-xs font-medium block mb-1">HTML Signature (optional)</label>
            <textarea className="w-full border rounded-md px-3 py-1.5 text-sm font-mono" rows={3} value={form.html_signature} onChange={e => setForm(f => ({...f,html_signature:e.target.value}))} placeholder="<p>Best regards,<br/><strong>{{name}}</strong></p>" />
          </div>
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={form.is_default} onChange={e => setForm(f => ({...f,is_default:e.target.checked}))} /> Set as default sender</label>
          <div className="flex gap-2">
            <Button onClick={handleAdd} disabled={saving} size="sm">Save Profile</Button>
            <Button variant="outline" onClick={() => setShowForm(false)} size="sm">Cancel</Button>
          </div>
        </div>
      ) : (
        <Button onClick={() => setShowForm(true)} size="sm" className="gap-1.5"><Plus className="h-4 w-4" /> Add Sender Profile</Button>
      )}
    </div>
  );
}
