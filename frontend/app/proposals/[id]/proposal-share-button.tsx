"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toaster";
import { Link2, Link2Off } from "lucide-react";

interface ProposalShareButtonProps {
  proposalId: string;
  shareToken: string | null;
}

export function ProposalShareButton({ proposalId, shareToken }: ProposalShareButtonProps) {
  const [token, setToken] = useState(shareToken);
  const [loading, setLoading] = useState(false);
  const { toast } = useToast();

  async function handleShare() {
    setLoading(true);
    try {
      const res = await fetch(`/api/proposals/${proposalId}/share`, { method: "POST" });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Share failed");
      setToken(json.share_token);
      await navigator.clipboard.writeText(json.share_url);
      toast({
        title: "Link copiado!",
        description: "Link de compartilhamento copiado para a área de transferência.",
      });
    } catch (err) {
      toast({
        title: "Erro ao compartilhar",
        description: err instanceof Error ? err.message : "Erro desconhecido",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  }

  async function handleRevoke() {
    setLoading(true);
    try {
      const res = await fetch(`/api/proposals/${proposalId}/share`, { method: "DELETE" });
      if (!res.ok) throw new Error("Revoke failed");
      setToken(null);
      toast({ title: "Link revogado", description: "O link de compartilhamento foi desativado." });
    } catch (err) {
      toast({
        title: "Erro",
        description: err instanceof Error ? err.message : "Erro desconhecido",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  }

  if (token) {
    return (
      <Button variant="outline" size="sm" onClick={handleRevoke} disabled={loading}>
        <Link2Off className="h-4 w-4 mr-1.5" />
        {loading ? "..." : "Revogar Link"}
      </Button>
    );
  }

  return (
    <Button variant="outline" size="sm" onClick={handleShare} disabled={loading}>
      <Link2 className="h-4 w-4 mr-1.5" />
      {loading ? "Gerando..." : "Compartilhar"}
    </Button>
  );
}
