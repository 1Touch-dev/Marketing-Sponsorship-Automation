"use client";

import React from "react";
import {
  groupProposalImages,
  type ProposalImageAsset,
} from "@/lib/proposals/proposal-images";
import type { StrategyVariant } from "@/lib/ai/schemas";

function ImageCard({ img, caption }: { img: ProposalImageAsset; caption?: string }) {
  return (
    <figure className="rounded-xl overflow-hidden border border-slate-200 bg-white shadow-sm">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={img.url}
        alt={caption ?? img.display_label ?? "Visual da proposta"}
        className="w-full object-cover"
        style={{ maxHeight: 320 }}
      />
      <figcaption className="px-4 py-3 border-t border-slate-100">
        <p className="text-sm font-semibold text-slate-800">
          {img.display_label ||
            img.strategy_label ||
            img.inventory_label?.replace(/_/g, " ") ||
            img.job_type.replace(/_/g, " ")}
        </p>
        {caption && <p className="text-xs text-slate-500 mt-1">{caption}</p>}
      </figcaption>
    </figure>
  );
}

export function ProposalLandingVisuals({
  images,
  strategies,
  companyName,
}: {
  images: ProposalImageAsset[];
  strategies?: StrategyVariant[] | null;
  companyName: string;
}) {
  if (images.length === 0) return null;

  const { campaign, inventory } = groupProposalImages(images);

  return (
    <div className="max-w-5xl mx-auto px-0">
      {campaign.length > 0 && (
        <section className="py-12 border-t border-slate-100">
          <div className="mb-6">
            <span className="text-xs font-semibold uppercase tracking-wider text-green-700">
              Campanhas propostas
            </span>
            <h2 className="text-2xl font-bold text-slate-900 mt-1">
              Ativações para {companyName}
            </h2>
            <p className="text-sm text-slate-500 mt-1 max-w-2xl">
              Conceitos visuais das estratégias de marketing apresentadas nesta parceria.
            </p>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {campaign.map((img) => {
              const strat = strategies?.find(
                (s) => s.id === img.strategy_variant_id || s.label === img.strategy_label
              );
              return (
                <ImageCard
                  key={img.id}
                  img={img}
                  caption={strat?.tagline ?? strat?.description?.slice(0, 120)}
                />
              );
            })}
          </div>
        </section>
      )}

      {inventory.length > 0 && (
        <section className="py-12 border-t border-slate-100">
          <div className="mb-6">
            <span className="text-xs font-semibold uppercase tracking-wider text-green-700">
              Inventário de patrocínio
            </span>
            <h2 className="text-2xl font-bold text-slate-900 mt-1">
              Onde sua marca aparece
            </h2>
            <p className="text-sm text-slate-500 mt-1 max-w-2xl">
              Peito da camisa, estádio, digital e demais ativos incluídos na proposta.
            </p>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {inventory.map((img) => (
              <ImageCard key={img.id} img={img} />
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
