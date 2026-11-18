"use client";

import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { KeyRound } from "lucide-react";

export function ChangePasswordCard() {
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setMessage(null);
    setError(null);
    if (next !== confirm) {
      setError("New password and confirmation do not match");
      return;
    }
    if (next.length < 8) {
      setError("New password must be at least 8 characters");
      return;
    }
    setSaving(true);
    try {
      const res = await fetch("/api/auth/change-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ current_password: current, new_password: next }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(j?.error ?? `Update failed (${res.status})`);
        return;
      }
      setCurrent("");
      setNext("");
      setConfirm("");
      setMessage("Password updated. Other sessions were signed out.");
    } catch {
      setError("Update failed");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <KeyRound className="h-4 w-4 text-primary" />
          Change password
        </CardTitle>
        <CardDescription>
          Update the password for your login. Other signed-in devices will be signed out.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={save} className="space-y-3 text-sm">
          <div className="space-y-1.5">
            <Label htmlFor="current_password">Current password</Label>
            <Input
              id="current_password"
              type="password"
              autoComplete="current-password"
              value={current}
              onChange={(e) => setCurrent(e.target.value)}
              required
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="new_password">New password</Label>
            <Input
              id="new_password"
              type="password"
              autoComplete="new-password"
              value={next}
              onChange={(e) => setNext(e.target.value)}
              required
              minLength={8}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="confirm_password">Confirm new password</Label>
            <Input
              id="confirm_password"
              type="password"
              autoComplete="new-password"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              required
              minLength={8}
            />
          </div>
          {error && (
            <p role="alert" className="text-sm text-destructive bg-destructive/10 rounded-md p-2">
              {error}
            </p>
          )}
          {message && (
            <p className="text-sm text-emerald-700 bg-emerald-50 rounded-md p-2">{message}</p>
          )}
          <Button type="submit" size="sm" disabled={saving}>
            {saving ? "Updating…" : "Update password"}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
