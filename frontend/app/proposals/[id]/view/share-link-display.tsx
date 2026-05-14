"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toaster";
import { Link2, CheckCircle2 } from "lucide-react";

interface ShareLinkDisplayProps {
  proposalId: string;
  shareToken: string | null;
}

export function ShareLinkDisplay({ proposalId, shareToken: initialToken }: ShareLinkDisplayProps) {
  const [token, setToken] = useState(initialToken);
  const [loading, setLoading] = useState(false);
  const [copied, setCopied] = useState(false);
  const { toast } = useToast();

  const shareUrl = token
    ? `${typeof window !== "undefined" ? window.location.origin : ""}/proposals/view/${token}`
    : null;

  async function handleCreate() {
    setLoading(true);
    try {
      const res = await fetch(`/api/proposals/${proposalId}/share`, { method: "POST" });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Failed");
      setToken(json.share_token);
      await navigator.clipboard.writeText(json.share_url);
      setCopied(true);
      setTimeout(() => setCopied(false), 3000);
      toast({ title: "Link criado e copiado!" });
    } catch (err) {
      toast({ title: "Erro", description: err instanceof Error ? err.message : "Erro", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }

  async function copyLink() {
    if (!shareUrl) return;
    await navigator.clipboard.writeText(shareUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 3000);
    toast({ title: "Link copiado!" });
  }

  if (!token) {
    return (
      <Button variant="outline" size="sm" onClick={handleCreate} disabled={loading}>
        <Link2 className="h-4 w-4 mr-1.5" />
        {loading ? "Criando..." : "Gerar link público"}
      </Button>
    );
  }

  return (
    <Button variant="outline" size="sm" onClick={copyLink}>
      {copied ? (
        <>
          <CheckCircle2 className="h-4 w-4 mr-1.5 text-green-500" />
          Copiado!
        </>
      ) : (
        <>
          <Link2 className="h-4 w-4 mr-1.5" />
          Copiar link
        </>
      )}
    </Button>
  );
}
