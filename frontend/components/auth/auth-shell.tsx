"use client";

import * as React from "react";
import { Building2, FileText, Handshake, Kanban, Mail, MapPin, ShieldCheck } from "lucide-react";
import { Crest } from "@/components/brand/crest";
import { useLang } from "@/lib/i18n/lang-context";

type Lang = "pt" | "en";

const COPY = {
  kicker: { pt: "Coritiba Foot Ball Club", en: "Coritiba Foot Ball Club" },
  title: { pt: "Plataforma de Patrocínios", en: "Sponsorship Platform" },
  lead: {
    pt: "Inteligência comercial do Coxa: encontre marcas, monte propostas e acompanhe cada parceria em um só lugar.",
    en: "The club's commercial intelligence: find brands, build proposals and follow every partnership in one place.",
  },
  features: [
    {
      icon: Building2,
      title: { pt: "Marcas e relacionamento", en: "Brands and relationships" },
      text: {
        pt: "Pesquisa de empresas, contatos e histórico de cada conversa.",
        en: "Company research, contacts and the history of every conversation.",
      },
    },
    {
      icon: FileText,
      title: { pt: "Propostas personalizadas", en: "Tailored proposals" },
      text: {
        pt: "Propostas com mockups de camisa e link seguro para o patrocinador.",
        en: "Proposals with jersey mockups and a secure link for the sponsor.",
      },
    },
    {
      icon: Mail,
      title: { pt: "Campanhas e respostas", en: "Campaigns and replies" },
      text: {
        pt: "E-mails de prospecção aprovados pela equipe, com respostas acompanhadas.",
        en: "Outreach emails approved by the team, with replies tracked.",
      },
    },
    {
      icon: Kanban,
      title: { pt: "Pipeline e aprovações", en: "Pipeline and approvals" },
      text: {
        pt: "Cada oportunidade em andamento, com revisão humana antes de qualquer envio.",
        en: "Every opportunity in progress, with human review before anything is sent.",
      },
    },
    {
      icon: Handshake,
      title: { pt: "Portal do patrocinador", en: "Sponsor portal" },
      text: {
        pt: "Contrapartidas, entregas e comprovantes à disposição do parceiro.",
        en: "Deliverables, proof of delivery and recaps available to the partner.",
      },
    },
  ],
  facts: {
    pt: "Fundado em 12 de outubro de 1909 · Curitiba, Paraná",
    en: "Founded 12 October 1909 · Curitiba, Paraná",
  },
  restricted: {
    pt: "Acesso restrito à equipe autorizada do clube.",
    en: "Restricted to the club's authorised staff.",
  },
} as const;

/**
 * Two-panel layout for the sign-in and password pages: a branded, informative
 * panel on the left (hidden on small screens, where a compact header takes its
 * place) and the form on the right.
 */
export function AuthShell({ children }: { children: React.ReactNode }) {
  const { lang, toggle } = useLang();
  const l = lang as Lang;

  return (
    <div className="min-h-screen w-full bg-slate-50 lg:grid lg:grid-cols-[minmax(0,1.05fr)_minmax(0,1fr)]">
      {/* Brand panel (desktop) */}
      <aside className="relative hidden overflow-hidden bg-[#00402e] text-white lg:flex lg:flex-col lg:justify-between lg:px-12 lg:py-10 xl:px-16">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0"
          style={{
            background:
              "radial-gradient(60% 50% at 20% 10%, rgba(255,255,255,0.10), transparent 70%), radial-gradient(50% 45% at 90% 95%, rgba(250,217,22,0.10), transparent 70%), linear-gradient(160deg, #00573f 0%, #00402e 55%, #002a1e 100%)",
          }}
        />
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 opacity-[0.05]"
          style={{
            backgroundImage:
              "repeating-linear-gradient(135deg, #fff 0, #fff 1px, transparent 1px, transparent 22px)",
          }}
        />

        <div className="relative flex items-center gap-3 text-sm font-medium tracking-wide text-white/80">
          <span className="h-px w-8 bg-white/40" />
          {COPY.kicker[l]}
        </div>

        <div className="relative my-6">
          <div className="mb-6 inline-flex rounded-[24px] bg-white p-4 shadow-2xl shadow-black/30 ring-1 ring-white/20">
            <Crest size={120} />
          </div>
          <h1 className="text-4xl font-bold leading-tight tracking-tight">{COPY.title[l]}</h1>
          <p className="mt-3 max-w-xl text-base leading-relaxed text-white/75">{COPY.lead[l]}</p>

          <ul className="mt-7 grid max-w-xl gap-4">
            {COPY.features.map((f) => (
              <li key={f.title.en} className="flex items-start gap-4">
                <span className="mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white/10 ring-1 ring-white/15">
                  <f.icon className="h-5 w-5 text-[#f9d916]" aria-hidden />
                </span>
                <span>
                  <span className="block text-sm font-semibold text-white">{f.title[l]}</span>
                  <span className="block text-sm leading-relaxed text-white/65">{f.text[l]}</span>
                </span>
              </li>
            ))}
          </ul>
        </div>

        <div className="relative flex flex-wrap items-center gap-x-6 gap-y-2 border-t border-white/15 pt-6 text-xs text-white/60">
          <span className="inline-flex items-center gap-2">
            <MapPin className="h-3.5 w-3.5" aria-hidden /> {COPY.facts[l]}
          </span>
          <span className="inline-flex items-center gap-2">
            <ShieldCheck className="h-3.5 w-3.5" aria-hidden /> {COPY.restricted[l]}
          </span>
        </div>
      </aside>

      {/* Form panel */}
      <main className="flex min-h-screen flex-col px-5 py-6 sm:px-10">
        <div className="flex justify-end">
          <button
            type="button"
            onClick={toggle}
            className="rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-semibold text-slate-600 shadow-sm transition hover:bg-slate-100"
            aria-label={l === "pt" ? "Switch to English" : "Mudar para português"}
          >
            <span className={l === "pt" ? "text-[#00573f]" : "text-slate-400"}>PT</span>
            <span className="mx-1 text-slate-300">|</span>
            <span className={l === "en" ? "text-[#00573f]" : "text-slate-400"}>EN</span>
          </button>
        </div>

        <div className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center py-8">
          {/* Compact brand header (mobile + tablet) */}
          <div className="mb-8 flex flex-col items-center text-center lg:hidden">
            <Crest size={88} />
            <p className="mt-4 text-xs font-semibold uppercase tracking-[0.2em] text-[#00573f]">{COPY.kicker[l]}</p>
            <h1 className="mt-1 text-2xl font-bold text-slate-900">{COPY.title[l]}</h1>
            <p className="mt-2 text-sm text-slate-500">{COPY.lead[l]}</p>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-white p-7 shadow-xl shadow-slate-900/5 sm:p-9">
            {children}
          </div>

          <p className="mt-6 text-center text-xs text-slate-400">
            {COPY.restricted[l]}
          </p>
        </div>
      </main>
    </div>
  );
}
