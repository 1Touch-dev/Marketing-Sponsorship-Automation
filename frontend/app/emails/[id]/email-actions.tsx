"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toaster";
import { CheckCircle2, ExternalLink, Send, FlaskConical, AlertTriangle, X } from "lucide-react";
import type { EmailRow } from "@/types/database";

// Patterns that indicate unresolved template placeholders
const PLACEHOLDER_PATTERNS = [
  /\[Nome\]/i,
  /\[Empresa\]/i,
  /\{\{contact_name\}\}/i,
  /\{\{company_name\}\}/i,
];

function detectUnresolvedPlaceholders(subject?: string | null, body?: string | null): string[] {
  const found: string[] = [];
  const content = `${subject ?? ""} ${body ?? ""}`;
  for (const pattern of PLACEHOLDER_PATTERNS) {
    const match = content.match(pattern);
    if (match) found.push(match[0]);
  }
  return found;
}

export function EmailActions({ email }: { email: EmailRow }) {
  const router = useRouter();
  const { toast } = useToast();
  const [busy, setBusy] = useState<string | null>(null);
  const [pipedriveId, setPipedriveId] = useState<number | null>(null);

  // Pre-send validation dialog state
  const [showPlaceholderWarning, setShowPlaceholderWarning] = useState(false);
  const [pendingMode, setPendingMode] = useState<"draft" | "send" | null>(null);
  const [unresolvedPlaceholders, setUnresolvedPlaceholders] = useState<string[]>([]);

  // Test send dialog state
  const [showTestDialog, setShowTestDialog] = useState(false);
  const [testEmail, setTestEmail] = useState("");

  const isSent = email.status === "sent";
  const isApproved = email.status === "approved";

  // Inbound messages (Phase 2 reply capture) are read-only here — approve/
  // send/follow-up actions only make sense for our own outbound emails.
  if (email.direction === "inbound") {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Actions</CardTitle>
          <CardDescription>Inbound message — no actions available.</CardDescription>
        </CardHeader>
      </Card>
    );
  }

  async function call(mode: "draft" | "send", skipValidation = false) {
    // Pre-send validation
    if (!skipValidation) {
      const found = detectUnresolvedPlaceholders(email.subject, email.body_html ?? email.body_text);
      if (found.length > 0) {
        setUnresolvedPlaceholders(found);
        setPendingMode(mode);
        setShowPlaceholderWarning(true);
        return;
      }
    }

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

  async function sendTestEmail() {
    if (!testEmail.trim()) return;
    setBusy("test");
    try {
      const res = await fetch(`/api/emails/${email.id}/send`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ mode: "send", test_only: true, test_recipient: testEmail.trim() }),
      });
      const j = await res.json();
      if (!res.ok) throw new Error(j?.error ?? `Failed (${res.status})`);
      toast({ variant: "success", title: "Test email sent", description: `Sent to ${testEmail}` });
      setShowTestDialog(false);
    } catch (err) {
      toast({
        variant: "destructive",
        title: "Test send failed",
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
    <>
      {/* Unresolved placeholder warning dialog */}
      {showPlaceholderWarning && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
          <div className="w-full max-w-sm bg-white dark:bg-slate-900 rounded-2xl shadow-2xl p-6 space-y-4">
            <div className="flex items-start gap-3">
              <div className="h-9 w-9 rounded-lg bg-amber-100 dark:bg-amber-900/40 flex items-center justify-center shrink-0">
                <AlertTriangle className="h-5 w-5 text-amber-600" />
              </div>
              <div>
                <h3 className="font-semibold text-slate-800 dark:text-slate-200">Unresolved placeholders</h3>
                <p className="text-sm text-muted-foreground mt-1">
                  This email contains placeholders that may not have been replaced:
                </p>
                <ul className="mt-2 space-y-1">
                  {unresolvedPlaceholders.map((p) => (
                    <li key={p} className="text-sm font-mono bg-amber-50 dark:bg-amber-900/20 text-amber-700 dark:text-amber-300 px-2 py-0.5 rounded">
                      {p}
                    </li>
                  ))}
                </ul>
              </div>
            </div>
            <p className="text-sm text-slate-600 dark:text-slate-400">
              Send anyway?
            </p>
            <div className="flex gap-3">
              <Button
                variant="outline"
                className="flex-1"
                onClick={() => {
                  setShowPlaceholderWarning(false);
                  setPendingMode(null);
                }}
              >
                Cancel
              </Button>
              <Button
                variant="destructive"
                className="flex-1"
                onClick={() => {
                  setShowPlaceholderWarning(false);
                  if (pendingMode) call(pendingMode, true);
                  setPendingMode(null);
                }}
              >
                Send anyway
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Test send dialog */}
      {showTestDialog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
          <div className="w-full max-w-sm bg-white dark:bg-slate-900 rounded-2xl shadow-2xl p-6 space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <FlaskConical className="h-5 w-5 text-indigo-600" />
                <h3 className="font-semibold text-slate-800 dark:text-slate-200">Send test email</h3>
              </div>
              <button
                onClick={() => setShowTestDialog(false)}
                className="text-muted-foreground hover:text-foreground"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <p className="text-sm text-muted-foreground">
              Send a test copy of this email to verify content and formatting.
            </p>
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-slate-700 dark:text-slate-300">
                Recipient email
              </label>
              <input
                type="email"
                value={testEmail}
                onChange={(e) => setTestEmail(e.target.value)}
                placeholder="you@example.com"
                className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                onKeyDown={(e) => { if (e.key === "Enter") sendTestEmail(); }}
              />
            </div>
            <div className="flex gap-3">
              <Button variant="outline" className="flex-1" onClick={() => setShowTestDialog(false)}>
                Cancel
              </Button>
              <Button
                className="flex-1 gap-1.5"
                onClick={sendTestEmail}
                disabled={!testEmail.trim() || busy === "test"}
              >
                <FlaskConical className="h-4 w-4" />
                {busy === "test" ? "Sending…" : "Send test"}
              </Button>
            </div>
          </div>
        </div>
      )}

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

          <div className="flex gap-2">
            <Button
              onClick={() => call("send")}
              disabled={!!busy || isSent}
              className="flex-1"
            >
              <Send className="h-4 w-4 mr-2" />
              {busy === "send" ? "Sending…" : "Mark as Sent in Pipedrive"}
            </Button>
            <Button
              variant="outline"
              size="default"
              onClick={() => setShowTestDialog(true)}
              disabled={!!busy || isSent}
              title="Send a test copy to yourself"
              className="shrink-0 gap-1.5 text-indigo-600 border-indigo-300 hover:bg-indigo-50 hover:text-indigo-700"
            >
              <FlaskConical className="h-4 w-4" />
              Test
            </Button>
          </div>

          {(isSent || isApproved) ? (
            <Button onClick={followup} disabled={!!busy} variant="outline" className="w-full">
              {busy === "followup" ? "Drafting follow-up…" : "Generate follow-up draft"}
            </Button>
          ) : null}
        </CardContent>
      </Card>
    </>
  );
}
