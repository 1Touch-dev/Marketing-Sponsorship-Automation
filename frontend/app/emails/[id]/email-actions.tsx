"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toaster";
import { CheckCircle2, ExternalLink, Send } from "lucide-react";
import type { EmailRow } from "@/types/database";

export function EmailActions({ email }: { email: EmailRow }) {
  const router = useRouter();
  const { toast } = useToast();
  const [busy, setBusy] = useState<string | null>(null);
  const [pipedriveId, setPipedriveId] = useState<number | null>(null);

  const isSent = email.status === "sent";
  const isApproved = email.status === "approved";

  async function call(mode: "draft" | "send") {
    setBusy(mode);
    try {
      const res = await fetch(`/api/emails/${email.id}/send`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ mode }),
      });
      const j = await res.json();
      if (!res.ok) {
        throw new Error(j?.error ?? `Failed (${res.status})`);
      }
      if (j.pipedrive_activity_id) setPipedriveId(j.pipedrive_activity_id);
      if (j.pipedrive_warning) {
        toast({ variant: "destructive", title: "Pipedrive warning", description: j.pipedrive_warning });
      } else {
        toast({
          variant: "success",
          title: mode === "send" ? "Email logged as sent in Pipedrive" : "Email approved & logged to Pipedrive",
        });
      }
      router.refresh();
    } catch (err) {
      toast({
        variant: "destructive",
        title: mode === "send" ? "Send failed" : "Approval failed",
        description: err instanceof Error ? err.message : "Unknown error",
      });
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
      toast({
        variant: "destructive",
        title: "Follow-up failed",
        description: err instanceof Error ? err.message : "Unknown error",
      });
    } finally {
      setBusy(null);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Actions</CardTitle>
        <CardDescription>
          {isSent
            ? "Email has been sent and logged to Pipedrive."
            : isApproved
            ? "Email is approved. Send when ready."
            : "Approve to log this email activity in Pipedrive."}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {(pipedriveId ?? (email.metadata as Record<string, unknown>)?.pipedrive_activity_id) ? (
          <div className="rounded-lg bg-green-50 border border-green-200 p-3 flex items-center gap-2">
            <CheckCircle2 className="h-4 w-4 text-green-600 shrink-0" />
            <div className="text-sm text-green-800">
              <p className="font-medium">Logged in Pipedrive</p>
              <p className="text-xs text-green-700">
                Activity #{String(pipedriveId ?? (email.metadata as Record<string, unknown>)?.pipedrive_activity_id ?? "")} created
              </p>
            </div>
            <a
              href="https://app.pipedrive.com"
              target="_blank"
              rel="noreferrer"
              className="ml-auto text-green-600 hover:text-green-800"
            >
              <ExternalLink className="h-3.5 w-3.5" />
            </a>
          </div>
        ) : null}

        <Button
          onClick={() => call("draft")}
          disabled={!!busy || isSent}
          variant="outline"
          className="w-full"
        >
          {busy === "draft" ? "Approving…" : "Approve & log to Pipedrive"}
        </Button>
        <Button
          onClick={() => call("send")}
          disabled={!!busy || isSent}
          className="w-full"
        >
          <Send className="h-4 w-4 mr-2" />
          {busy === "send" ? "Sending…" : "Mark as Sent in Pipedrive"}
        </Button>

        {(isSent || isApproved) ? (
          <Button onClick={followup} disabled={!!busy} variant="outline" className="w-full">
            {busy === "followup" ? "Drafting follow-up…" : "Generate follow-up draft"}
          </Button>
        ) : null}
      </CardContent>
    </Card>
  );
}
