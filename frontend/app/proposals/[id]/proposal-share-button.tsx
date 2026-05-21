"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toaster";
import { Link2, Copy, ExternalLink, Link2Off, Check } from "lucide-react";

interface ProposalShareButtonProps {
  proposalId: string;
  shareToken: string | null;
}

export function ProposalShareButton({ proposalId, shareToken }: ProposalShareButtonProps) {
  const [token, setToken] = useState(shareToken);
  const [loading, setLoading] = useState(false);
  const [copied, setCopied] = useState(false);
  const { toast } = useToast();

  const shareUrl = token ? `${typeof window !== "undefined" ? window.location.origin : ""}/proposals/view/${token}` : null;

  async function handleShare() {
    setLoading(true);
    try {
      const res = await fetch(`/api/proposals/${proposalId}/share`, { method: "POST" });
      const json = await res.json() as { share_token?: string; share_url?: string; error?: string };
      if (!res.ok) throw new Error(json.error ?? "Share failed");
      setToken(json.share_token ?? null);
      toast({ title: "Share link created!", description: "Copy it below to send to sponsors." });
    } catch (err) {
      toast({ title: "Error creating share link", description: err instanceof Error ? err.message : "Unknown error", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }

  async function copyLink() {
    if (!shareUrl) return;
    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopied(true);
      toast({ title: "Link copied!", description: "Share this link with sponsors." });
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast({ title: "Copy failed", description: shareUrl, variant: "destructive" });
    }
  }

  async function handleRevoke() {
    if (!confirm("Revoke this share link? Anyone with the link will lose access.")) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/proposals/${proposalId}/share`, { method: "DELETE" });
      if (!res.ok) throw new Error("Revoke failed");
      setToken(null);
      toast({ title: "Link revoked" });
    } catch (err) {
      toast({ title: "Error", description: err instanceof Error ? err.message : "Unknown", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }

  if (token && shareUrl) {
    return (
      <div className="flex flex-col gap-2">
        <div className="flex items-center gap-1.5 p-2 rounded-lg border bg-muted/40 text-xs text-muted-foreground">
          <Link2 className="h-3.5 w-3.5 text-green-500 flex-shrink-0" />
          <span className="truncate flex-1 font-mono">{shareUrl}</span>
          <Button size="sm" variant="ghost" className="h-6 px-2 gap-1 flex-shrink-0" onClick={copyLink}>
            {copied ? <Check className="h-3 w-3 text-green-500" /> : <Copy className="h-3 w-3" />}
            {copied ? "Copied" : "Copy"}
          </Button>
          <Button size="sm" variant="ghost" className="h-6 px-2 flex-shrink-0" asChild>
            <a href={shareUrl} target="_blank" rel="noopener noreferrer">
              <ExternalLink className="h-3 w-3" />
            </a>
          </Button>
        </div>
        <Button variant="ghost" size="sm" onClick={handleRevoke} disabled={loading} className="text-destructive hover:text-destructive h-7 text-xs w-fit">
          <Link2Off className="h-3.5 w-3.5 mr-1" />
          {loading ? "..." : "Revoke link"}
        </Button>
      </div>
    );
  }

  return (
    <Button variant="outline" size="sm" onClick={handleShare} disabled={loading} className="gap-1.5">
      <Link2 className="h-4 w-4" />
      {loading ? "Generating…" : "Create Share Link"}
    </Button>
  );
}
