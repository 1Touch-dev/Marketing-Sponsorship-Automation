"use client";

import * as React from "react";
import { roleLabel, roleColor, type PlatformUser, type UserRole } from "@/lib/auth/roles";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useRouter } from "next/navigation";

const ROLES: UserRole[] = ["admin", "sales_rep", "approver", "viewer"];

export default function UsersManager({ initialUsers }: { initialUsers: PlatformUser[] }) {
  const [users, setUsers] = React.useState<PlatformUser[]>(initialUsers);
  const [showInvite, setShowInvite] = React.useState(false);
  const [inviteEmail, setInviteEmail] = React.useState("");
  const [inviteName, setInviteName] = React.useState("");
  const [inviteRole, setInviteRole] = React.useState<UserRole>("sales_rep");
  const [saving, setSaving] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const router = useRouter();

  async function inviteUser() {
    if (!inviteEmail || !inviteName) { setError("Name and email are required"); return; }
    setSaving(true); setError(null);
    try {
      const res = await fetch("/api/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: inviteEmail, full_name: inviteName, role: inviteRole }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error ?? "Failed to invite"); return; }
      setUsers((u) => [...u, data.user]);
      setInviteEmail(""); setInviteName(""); setShowInvite(false);
      router.refresh();
    } finally {
      setSaving(false);
    }
  }

  async function changeRole(id: string, role: UserRole) {
    const res = await fetch(`/api/users/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ role }),
    });
    if (res.ok) {
      const data = await res.json();
      setUsers((u) => u.map((usr) => usr.id === id ? data.user : usr));
    }
  }

  async function toggleActive(id: string, current: boolean) {
    const res = await fetch(`/api/users/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ is_active: !current }),
    });
    if (res.ok) {
      setUsers((u) => u.map((usr) => usr.id === id ? { ...usr, is_active: !current } : usr));
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-base font-semibold">
          Team Members <span className="text-muted-foreground font-normal text-sm ml-1">({users.length})</span>
        </h2>
        <Button size="sm" onClick={() => setShowInvite((v) => !v)}>
          {showInvite ? "Cancel" : "+ Invite user"}
        </Button>
      </div>

      {showInvite && (
        <div className="rounded-xl border bg-muted/20 p-4 space-y-3">
          <h3 className="text-sm font-medium">Invite a new team member</h3>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <Input
              placeholder="Full name"
              value={inviteName}
              onChange={(e) => setInviteName(e.target.value)}
            />
            <Input
              type="email"
              placeholder="Email address"
              value={inviteEmail}
              onChange={(e) => setInviteEmail(e.target.value)}
            />
            <select
              value={inviteRole}
              onChange={(e) => setInviteRole(e.target.value as UserRole)}
              className="h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm"
            >
              {ROLES.map((r) => (
                <option key={r} value={r}>{roleLabel(r)}</option>
              ))}
            </select>
          </div>
          {error && <p className="text-xs text-destructive">{error}</p>}
          <div className="flex gap-2">
            <Button size="sm" onClick={inviteUser} disabled={saving}>
              {saving ? "Inviting…" : "Send invite"}
            </Button>
            <Button size="sm" variant="outline" onClick={() => { setShowInvite(false); setError(null); }}>
              Cancel
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">
            The user will appear in the team list immediately. Full email-based login will be enabled once Supabase Auth is wired up.
          </p>
        </div>
      )}

      <div className="rounded-xl border overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-muted/40 border-b">
            <tr>
              <th className="text-left py-2.5 px-4 font-medium text-muted-foreground">Name</th>
              <th className="text-left py-2.5 px-4 font-medium text-muted-foreground">Email</th>
              <th className="text-left py-2.5 px-4 font-medium text-muted-foreground">Role</th>
              <th className="text-left py-2.5 px-4 font-medium text-muted-foreground">Status</th>
              <th className="text-left py-2.5 px-4 font-medium text-muted-foreground">Last seen</th>
              <th className="py-2.5 px-4" />
            </tr>
          </thead>
          <tbody className="divide-y">
            {users.length === 0 ? (
              <tr>
                <td colSpan={6} className="py-8 text-center text-muted-foreground text-sm">
                  No users yet. Run migration 0016 first, then invite your team.
                </td>
              </tr>
            ) : (
              users.map((u) => (
                <tr key={u.id} className={`hover:bg-muted/20 ${!u.is_active ? "opacity-50" : ""}`}>
                  <td className="py-2.5 px-4 font-medium">{u.full_name}</td>
                  <td className="py-2.5 px-4 text-muted-foreground">{u.email}</td>
                  <td className="py-2.5 px-4">
                    <select
                      value={u.role}
                      onChange={(e) => changeRole(u.id, e.target.value as UserRole)}
                      className={`text-xs font-medium rounded-full px-2.5 py-1 border-0 cursor-pointer ${roleColor(u.role)}`}
                    >
                      {ROLES.map((r) => (
                        <option key={r} value={r}>{roleLabel(r)}</option>
                      ))}
                    </select>
                  </td>
                  <td className="py-2.5 px-4">
                    <span className={`text-xs font-medium ${u.is_active ? "text-green-700" : "text-muted-foreground"}`}>
                      {u.is_active ? "Active" : "Deactivated"}
                    </span>
                  </td>
                  <td className="py-2.5 px-4 text-muted-foreground text-xs">
                    {u.last_seen_at
                      ? new Date(u.last_seen_at).toLocaleDateString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })
                      : "Never"}
                  </td>
                  <td className="py-2.5 px-4 text-right">
                    <button
                      onClick={() => toggleActive(u.id, u.is_active)}
                      className="text-xs text-muted-foreground hover:text-foreground underline underline-offset-2"
                    >
                      {u.is_active ? "Deactivate" : "Reactivate"}
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <p className="text-xs text-muted-foreground">
        Role changes take effect immediately. Admin is the only role that can access this page and manage Pipedrive settings.
      </p>
    </div>
  );
}
