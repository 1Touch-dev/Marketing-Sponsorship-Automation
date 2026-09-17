"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toaster";
import { FileSignature, RefreshCw, ExternalLink, CheckCircle2 } from "lucide-react";

type SignatureStatus = "not_sent" | "draft" | "pending" | "completed" | "rejected" | "cancelled";

const STATUS_LABEL: Record<SignatureStatus, string> = {
  not_sent: "Não enviado",
  draft: "Rascunho",
  pending: "Aguardando assinatura",
  completed: "Assinado",
  rejected: "Recusado",
  cancelled: "Cancelado",
};

export function ESignaturePanel({
  contractId,
  initialStatus,
  initialSigningUrl,
  initialSignedPdfUrl,
}: {
  contractId: string;
  initialStatus: SignatureStatus;
  initialSigningUrl: string | null;
  initialSignedPdfUrl: string | null;
}) {
  const router = useRouter();
  const { toast } = useToast();
  const [status, setStatus] = useState(initialStatus);
  const [signingUrl, setSigningUrl] = useState(initialSigningUrl);
  const [signedPdfUrl, setSignedPdfUrl] = useState(initialSignedPdfUrl);
  const [busy, setBusy] = useState(false);

  async function sendForSignature() {
    setBusy(true);
    try {
      const res = await fetch(`/api/contracts/${contractId}/send-for-signature`, { method: "POST" });
      const j = await res.json();
      if (!res.ok) throw new Error(j?.error ?? "Failed");
      setStatus("pending");
      setSigningUrl(j.signingUrl ?? null);
      toast({ variant: "success", title: "Enviado para assinatura", description: `Para ${j.signerEmail}` });
      router.refresh();
    } catch (err) {
      toast({ variant: "destructive", title: "Falha ao enviar", description: err instanceof Error ? err.message : undefined });
    } finally {
      setBusy(false);
    }
  }

  async function refreshStatus() {
    setBusy(true);
    try {
      const res = await fetch(`/api/contracts/${contractId}/signature-status`, { method: "POST" });
      const j = await res.json();
      if (!res.ok) throw new Error(j?.error ?? "Failed");
      setStatus(j.status);
      if (j.signedPdfUrl) setSignedPdfUrl(j.signedPdfUrl);
      router.refresh();
    } catch (err) {
      toast({ variant: "destructive", title: "Falha ao verificar status", description: err instanceof Error ? err.message : undefined });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          {status === "completed" ? (
            <CheckCircle2 className="h-4 w-4 text-green-600" />
          ) : (
            <FileSignature className="h-4 w-4 text-slate-500" />
          )}
          <span className="text-sm font-medium">{STATUS_LABEL[status]}</span>
        </div>
        {status === "not_sent" ? (
          <Button size="sm" disabled={busy} onClick={sendForSignature}>
            Enviar para Assinatura
          </Button>
        ) : status !== "completed" ? (
          <Button size="sm" variant="outline" disabled={busy} onClick={refreshStatus} className="gap-1.5">
            <RefreshCw className="h-3.5 w-3.5" /> Atualizar Status
          </Button>
        ) : null}
      </div>

      {signingUrl && status === "pending" && (
        <a
          href={signingUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1.5 text-xs text-green-700 hover:text-green-900"
        >
          Ver link de assinatura <ExternalLink className="h-3 w-3" />
        </a>
      )}

      {signedPdfUrl && status === "completed" && (
        <a
          href={signedPdfUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1.5 text-xs text-green-700 hover:text-green-900"
        >
          Baixar contrato assinado <ExternalLink className="h-3 w-3" />
        </a>
      )}
    </div>
  );
}
