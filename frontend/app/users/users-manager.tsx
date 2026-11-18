"use client";

import * as React from "react";
import { roleLabel, roleColor, type PlatformUser, type UserRole } from "@/lib/auth/roles";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { EmptyState } from "@/components/shared/empty-state";
import { useRouter } from "next/navigation";

const ROLES: UserRole[] = ["admin", "sales_rep", "approver", "viewer"];

export default function UsersManager({
  initialUsers,
  loadError = null,
}: {
  initialUsers: PlatformUser[];
  loadError?: string | null;
}) {
  const [users, setUsers] = React.useState<PlatformUser[]>(initialUsers);
  const [showInvite, setShowInvite] = React.useState(false);
  const [inviteEmail, setInviteEmail] = React.useState("");
  const [inviteName, setInviteName] = React.useState("");
  const [inviteRole, setInviteRole] = React.useState<UserRole>("sales_rep");
  const [saving, setSaving] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [rowBusy, setRowBusy] = React.useState<string | null>(null);
  const [toast, setToast] = React.useState<string | null>(null);
  const router = useRouter();

  React.useEffect(() => {
    setUsers(initialUsers);
  }, [initialUsers]);

  async function inviteUser() {
    if (!inviteEmail || !inviteName) {
      setError("Name and email are required");
      return;
    }
    setSaving(true);
    setError(null);
    setToast(null);
    try {
      const res = await fetch("/api/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: inviteEmail, full_name: inviteName, role: inviteRole }),
      });
      const data = await res.json();
      if (res.status === 502 && data.user) {
        setUsers((u) => [...u, data.user]);
        setError(data.error ?? "Invite email failed — use Resend invite");
        setInviteEmail("");
        setInviteName("");
        setShowInvite(false);
        router.refresh();
        return;
      }
      if (!res.ok) {
        setError(data.error ?? "Failed to invite");
        return;
      }
      setUsers((u) => [...u, data.user]);
      setInviteEmail("");
      setInviteName("");
      setShowInvite(false);
      setToast("Invite sent — they will receive a set-password link by email");
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
      setUsers((u) =>
        u.map((usr) =>
          usr.id === id ? { ...data.user, has_auth_user: usr.has_auth_user } : usr,
        ),
      );
    }
  }

  async function toggleActive(id: string, current: boolean) {
    const res = await fetch(`/api/users/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ is_active: !current }),
    });
    if (res.ok) {
      const data = await res.json();
      setUsers((u) =>
        u.map((usr) =>
          usr.id === id
            ? { ...data.user, has_auth_user: usr.has_auth_user, is_active: !current }
            : usr,
        ),
      );
    }
  }

  async function resendInvite(id: string) {
    setRowBusy(id);
    setToast(null);
    setError(null);
    try {
      const res = await fetch(`/api/users/${id}/resend-invite`, { method: "POST" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error ?? "Resend invite failed");
        return;
      }
      setUsers((u) => u.map((usr) => (usr.id === id ? { ...usr, has_auth_user: true } : usr)));
      setToast("Invite email sent");
      router.refresh();
    } finally {
      setRowBusy(null);
    }
  }

  async function sendReset(id: string) {
    setRowBusy(id);
    setToast(null);
    setError(null);
    try {
      const res = await fetch(`/api/users/${id}/send-reset`, { method: "POST" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error ?? "Send reset link failed");
        return;
      }
      setToast("Reset link sent by email");
    } finally {
      setRowBusy(null);
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

      {toast && (
        <p className="text-sm text-emerald-700 bg-emerald-50 rounded-md px-3 py-2">{toast}</p>
      )}
      {error && !showInvite && (
        <p className="text-sm text-destructive bg-destructive/10 rounded-md px-3 py-2">{error}</p>
      )}

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
                <option key={r} value={r}>
                  {roleLabel(r)}
                </option>
              ))}
            </select>
          </div>
          {error && <p className="text-xs text-destructive">{error}</p>}
          <div className="flex gap-2">
            <Button size="sm" onClick={inviteUser} disabled={saving}>
              {saving ? "Inviting…" : "Send invite"}
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => {
                setShowInvite(false);
                setError(null);
              }}
            >
              Cancel
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">
            Creates their login and emails a set-password link (Portuguese then English). The link
            is valid for 1 hour and single-use. No password is shown or emailed.
          </p>
        </div>
      )}

      <div className="rounded-xl border overflow-hidden">
        <table className="w-full text-sm">
          <caption className="text-left text-sm font-medium px-4 py-2">Login accounts</caption>
          <thead className="bg-muted/40 border-b">
            <tr>
              <th scope="col" className="text-left py-2.5 px-4 font-medium text-muted-foreground">
                Name
              </th>
              <th scope="col" className="text-left py-2.5 px-4 font-medium text-muted-foreground">
                Email
              </th>
              <th scope="col" className="text-left py-2.5 px-4 font-medium text-muted-foreground">
                Role
              </th>
              <th scope="col" className="text-left py-2.5 px-4 font-medium text-muted-foreground">
                Status
              </th>
              <th scope="col" className="text-left py-2.5 px-4 font-medium text-muted-foreground">
                Last seen
              </th>
              <th scope="col" className="py-2.5 px-4">
                <span className="sr-only">Actions</span>
              </th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {loadError ? (
              <tr>
                <td colSpan={6} className="p-4">
                  <EmptyState
                    role="alert"
                    title="Couldn't load login accounts"
                    description={loadError}
                  />
                </td>
              </tr>
            ) : users.length === 0 ? (
              <tr>
                <td colSpan={6} className="py-8 text-center text-muted-foreground text-sm">
                  No users yet. Invite your team to send a set-password email.
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
                        <option key={r} value={r}>
                          {roleLabel(r)}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td className="py-2.5 px-4">
                    <span
                      className={`text-xs font-medium ${u.is_active ? "text-green-700" : "text-muted-foreground"}`}
                    >
                      {u.is_active ? "Active" : "Deactivated"}
                    </span>
                    {u.has_auth_user === false && (
                      <span className="block text-[10px] text-amber-700 mt-0.5">No login yet</span>
                    )}
                  </td>
                  <td className="py-2.5 px-4 text-muted-foreground text-xs">
                    {u.last_seen_at
                      ? new Date(u.last_seen_at).toLocaleDateString("en-GB", {
                          day: "numeric",
                          month: "short",
                          hour: "2-digit",
                          minute: "2-digit",
                        })
                      : "Never"}
                  </td>
                  <td className="py-2.5 px-4 text-right space-x-2 whitespace-nowrap">
                    {u.has_auth_user ? (
                      <button
                        type="button"
                        disabled={rowBusy === u.id}
                        onClick={() => sendReset(u.id)}
                        className="text-xs text-muted-foreground hover:text-foreground underline underline-offset-2 disabled:opacity-50"
                      >
                        {rowBusy === u.id ? "Sending…" : "Send reset link"}
                      </button>
                    ) : (
                      <button
                        type="button"
                        disabled={rowBusy === u.id}
                        onClick={() => resendInvite(u.id)}
                        className="text-xs text-muted-foreground hover:text-foreground underline underline-offset-2 disabled:opacity-50"
                      >
                        {rowBusy === u.id ? "Sending…" : "Resend invite"}
                      </button>
                    )}
                    <button
                      type="button"
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
        Role changes take effect immediately. Only admins can invite users or send password links.
      </p>
    </div>
  );
}
