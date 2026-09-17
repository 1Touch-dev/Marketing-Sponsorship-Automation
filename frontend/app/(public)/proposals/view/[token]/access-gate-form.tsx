"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Lock, ShieldCheck } from "lucide-react";

export function AccessGateForm({
  token,
  type,
  ndaText,
  companyName,
  clubName,
  crestUrl,
}: {
  token: string;
  type: "passcode" | "nda";
  ndaText: string | null;
  companyName: string;
  clubName: string;
  crestUrl: string | null;
}) {
  const router = useRouter();
  const [passcode, setPasscode] = useState("");
  const [ndaName, setNdaName] = useState("");
  const [ndaAccepted, setNdaAccepted] = useState(false);
  const [status, setStatus] = useState<"idle" | "loading" | "error">("idle");
  const [errorMsg, setErrorMsg] = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setStatus("loading");
    setErrorMsg("");
    try {
      const res = await fetch(`/api/proposals/view/${token}/verify-gate`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(
          type === "passcode"
            ? { passcode }
            : { nda_name: ndaName, nda_accepted: ndaAccepted },
        ),
      });
      const j = await res.json();
      if (!res.ok) throw new Error(j?.error ?? "Falha na verificação");
      router.refresh();
    } catch (err) {
      setStatus("error");
      setErrorMsg(err instanceof Error ? err.message : "Erro desconhecido");
    }
  }

  return (
    <div className="min-h-screen w-full flex items-center justify-center bg-slate-50 px-4">
      <div className="w-full max-w-md rounded-2xl bg-white border border-slate-200 shadow-xl p-8">
        <div className="flex items-center gap-3 mb-6">
          {crestUrl && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={crestUrl} alt={clubName} className="h-10 w-10 object-contain" />
          )}
          <div>
            <div className="text-sm font-bold text-slate-800">{clubName}</div>
            <div className="text-xs text-slate-400">Proposta para {companyName}</div>
          </div>
        </div>

        {type === "passcode" ? (
          <>
            <div className="flex items-center gap-2 mb-2">
              <Lock className="h-4 w-4 text-slate-500" />
              <h1 className="text-lg font-bold text-slate-900">Acesso restrito</h1>
            </div>
            <p className="text-sm text-slate-500 mb-5">
              Esta proposta está protegida por senha. Digite a senha que você recebeu para continuar.
            </p>
            <form onSubmit={handleSubmit} className="space-y-4">
              <input
                type="password"
                required
                autoFocus
                value={passcode}
                onChange={(e) => setPasscode(e.target.value)}
                placeholder="Senha"
                className="w-full rounded-lg border border-slate-300 px-3.5 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
              />
              {errorMsg && <p className="text-sm text-red-600">{errorMsg}</p>}
              <button
                type="submit"
                disabled={status === "loading" || !passcode}
                className="w-full rounded-xl px-6 py-3 text-sm font-bold text-white transition-all disabled:opacity-60"
                style={{ background: "linear-gradient(135deg, #003A2D 0%, #005742 100%)" }}
              >
                {status === "loading" ? "Verificando…" : "Acessar Proposta"}
              </button>
            </form>
          </>
        ) : (
          <>
            <div className="flex items-center gap-2 mb-2">
              <ShieldCheck className="h-4 w-4 text-slate-500" />
              <h1 className="text-lg font-bold text-slate-900">Acordo de Confidencialidade</h1>
            </div>
            <div className="text-sm text-slate-600 mb-5 max-h-48 overflow-y-auto rounded-lg border border-slate-200 bg-slate-50 p-4 leading-relaxed whitespace-pre-line">
              {ndaText ||
                `Esta proposta contém informações confidenciais e estratégicas do ${clubName}. Ao continuar, você concorda em não compartilhar, reproduzir ou divulgar o conteúdo desta proposta a terceiros sem autorização prévia.`}
            </div>
            <form onSubmit={handleSubmit} className="space-y-4">
              <input
                type="text"
                required
                autoFocus
                value={ndaName}
                onChange={(e) => setNdaName(e.target.value)}
                placeholder="Seu nome completo"
                className="w-full rounded-lg border border-slate-300 px-3.5 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
              />
              <label className="flex items-start gap-2.5 text-xs text-slate-600 cursor-pointer">
                <input
                  type="checkbox"
                  checked={ndaAccepted}
                  onChange={(e) => setNdaAccepted(e.target.checked)}
                  className="mt-0.5 h-4 w-4 rounded border-slate-300 text-green-600 focus:ring-green-500"
                />
                Li e concordo com os termos de confidencialidade acima.
              </label>
              {errorMsg && <p className="text-sm text-red-600">{errorMsg}</p>}
              <button
                type="submit"
                disabled={status === "loading" || !ndaAccepted || !ndaName.trim()}
                className="w-full rounded-xl px-6 py-3 text-sm font-bold text-white transition-all disabled:opacity-60"
                style={{ background: "linear-gradient(135deg, #003A2D 0%, #005742 100%)" }}
              >
                {status === "loading" ? "Verificando…" : "Concordar e Continuar"}
              </button>
            </form>
          </>
        )}
      </div>
    </div>
  );
}
