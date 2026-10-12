"use client";

import { useState } from "react";

type ProofFile = { id: string; name?: string };
type ProofDetail = {
  kind: "link" | "statement" | "file";
  link?: string;
  statement?: string;
  file?: ProofFile | null;
} | null;

export type PortalDeliveryItem = {
  id: string;
  contract_id: string;
  title: string;
  due_date: string;
  status: string;
  proof: string;
  proof_detail: ProofDetail;
  match: { opponent: string; match_date: string } | null;
  sponsor_acceptance: { accepted_at: string; note?: string | null } | null;
  can_accept: boolean;
};

async function saveZip(path: string): Promise<string | null> {
  const res = await fetch(path);
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    return typeof body.error === "string" ? body.error : "O pacote não pôde ser baixado.";
  }
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  const named = /filename="([^"]+)"/.exec(res.headers.get("Content-Disposition") ?? "");
  link.href = url;
  link.download = named?.[1] ?? "proof-pack.zip";
  link.click();
  URL.revokeObjectURL(url);
  return null;
}

function DeliveryCard({ item }: { item: PortalDeliveryItem }) {
  const [note, setNote] = useState("");
  const [acceptance, setAcceptance] = useState(item.sponsor_acceptance);
  const [canAccept, setCanAccept] = useState(item.can_accept);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const showProof = item.proof !== "pending" && item.proof_detail;

  async function accept() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/portal/delivery/${item.id}/accept`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ note: note.trim() || undefined }),
      });
      const body = await res.json().catch(() => ({}));
      const payload = body.data && typeof body.data === "object" ? body.data as { accepted_at?: string; note?: string | null } : body;
      if (!res.ok) {
        setError(typeof body.error === "string" ? body.error : "Não foi possível registrar o aceite.");
        return;
      }
      setAcceptance({
        accepted_at: typeof payload.accepted_at === "string" ? payload.accepted_at : new Date().toISOString(),
        note: note.trim() || acceptance?.note || null,
      });
      setCanAccept(false);
    } catch {
      setError("Não foi possível registrar o aceite.");
    } finally {
      setBusy(false);
    }
  }

  async function openFile() {
    const fileId = item.proof_detail?.file?.id;
    if (!fileId) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/portal/delivery/${item.id}/proof/${fileId}`);
      const body = await res.json().catch(() => ({}));
      const payload = body.data && typeof body.data === "object" ? body.data as { url?: string } : body;
      if (!res.ok || typeof payload.url !== "string") {
        setError(typeof body.error === "string" ? body.error : "O arquivo não pôde ser aberto.");
        return;
      }
      window.open(payload.url, "_blank", "noopener,noreferrer");
    } catch {
      setError("O arquivo não pôde ser aberto.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="rounded-2xl bg-white border border-slate-200 p-5 sm:p-6 space-y-2">
      <h3 className="text-base font-semibold text-slate-900">{item.title}</h3>
      <p className="text-xs text-slate-400">
        {item.due_date ? `Prazo ${item.due_date.slice(0, 10)}` : "Sem prazo"}
        {" · "}
        {item.status}
        {" · "}
        {item.proof === "attached" ? "Comprovação anexada" : item.proof === "stated" ? "Comprovação declarada" : "Comprovação pendente"}
      </p>
      {item.match && (
        <p className="text-sm text-slate-700">
          Jogo: {item.match.opponent} · {item.match.match_date.slice(0, 10)}
        </p>
      )}
      {showProof && item.proof_detail?.kind === "link" && item.proof_detail.link && (
        <a href={item.proof_detail.link} target="_blank" rel="noopener noreferrer" className="text-sm text-slate-700 underline break-all">
          {item.proof_detail.link}
        </a>
      )}
      {showProof && item.proof_detail?.kind === "statement" && item.proof_detail.statement && (
        <p className="text-sm text-slate-700 whitespace-pre-wrap">{item.proof_detail.statement}</p>
      )}
      {showProof && item.proof_detail?.kind === "file" && item.proof_detail.file && (
        <button type="button" onClick={openFile} disabled={busy} className="text-sm underline disabled:opacity-50">
          {item.proof_detail.file.name || "Abrir arquivo"}
        </button>
      )}
      {acceptance && (
        <p className="text-sm text-slate-700">
          Aceito em {acceptance.accepted_at.slice(0, 10)}
          {acceptance.note ? ` · ${acceptance.note}` : ""}
        </p>
      )}
      {canAccept && (
        <div className="space-y-2">
          <label className="block text-xs font-medium text-slate-600" htmlFor={`accept-${item.id}`}>Nota</label>
          <textarea
            id={`accept-${item.id}`}
            value={note}
            onChange={(event) => setNote(event.target.value)}
            rows={2}
            className="w-full rounded-md border border-slate-200 px-3 py-2 text-sm"
          />
          <button type="button" onClick={accept} disabled={busy} className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50">
            Aceitar a comprovação
          </button>
        </div>
      )}
      {error && <p role="alert" className="text-sm text-red-600">{error}</p>}
    </div>
  );
}

export function PortalDeliveryList({ items }: { items: PortalDeliveryItem[] }) {
  const [packError, setPackError] = useState<string | null>(null);
  const contracts = Array.from(new Set(items.map((item) => item.contract_id).filter(Boolean)));

  return (
    <div className="space-y-3">
      {packError && <p role="alert" className="text-sm text-red-600">{packError}</p>}
      {contracts.map((contractId) => (
        <button
          key={contractId}
          type="button"
          className="text-sm underline"
          onClick={() => {
            void saveZip(`/api/portal/delivery/pack/${contractId}`).then((message) => setPackError(message));
          }}
        >
          Baixar o pacote de comprovação
        </button>
      ))}
      {items.map((item) => <DeliveryCard key={item.id} item={item} />)}
    </div>
  );
}
