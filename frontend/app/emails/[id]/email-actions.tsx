"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import type { EmailRow } from "@/types/database";

export function EmailActions({ email }: { email: EmailRow }) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const isSent = email.status === "sent";

  async function call(mode: "draft" | "send") {
    setBusy(mode);
    setError(null);
    try {
      const res = await fetch(`/api/emails/${email.id}/send`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ mode }),
      });
      const j = await res.json();
      if (!res.ok) throw new Error(j?.error ?? `Failed (${res.status})`);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed");
    } finally {
      setBusy(null);
    }
  }

  async function followup() {
    setBusy("followup");
    setError(null);
    try {
      const res = await fetch(`/api/followups/generate`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email_id: email.id }),
      });
      const j = await res.json();
      if (!res.ok) throw new Error(j?.error ?? `Failed (${res.status})`);
      router.push(`/emails/${j.data.draft_email.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed");
    } finally {
      setBusy(null);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Actions</CardTitle>
        <CardDescription>{isSent ? "Email already sent." : "Approve to create a Gmail draft or send directly."}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-2">
        <Button onClick={() => call("draft")} disabled={!!busy || isSent} className="w-full">
          {busy === "draft" ? "Creating draft…" : "Approve & create Gmail draft"}
        </Button>
        <Button onClick={() => call("send")} disabled={!!busy || isSent} variant="destructive" className="w-full">
          {busy === "send" ? "Sending…" : "Approve & send now"}
        </Button>
        {isSent ? (
          <Button onClick={followup} disabled={!!busy} variant="outline" className="w-full">
            {busy === "followup" ? "Drafting follow-up…" : "Generate follow-up draft"}
          </Button>
        ) : null}
        {error ? <div className="text-sm text-destructive">{error}</div> : null}
        <p className="text-xs text-muted-foreground">
          Sending requires connecting Gmail in <a href="/settings" className="underline">Settings</a>.
        </p>
      </CardContent>
    </Card>
  );
}
