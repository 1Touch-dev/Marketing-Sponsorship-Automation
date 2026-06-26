"use client";
import { useState, useTransition } from "react";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

async function saveExpiresAt(proposalId: string, expiresAt: string | null) {
  const res = await fetch(`/api/proposals/${proposalId}/expires-at`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ expires_at: expiresAt || null }),
  });
  if (!res.ok) throw new Error("Failed to save");
}

export function ExpiryDateField({
  proposalId,
  initialValue,
}: {
  proposalId: string;
  initialValue?: string | null;
}) {
  const [value, setValue] = useState(
    initialValue ? new Date(initialValue).toISOString().slice(0, 10) : ""
  );
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState("");
  const [isPending, startTransition] = useTransition();

  function handleSave() {
    setError("");
    setSaved(false);
    startTransition(async () => {
      try {
        await saveExpiresAt(proposalId, value || null);
        setSaved(true);
        setTimeout(() => setSaved(false), 2500);
      } catch {
        setError("Erro ao salvar. Tente novamente.");
      }
    });
  }

  return (
    <div className="flex flex-col gap-2 max-w-xs">
      <Label htmlFor="expires_at" className="text-sm font-medium">
        Data de Validade (opcional)
      </Label>
      <div className="flex items-center gap-2">
        <Input
          id="expires_at"
          type="date"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          className="w-44"
        />
        <Button
          type="button"
          size="sm"
          variant="outline"
          onClick={handleSave}
          disabled={isPending}
        >
          {isPending ? "Salvando…" : saved ? "✓ Salvo" : "Salvar"}
        </Button>
        {value && (
          <Button
            type="button"
            size="sm"
            variant="ghost"
            onClick={() => { setValue(""); setError(""); setSaved(false); saveExpiresAt(proposalId, null).catch(() => {}); }}
            className="text-slate-400 hover:text-red-500"
          >
            Limpar
          </Button>
        )}
      </div>
      {error && <p className="text-xs text-red-500">{error}</p>}
      <p className="text-xs text-muted-foreground">
        Se definida, um badge de validade será exibido na landing page pública.
      </p>
    </div>
  );
}
