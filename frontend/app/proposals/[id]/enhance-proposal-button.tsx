"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toaster";
import { Sparkles, Loader2 } from "lucide-react";

interface EnhanceProposalButtonProps {
  proposalId: string;
  hasIntelligence: boolean;
}

export function EnhanceProposalButton({ proposalId, hasIntelligence }: EnhanceProposalButtonProps) {
  const [loading, setLoading] = useState(false);
  const router = useRouter();
  const { toast } = useToast();

  async function handleEnhance() {
    setLoading(true);
    toast({
      title: "Gerando análise de inteligência…",
      description: "Estratégias, preços, visuais e análise de empresa sendo gerados. Aguarde ~2 min.",
    });
    try {
      const res = await fetch(`/api/proposals/${proposalId}/enhance`, { method: "POST" });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Enhancement failed");
      const completed = json.enhancement_results
        ? Object.keys(json.enhancement_results).filter(k => !k.endsWith("_error"))
        : [];
      toast({
        title: "Proposta enriquecida!",
        description: `${completed.length} camadas geradas: ${completed.join(", ")}`,
      });
      router.refresh();
    } catch (err) {
      toast({
        title: "Erro ao enriquecer proposta",
        description: err instanceof Error ? err.message : "Erro desconhecido",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  }

  return (
    <Button
      variant={hasIntelligence ? "outline" : "default"}
      size="sm"
      onClick={handleEnhance}
      disabled={loading}
      className={hasIntelligence ? "" : "bg-blue-600 hover:bg-blue-700 text-white"}
    >
      {loading ? (
        <><Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> Gerando IA…</>
      ) : (
        <><Sparkles className="h-4 w-4 mr-1.5" /> {hasIntelligence ? "Re-enriquecer" : "✨ Enriquecer com IA"}</>
      )}
    </Button>
  );
}
