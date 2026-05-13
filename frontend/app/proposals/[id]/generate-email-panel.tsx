"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/components/ui/toaster";

export function GenerateEmailPanel({ proposalId }: { proposalId: string }) {
  const router = useRouter();
  const { toast } = useToast();
  const [recipient, setRecipient] = useState("");
  const [contact, setContact] = useState("");
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      const res = await fetch("/api/emails/generate", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          proposal_id: proposalId,
          recipient,
          contact_name: contact || undefined,
        }),
      });
      const j = await res.json();
      if (!res.ok) throw new Error(j?.error ?? `Failed (${res.status})`);
      toast({ variant: "success", title: "Email draft created" });
      router.push(`/emails/${j.data.id}`);
    } catch (err) {
      toast({ variant: "destructive", title: "Email generation failed", description: err instanceof Error ? err.message : "Unknown error" });
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Draft outreach email</CardTitle>
        <CardDescription>Claude will draft an outreach email for the recipient.</CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={onSubmit} className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="recipient">Recipient email *</Label>
            <Input id="recipient" type="email" required value={recipient} onChange={(e) => setRecipient(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="contact">Contact name</Label>
            <Input id="contact" value={contact} onChange={(e) => setContact(e.target.value)} />
          </div>
          <Button type="submit" disabled={busy || !recipient} className="w-full">
            {busy ? "Drafting…" : "Generate email"}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
