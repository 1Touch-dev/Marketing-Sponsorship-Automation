"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toaster";
import { Lock, ShieldCheck } from "lucide-react";

interface AccessGateSettingsProps {
  proposalId: string;
  initialEnabled: boolean;
  initialType: "passcode" | "nda";
  initialNdaText: string | null;
}

export function AccessGateSettings({
  proposalId,
  initialEnabled,
  initialType,
  initialNdaText,
}: AccessGateSettingsProps) {
  const { toast } = useToast();
  const [enabled, setEnabled] = useState(initialEnabled);
  const [type, setType] = useState<"passcode" | "nda">(initialType);
  const [passcode, setPasscode] = useState("");
  const [ndaText, setNdaText] = useState(initialNdaText ?? "");
  const [busy, setBusy] = useState(false);

  async function save(next: { enabled: boolean }) {
    setBusy(true);
    try {
      const res = await fetch(`/api/proposals/${proposalId}/access-gate`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ enabled: next.enabled, type, passcode, nda_text: ndaText }),
      });
      const j = await res.json();
      if (!res.ok) throw new Error(j?.error ?? "Failed");
      setEnabled(next.enabled);
      toast({ variant: "success", title: next.enabled ? "Access gate enabled" : "Access gate disabled" });
    } catch (err) {
      toast({ variant: "destructive", title: "Failed to save", description: err instanceof Error ? err.message : undefined });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-3 text-sm">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          {type === "nda" ? <ShieldCheck className="h-4 w-4 text-slate-500" /> : <Lock className="h-4 w-4 text-slate-500" />}
          <span className="font-medium">Access gate</span>
        </div>
        <Button size="sm" variant={enabled ? "destructive" : "outline"} disabled={busy} onClick={() => save({ enabled: !enabled })}>
          {enabled ? "Disable" : "Enable"}
        </Button>
      </div>
      <p className="text-xs text-muted-foreground">
        Require a passcode or NDA acceptance before the share link reveals the proposal.
      </p>
      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => setType("passcode")}
          className={`flex-1 rounded-md border px-2 py-1.5 text-xs font-medium ${type === "passcode" ? "border-green-400 bg-green-50 text-green-800" : "border-slate-200 text-slate-500"}`}
        >
          Passcode
        </button>
        <button
          type="button"
          onClick={() => setType("nda")}
          className={`flex-1 rounded-md border px-2 py-1.5 text-xs font-medium ${type === "nda" ? "border-green-400 bg-green-50 text-green-800" : "border-slate-200 text-slate-500"}`}
        >
          NDA
        </button>
      </div>
      {type === "passcode" ? (
        <input
          type="text"
          value={passcode}
          onChange={(e) => setPasscode(e.target.value)}
          placeholder="Set a passcode"
          className="w-full rounded-md border border-slate-300 px-2.5 py-1.5 text-xs"
        />
      ) : (
        <textarea
          rows={3}
          value={ndaText}
          onChange={(e) => setNdaText(e.target.value)}
          placeholder="Custom NDA text (optional — a default confidentiality statement is used if left blank)"
          className="w-full rounded-md border border-slate-300 px-2.5 py-1.5 text-xs resize-none"
        />
      )}
      <Button size="sm" variant="outline" className="w-full" disabled={busy} onClick={() => save({ enabled })}>
        Save settings
      </Button>
    </div>
  );
}
