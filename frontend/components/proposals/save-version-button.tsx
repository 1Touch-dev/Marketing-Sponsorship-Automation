"use client";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { GitBranch, Loader2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useToast } from "@/components/ui/toaster";

export function SaveVersionButton({ proposalId }: { proposalId: string }) {
  const [saving, setSaving] = useState(false);
  const router = useRouter();
  const { toast } = useToast();

  async function handleSave() {
    setSaving(true);
    try {
      const res = await fetch(`/api/proposals/${proposalId}/save-version`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ reason: "Manual snapshot" }),
      });
      const data = await res.json();
      if (res.ok) {
        toast({ title: `✓ Version saved — now v${data.newVersion}` });
        router.refresh();
      } else {
        toast({ variant: "destructive", title: data.error ?? "Failed to save version" });
      }
    } finally {
      setSaving(false);
    }
  }

  return (
    <Button variant="outline" size="sm" onClick={handleSave} disabled={saving}>
      {saving ? (
        <Loader2 className="h-4 w-4 animate-spin mr-1" />
      ) : (
        <GitBranch className="h-4 w-4 mr-1" />
      )}
      Save Version
    </Button>
  );
}
