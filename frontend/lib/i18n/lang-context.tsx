"use client";
import React, { createContext, useContext, useState, useEffect } from "react";

type Lang = "pt" | "en";

const LangContext = createContext<{
  lang: Lang;
  toggle: () => void;
}>({ lang: "pt", toggle: () => {} });

export function LangProvider({ children }: { children: React.ReactNode }) {
  const [lang, setLang] = useState<Lang>("pt");

  useEffect(() => {
    const stored = localStorage.getItem("msa_lang") as Lang | null;
    if (stored === "en" || stored === "pt") setLang(stored);
  }, []);

  const toggle = () => {
    setLang((prev) => {
      const next: Lang = prev === "pt" ? "en" : "pt";
      localStorage.setItem("msa_lang", next);
      return next;
    });
  };

  return <LangContext.Provider value={{ lang, toggle }}>{children}</LangContext.Provider>;
}

export function useLang() {
  return useContext(LangContext);
}

// Simple translation helper
export const T: Record<string, Record<Lang, string>> = {
  "Companies": { pt: "Empresas", en: "Companies" },
  "Proposals": { pt: "Propostas", en: "Proposals" },
  "Dashboard": { pt: "Dashboard", en: "Dashboard" },
  "Contacts": { pt: "Contatos", en: "Contacts" },
  "Pipeline": { pt: "Pipeline", en: "Pipeline" },
  "Sponsor Reports": { pt: "Relatórios", en: "Sponsor Reports" },
  "New Proposal": { pt: "Nova Proposta", en: "New Proposal" },
  "Campaigns": { pt: "Campanhas", en: "Campaigns" },
  "Bulk Campaigns": { pt: "Campanha em Massa", en: "Bulk Campaigns" },
  "Bulk Approve": { pt: "Aprovação em Massa", en: "Bulk Approve" },
  "Approvals": { pt: "Aprovações", en: "Approvals" },
  "Emails": { pt: "E-mails", en: "Emails" },
  "Email Templates": { pt: "Modelos de E-mail", en: "Email Templates" },
  "Newsletter": { pt: "Newsletter", en: "Newsletter" },
  "Threads": { pt: "Conversas", en: "Threads" },
  "Follow-ups": { pt: "Follow-ups", en: "Follow-ups" },
  "Contracts": { pt: "Contratos", en: "Contracts" },
  "Coritiba Intel": { pt: "Intel Coritiba", en: "Coritiba Intel" },
  "Inventory": { pt: "Inventário", en: "Inventory" },
  "Barter / Procurement": { pt: "Permuta / Compras", en: "Barter / Procurement" },
  "Lei de Incentivo": { pt: "Lei de Incentivo", en: "Tax Incentive Law" },
  "Brand Assets": { pt: "Ativos da Marca", en: "Brand Assets" },
  "AI Image Gen": { pt: "IA Geração de Imagens", en: "AI Image Gen" },
  "Mockup Editor": { pt: "Editor de Mockup", en: "Mockup Editor" },
  "Asset Library": { pt: "Biblioteca de Mídia", en: "Asset Library" },
  "CRM Sync": { pt: "Sync CRM", en: "CRM Sync" },
  "Workflows": { pt: "Fluxos de Trabalho", en: "Workflows" },
  "Audit": { pt: "Auditoria", en: "Audit" },
  "Maintenance": { pt: "Manutenção", en: "Maintenance" },
  "Settings": { pt: "Configurações", en: "Settings" },
  "Team & Roles": { pt: "Equipe & Perfis", en: "Team & Roles" },
  "Intelligence": { pt: "Inteligência", en: "Intelligence" },
  "Sender Profiles": { pt: "Perfis de Envio", en: "Sender Profiles" },
  "Matches": { pt: "Jogos", en: "Matches" },
  "Warm-up Strategies": { pt: "Estratégias de Aquecimento", en: "Warm-up Strategies" },
};

export function t(key: string, lang: Lang): string {
  return T[key]?.[lang] ?? key;
}
