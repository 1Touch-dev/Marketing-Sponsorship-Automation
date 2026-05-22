"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toaster";
import { AlertTriangle, RefreshCw } from "lucide-react";
import type { EmailRow } from "@/types/database";

export function EmailActions({ email }: { email: EmailRow }) {
  const router = useRouter();
  const { toast } = useToast();
  const [busy, setBusy] = useState<string | null>(null);
  const [needsReconnect, setNeedsReconnect] = useState(false);

  const isSent = email.status === "sent";

  async function call(mode: "draft" | "send") {
    setBusy(mode);
    setNeedsReconnect(false);
    try {
      const res = await fetch(`/api/emails/${email.id}/send`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ mode }),
      });
      const j = await res.json();
      if (!res.ok) {
        if (j?.needs_reconnect) {
          setNeedsReconnect(true);
          throw new Error("Gmail token expired — reconnect required.");
        }
        throw new Error(j?.error ?? `Failed (${res.status})`);
      }
      toast({ variant: "success", title: mode === "send" ? "Email sent" : "Gmail draft created" });
      router.refresh();
    } catch (err) {
      toast({ variant: "destructive", title: mode === "send" ? "Send failed" : "Draft failed", description: err instanceof Error ? err.message : "Unknown error" });
    } finally {
      setBusy(null);
    }
  }

  async function followup() {
    setBusy("followup");
    try {
      const res = await fetch(`/api/followups/generate`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email_id: email.id }),
      });
      const j = await res.json();
      if (!res.ok) throw new Error(j?.error ?? `Failed (${res.status})`);
      toast({ variant: "success", title: "Follow-up draft created" });
      router.push(`/emails/${j.data.draft_email.id}`);
    } catch (err) {
      toast({ variant: "destructive", title: "Follow-up failed", description: err instanceof Error ? err.message : "Unknown error" });
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
        {needsReconnect && (
          <div className="rounded-lg bg-amber-50 border border-amber-200 p-3 flex items-start gap-2">
            <AlertTriangle className="h-4 w-4 text-amber-600 shrink-0 mt-0.5" />
            <div className="text-sm text-amber-800">
              <p className="font-medium">Gmail token expired</p>
              <p className="text-xs mt-0.5 text-amber-700">Your Gmail connection expired. Reconnect to send emails.</p>
              <a
                href="/api/auth/gmail"
                className="inline-flex items-center gap-1 mt-2 rounded-md bg-amber-600 hover:bg-amber-700 text-white px-3 py-1.5 text-xs font-medium"
              >
                <RefreshCw className="h-3 w-3" /> Reconnect Gmail
              </a>
            </div>
          </div>
        )}
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
        <p className="text-xs text-muted-foreground">
          Sending requires connecting Gmail in <a href="/settings" className="underline">Settings</a>.
        </p>
      </CardContent>
    </Card>
  );
}
