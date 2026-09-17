"use client";

import { useState } from "react";
import { Mail, ArrowRight, CheckCircle2 } from "lucide-react";

export default function PortalLoginPage() {
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<"idle" | "loading" | "sent">("idle");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setStatus("loading");
    try {
      await fetch("/api/portal/request-link", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email }),
      });
    } finally {
      setStatus("sent");
    }
  }

  return (
    <div className="min-h-screen w-full flex items-center justify-center bg-slate-50 px-4">
      <div className="w-full max-w-sm rounded-2xl bg-white border border-slate-200 shadow-xl p-8">
        <div className="flex items-center gap-3 mb-6">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/brand/coritiba-crest.png" alt="Coritiba FC" className="h-10 w-10 object-contain" />
          <div>
            <div className="text-sm font-bold text-slate-800">Portal do Patrocinador</div>
            <div className="text-xs text-slate-400">Coritiba FC</div>
          </div>
        </div>

        {status === "sent" ? (
          <div className="text-center py-4 space-y-3">
            <CheckCircle2 className="h-10 w-10 text-green-500 mx-auto" />
            <p className="text-sm text-slate-600">
              Se este e-mail estiver associado a uma empresa parceira, enviamos um link de acesso. Verifique sua caixa de entrada.
            </p>
          </div>
        ) : (
          <>
            <p className="text-sm text-slate-500 mb-5">
              Digite seu e-mail para receber um link de acesso ao portal — sem senha necessária.
            </p>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                <input
                  type="email"
                  required
                  autoFocus
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="voce@suaempresa.com"
                  className="w-full rounded-lg border border-slate-300 pl-9 pr-3.5 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
                />
              </div>
              <button
                type="submit"
                disabled={status === "loading" || !email}
                className="w-full inline-flex items-center justify-center gap-2 rounded-xl px-6 py-3 text-sm font-bold text-white transition-all disabled:opacity-60"
                style={{ background: "linear-gradient(135deg, #003A2D 0%, #005742 100%)" }}
              >
                {status === "loading" ? "Enviando…" : "Enviar link de acesso"}
                {status !== "loading" && <ArrowRight className="h-4 w-4" />}
              </button>
            </form>
          </>
        )}
      </div>
    </div>
  );
}
