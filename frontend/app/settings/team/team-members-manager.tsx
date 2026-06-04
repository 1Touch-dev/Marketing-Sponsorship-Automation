"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/components/ui/toaster";
import { Users, Plus, Pencil, Trash2, Star, StarOff, X, Mail, Phone, CheckCircle2 } from "lucide-react";

type Member = Record<string, unknown>;

function MemberForm({
  initialData,
  onSaved,
  onCancel,
}: {
  initialData?: Member;
  onSaved: (m: Member) => void;
  onCancel: () => void;
}) {
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const isEdit = !!initialData?.id;

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    const fd = new FormData(e.currentTarget);
    const payload = {
      full_name: String(fd.get("full_name") ?? "").trim(),
      title: String(fd.get("title") ?? "").trim() || null,
      email: String(fd.get("email") ?? "").trim(),
      phone: String(fd.get("phone") ?? "").trim() || null,
      bio: String(fd.get("bio") ?? "").trim() || null,
      signature: String(fd.get("signature") ?? "").trim() || null,
      default_sender: fd.get("default_sender") === "on",
      active: fd.get("active") !== "off",
    };
    try {
      const url = isEdit ? `/api/team-members/${String(initialData!.id)}` : "/api/team-members";
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
        <h3 className="text-sm font-semibold text-slate-700">{isEdit ? "Edit Team Member" : "Add Team Member"}</h3>
        <button type="button" onClick={onCancel} className="text-slate-400 hover:text-slate-600">
          <X className="h-4 w-4" />
        </button>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label htmlFor="full_name" className="text-xs">Full Name *</Label>
          <Input id="full_name" name="full_name" required defaultValue={initialData?.full_name as string} placeholder="Ana Oliveira" />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="title" className="text-xs">Title / Role</Label>
          <Input id="title" name="title" defaultValue={initialData?.title as string} placeholder="Gerente de Patrocínios" />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="email" className="text-xs">Email *</Label>
          <Input id="email" name="email" type="email" required defaultValue={initialData?.email as string} placeholder="ana@coritiba.com.br" />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="phone" className="text-xs">Phone</Label>
          <Input id="phone" name="phone" defaultValue={initialData?.phone as string} placeholder="+55 41 99999-9999" />
        </div>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="bio" className="text-xs">Bio (used in proposals)</Label>
        <Textarea id="bio" name="bio" rows={2} defaultValue={initialData?.bio as string} placeholder="Breve apresentação..." />
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="signature" className="text-xs">Email Signature HTML</Label>
        <Textarea id="signature" name="signature" rows={3} defaultValue={initialData?.signature as string} placeholder="<p>Ana Oliveira | Gerente de Patrocínios | Coritiba FC</p>" />
      </div>

      <div className="flex items-center gap-4">
        <label className="flex items-center gap-2 text-sm cursor-pointer">
          <input type="checkbox" name="default_sender" defaultChecked={initialData?.default_sender as boolean} className="rounded" />
          <Star className="h-3.5 w-3.5 text-amber-500" />
          Default sender
        </label>
        <label className="flex items-center gap-2 text-sm cursor-pointer">
          <input type="checkbox" name="active" defaultChecked={initialData?.active !== false} className="rounded" />
          Active
        </label>
      </div>

      {error && <div className="text-sm text-destructive bg-destructive/10 rounded-md p-2">{error}</div>}

      <div className="flex gap-2">
        <Button type="submit" disabled={saving} size="sm">
          {saving ? "Saving…" : isEdit ? "Save Changes" : "Add Member"}
        </Button>
        <Button type="button" variant="outline" size="sm" onClick={onCancel}>Cancel</Button>
      </div>
    </form>
  );
}

export function TeamMembersManager({ initialMembers }: { initialMembers: Member[] }) {
  const router = useRouter();
  const { toast } = useToast();
  const [members, setMembers] = useState<Member[]>(initialMembers);
  const [showForm, setShowForm] = useState(false);
  const [editMember, setEditMember] = useState<Member | null>(null);

  function handleSaved(saved: Member) {
    setMembers(prev => {
      const idx = prev.findIndex(m => m.id === saved.id);
      if (idx >= 0) {
        const next = [...prev];
        next[idx] = saved;
        return next;
      }
      // Re-sort: default sender first
      const next = [saved, ...prev];
      return next.sort((a, b) => (b.default_sender ? 1 : 0) - (a.default_sender ? 1 : 0));
    });
    setShowForm(false);
    setEditMember(null);
    toast({ variant: "success", title: editMember ? "Member updated" : "Member added" });
    router.refresh();
  }

  async function handleDelete(id: string) {
    if (!confirm("Delete this team member?")) return;
    try {
      const res = await fetch(`/api/team-members/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error("Delete failed");
      setMembers(prev => prev.filter(m => m.id !== id));
      toast({ variant: "success", title: "Member deleted" });
    } catch {
      toast({ variant: "destructive", title: "Delete failed" });
    }
  }

  async function toggleDefault(member: Member) {
    const newVal = !member.default_sender;
    try {
      const res = await fetch(`/api/team-members/${String(member.id)}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ default_sender: newVal }),
      });
      if (!res.ok) throw new Error("Update failed");
      const { data } = await res.json();
      // Update all members (since only one can be default)
      if (newVal) {
        setMembers(prev => prev.map(m => ({ ...m, default_sender: m.id === member.id })));
      } else {
        setMembers(prev => prev.map(m => m.id === member.id ? data : m));
      }
      toast({ variant: "success", title: newVal ? "Set as default sender" : "Removed as default sender" });
    } catch {
      toast({ variant: "destructive", title: "Update failed" });
    }
  }

  return (
    <div className="space-y-6">
      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        {[
          { label: "Total Members", value: members.length, color: "bg-blue-50 text-blue-700" },
          { label: "Active", value: members.filter(m => m.active !== false).length, color: "bg-green-50 text-green-700" },
          { label: "Default Sender", value: members.find(m => m.default_sender)?.full_name as string ?? "—", color: "bg-amber-50 text-amber-700", text: true },
        ].map(({ label, value, color, text }) => (
          <div key={label} className={`rounded-lg border p-3 ${color}`}>
            <div className="flex items-center gap-1.5 text-xs opacity-70 mb-1"><Users className="h-3 w-3" />{label}</div>
            <p className={text ? "text-sm font-semibold truncate" : "text-2xl font-bold"}>{value}</p>
          </div>
        ))}
      </div>

      {/* Header */}
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-slate-700 flex items-center gap-2">
          <Users className="h-4 w-4" /> Team Members ({members.length})
        </h2>
        <Button size="sm" onClick={() => { setEditMember(null); setShowForm(true); }} className="gap-1.5">
          <Plus className="h-4 w-4" /> Add Member
        </Button>
      </div>

      {/* Form */}
      {(showForm || editMember) && (
        <MemberForm
          initialData={editMember ?? undefined}
          onSaved={handleSaved}
          onCancel={() => { setShowForm(false); setEditMember(null); }}
        />
      )}

      {/* List */}
      <div className="space-y-3">
        {members.length === 0 && (
          <div className="rounded-xl border-2 border-dashed border-slate-200 p-8 text-center">
            <Users className="h-8 w-8 text-slate-300 mx-auto mb-3" />
            <p className="text-sm text-slate-500">No team members yet.</p>
            <button onClick={() => setShowForm(true)} className="mt-2 text-xs text-primary hover:underline">Add first member</button>
          </div>
        )}
        {members.map(member => (
          <div key={member.id as string} className="rounded-xl border bg-white p-4 flex items-start gap-4">
            <div className="flex-shrink-0 w-10 h-10 rounded-full bg-slate-100 flex items-center justify-center text-slate-600 font-semibold text-sm">
              {(member.full_name as string).charAt(0).toUpperCase()}
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <p className="text-sm font-semibold">{member.full_name as string}</p>
                {!!member.default_sender && (
                  <Badge className="text-xs bg-amber-50 text-amber-700 border-amber-200 gap-1">
                    <Star className="h-2.5 w-2.5" /> Default Sender
                  </Badge>
                )}
                {member.active === false && (
                  <Badge variant="outline" className="text-xs text-slate-400">Inactive</Badge>
                )}
              </div>
              {!!member.title && <p className="text-xs text-muted-foreground mt-0.5">{member.title as string}</p>}
              <div className="flex items-center gap-3 mt-1.5">
                {!!member.email && (
                  <span className="flex items-center gap-1 text-xs text-muted-foreground">
                    <Mail className="h-3 w-3" /> {member.email as string}
                  </span>
                )}
                {!!member.phone && (
                  <span className="flex items-center gap-1 text-xs text-muted-foreground">
                    <Phone className="h-3 w-3" /> {member.phone as string}
                  </span>
                )}
              </div>
              {!!member.bio && (
                <p className="text-xs text-muted-foreground mt-1 line-clamp-1">{member.bio as string}</p>
              )}
            </div>
            <div className="flex items-center gap-1.5 shrink-0">
              <button
                onClick={() => toggleDefault(member)}
                className={`p-1.5 rounded-md transition-colors ${member.default_sender ? "text-amber-500 hover:bg-amber-50" : "text-slate-300 hover:text-amber-400 hover:bg-amber-50"}`}
                title={member.default_sender ? "Remove as default" : "Set as default sender"}
              >
                {member.default_sender ? <Star className="h-4 w-4 fill-current" /> : <StarOff className="h-4 w-4" />}
              </button>
              <button
                onClick={() => { setEditMember(member); setShowForm(false); }}
                className="p-1.5 rounded-md text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors"
              >
                <Pencil className="h-3.5 w-3.5" />
              </button>
              <button
                onClick={() => handleDelete(member.id as string)}
                className="p-1.5 rounded-md text-slate-300 hover:text-red-500 hover:bg-red-50 transition-colors"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>
        ))}
      </div>

      {members.length > 0 && (
        <div className="rounded-lg bg-muted/40 border p-3 text-xs text-muted-foreground flex items-start gap-2">
          <CheckCircle2 className="h-3.5 w-3.5 shrink-0 mt-0.5 text-green-600" />
          <span>The <strong>default sender</strong> is automatically used for all outreach emails generated by the Outreach Agent and the email generator. You can override it per-email on approval.</span>
        </div>
      )}
    </div>
  );
}
