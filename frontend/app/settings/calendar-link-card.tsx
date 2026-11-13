"use client";

import { useEffect, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Calendar } from "lucide-react";

export function CalendarLinkCard() {
  const [value, setValue] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/users/me");
        const j = await res.json().catch(() => ({}));
        if (cancelled) return;
        if (!res.ok) {
          setError(j?.error ?? "Could not load your profile");
          return;
        }
        const url = (j?.user?.calendar_url as string | null | undefined) ?? "";
        setValue(typeof url === "string" ? url : "");
      } catch {
        if (!cancelled) setError("Could not load your profile");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  async function save() {
    setSaving(true);
    setMessage(null);
    setError(null);
    try {
      const res = await fetch("/api/users/me", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ calendar_url: value.trim() || null }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(j?.error ?? j?.issues?.[0]?.message ?? `Save failed (${res.status})`);
        return;
      }
      const saved = (j?.user?.calendar_url as string | null | undefined) ?? "";
      setValue(typeof saved === "string" ? saved : "");
      setMessage(saved ? "Calendar link saved. New proposals will prefill this URL." : "Calendar link cleared.");
    } catch {
      setError("Save failed");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Calendar className="h-4 w-4 text-primary" />
          My calendar link
        </CardTitle>
        <CardDescription>
          Your Calendly or Cal.com URL. New proposals prefill this as the meeting link;
          leave a proposal blank to fall back to mailto on the public page.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3 text-sm">
        {loading ? (
          <p className="text-muted-foreground">Loading…</p>
        ) : (
          <>
            <Input
              type="url"
              placeholder="https://calendly.com/you or https://cal.com/you"
              value={value}
              onChange={(e) => setValue(e.target.value)}
              disabled={saving}
            />
            <div className="flex items-center gap-2">
              <Button type="button" size="sm" onClick={() => void save()} disabled={saving}>
                {saving ? "Saving…" : "Save"}
              </Button>
              {message && <span className="text-xs text-emerald-700">{message}</span>}
              {error && <span className="text-xs text-red-600">{error}</span>}
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
