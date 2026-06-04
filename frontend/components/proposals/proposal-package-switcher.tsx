"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";

export type LandingPackage = {
  id: string;
  name: string;
  description: string | null;
  price_brl: number | null;
  benefits: string[];
  inventory_items?: Record<string, unknown>[];
};

function formatBRL(value: number) {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
    maximumFractionDigits: 0,
  }).format(value);
}

export function ProposalPackageSwitcher({
  packages,
  children,
}: {
  packages: LandingPackage[];
  children: (active: LandingPackage) => React.ReactNode;
}) {
  const [activeId, setActiveId] = useState(packages[0]?.id ?? "");

  if (packages.length === 0) return <>{children(null as unknown as LandingPackage)}</>;

  const active = packages.find((p) => p.id === activeId) ?? packages[0];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap justify-center gap-2 print:hidden">
        {packages.map((pkg) => (
          <button
            key={pkg.id}
            type="button"
            onClick={() => setActiveId(pkg.id)}
            className={cn(
              "px-5 py-2.5 rounded-full text-sm font-bold transition-all border-2",
              active.id === pkg.id
                ? "bg-[#006B3F] text-white border-[#006B3F] shadow-lg scale-105"
                : "bg-white text-slate-700 border-slate-200 hover:border-[#006B3F]/50"
            )}
          >
            {pkg.name}
            {pkg.price_brl != null && (
              <span className="ml-2 font-normal opacity-90">
                {formatBRL(pkg.price_brl)}
              </span>
            )}
          </button>
        ))}
      </div>

      {active.description && (
        <p className="text-center text-slate-600 max-w-2xl mx-auto text-sm md:text-base">
          {active.description}
        </p>
      )}

      {active.benefits.length > 0 && (
        <div className="max-w-2xl mx-auto rounded-xl border border-green-100 bg-green-50/50 p-5">
          <p className="text-xs font-bold uppercase tracking-wide text-[#006B3F] mb-3 text-center">
            Benefícios — Pacote {active.name}
          </p>
          <ul className="space-y-2">
            {active.benefits.map((b, i) => (
              <li key={i} className="flex items-start gap-2 text-sm text-slate-700">
                <span className="text-[#006B3F] font-bold">✓</span>
                {b}
              </li>
            ))}
          </ul>
        </div>
      )}

      {children(active)}
    </div>
  );
}
