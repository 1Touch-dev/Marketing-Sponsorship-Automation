"use client";

import { useState } from "react";

interface LeadInterestFormProps {
  proposalId: string;
  companyName?: string;
}

export function LeadInterestForm({ proposalId, companyName = "" }: LeadInterestFormProps) {
  const [name, setName] = useState("");
  const [company, setCompany] = useState(companyName);
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [message, setMessage] = useState("");
  const [lgpdConsent, setLgpdConsent] = useState(false);
  const [status, setStatus] = useState<"idle" | "loading" | "success" | "error">("idle");
  const [errorMsg, setErrorMsg] = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!lgpdConsent) {
      setErrorMsg("Por favor, aceite os termos da LGPD para continuar.");
      return;
    }
    setStatus("loading");
    setErrorMsg("");
    try {
      const res = await fetch(`/api/proposals/${proposalId}/interest`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, company, email, phone, message, lgpdConsent }),
      });
      if (!res.ok) throw new Error("Erro ao enviar");
      setStatus("success");
    } catch {
      setStatus("error");
      setErrorMsg("Não foi possível enviar. Tente novamente em instantes.");
    }
  }

  if (status === "success") {
    return (
      <section id="interesse" className="py-12 border-t border-slate-100">
        <div className="max-w-5xl mx-auto px-6 sm:px-8">
          <div className="rounded-2xl bg-green-50 border border-green-200 p-10 text-center">
            <div className="text-4xl mb-4">✅</div>
            <h2 className="text-xl font-bold text-green-900 mb-2">Mensagem enviada!</h2>
            <p className="text-green-700 text-sm">Nossa equipe de patrocínios entrará em contato em breve.</p>
          </div>
        </div>
      </section>
    );
  }

  return (
    <section id="interesse" className="py-12 border-t border-slate-100">
      <div className="max-w-5xl mx-auto px-6 sm:px-8">
        <div className="rounded-2xl bg-white border border-slate-200 shadow-sm p-8 sm:p-10">
          {/* Header */}
          <div className="mb-7">
            <div className="inline-flex items-center rounded-full bg-green-100 text-green-800 px-3 py-1 text-xs font-semibold uppercase tracking-wider mb-3">
              Demonstrar Interesse
            </div>
            <h2 className="text-2xl font-bold text-slate-900">Fale com nossa equipe</h2>
            <p className="text-slate-500 mt-1.5 text-sm">
              Preencha o formulário abaixo e um especialista em patrocínios do Coritiba FC entrará em contato.
            </p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-5">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
              {/* Nome */}
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">
                  Nome <span className="text-red-500">*</span>
                </label>
                <input
                  required
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Seu nome completo"
                  className="w-full rounded-lg border border-slate-300 px-3.5 py-2.5 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent transition"
                />
              </div>

              {/* Empresa */}
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">
                  Empresa <span className="text-red-500">*</span>
                </label>
                <input
                  required
                  type="text"
                  value={company}
                  onChange={(e) => setCompany(e.target.value)}
                  placeholder="Nome da empresa"
                  className="w-full rounded-lg border border-slate-300 px-3.5 py-2.5 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent transition"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
              {/* E-mail */}
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">
                  E-mail <span className="text-red-500">*</span>
                </label>
                <input
                  required
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="seu@email.com"
                  className="w-full rounded-lg border border-slate-300 px-3.5 py-2.5 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent transition"
                />
              </div>

              {/* Telefone/WhatsApp */}
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">
                  Telefone / WhatsApp
                </label>
                <input
                  type="tel"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="+55 (41) 9 9999-9999"
                  className="w-full rounded-lg border border-slate-300 px-3.5 py-2.5 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent transition"
                />
              </div>
            </div>

            {/* Mensagem */}
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1.5">
                Mensagem <span className="text-slate-400 font-normal">(opcional)</span>
              </label>
              <textarea
                rows={3}
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                placeholder="Conte-nos um pouco sobre seus objetivos de marketing ou dúvidas sobre a proposta..."
                className="w-full rounded-lg border border-slate-300 px-3.5 py-2.5 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent transition resize-none"
              />
            </div>

            {/* LGPD checkbox */}
            <div className="flex items-start gap-3 rounded-lg bg-slate-50 border border-slate-200 p-4">
              <input
                id="lgpd"
                type="checkbox"
                checked={lgpdConsent}
                onChange={(e) => setLgpdConsent(e.target.checked)}
                className="mt-0.5 h-4 w-4 rounded border-slate-300 text-green-600 focus:ring-green-500 cursor-pointer"
              />
              <label htmlFor="lgpd" className="text-xs text-slate-600 leading-relaxed cursor-pointer">
                Concordo com o uso dos meus dados para contato comercial conforme a{" "}
                <span className="font-semibold text-slate-800">LGPD</span>{" "}
                (Lei Geral de Proteção de Dados — Lei 13.709/2018). Seus dados serão usados
                exclusivamente para fins de contato comercial pelo Coritiba FC.
              </label>
            </div>

            {errorMsg && (
              <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-4 py-3">
                {errorMsg}
              </p>
            )}

            <button
              type="submit"
              disabled={status === "loading"}
              className="w-full sm:w-auto inline-flex items-center justify-center gap-2 rounded-xl px-8 py-3 text-sm font-bold text-white transition-all disabled:opacity-60 disabled:cursor-not-allowed hover:opacity-90 active:scale-[0.98]"
              style={{ background: "linear-gradient(135deg, #003A2D 0%, #005742 100%)" }}
            >
              {status === "loading" ? (
                <>
                  <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                  </svg>
                  Enviando...
                </>
              ) : (
                "Enviar Interesse"
              )}
            </button>
          </form>
        </div>
      </div>
    </section>
  );
}
