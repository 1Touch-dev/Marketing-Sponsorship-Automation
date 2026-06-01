/**
 * Proposal image assets — shared parsing and grouping for landing + admin UI.
 */

import { JERSEY_PLACEMENTS, type JerseyPlacementId } from "@/lib/media/jersey-placements";

export type ProposalImageAsset = {
  id: string;
  url: string;
  job_type: string;
  prompt?: string | null;
  status?: string;
  strategy_variant_id?: string | null;
  strategy_label?: string | null;
  placement_zone?: string | null;
  inventory_label?: string | null;
  display_label?: string | null;
  output_urls?: Array<{ url?: string; index?: number }>;
  selected_url?: string | null;
};

export type ImageJobRow = {
  id: string;
  job_type: string;
  prompt?: string | null;
  status?: string;
  output_urls?: Array<{ url?: string; index?: number }> | null;
  selected_url?: string | null;
  strategy_variant_id?: string | null;
  strategy_label?: string | null;
  placement_zone?: string | null;
  inventory_label?: string | null;
  display_label?: string | null;
};

export function resolveJobImageUrl(job: ImageJobRow): string | null {
  if (job.selected_url && !job.selected_url.startsWith("data:")) return job.selected_url;
  const urls = job.output_urls ?? [];
  for (const u of urls) {
    if (u?.url && !u.url.startsWith("data:")) return u.url;
  }
  return null;
}

export function buildProposalImagesFromJobs(jobs: ImageJobRow[]): ProposalImageAsset[] {
  const out: ProposalImageAsset[] = [];
  for (const job of jobs) {
    const url = resolveJobImageUrl(job);
    if (!url) continue;
    out.push({
      id: job.id,
      url,
      job_type: job.job_type,
      prompt: job.prompt,
      status: job.status,
      strategy_variant_id: job.strategy_variant_id,
      strategy_label: job.strategy_label,
      placement_zone: job.placement_zone,
      inventory_label: job.inventory_label,
      display_label: job.display_label,
      output_urls: job.output_urls ?? undefined,
      selected_url: job.selected_url,
    });
  }
  return out;
}

export function isJerseyImage(img: ProposalImageAsset): boolean {
  return img.job_type.includes("jersey");
}

export function isCampaignImage(img: ProposalImageAsset): boolean {
  return (
    img.job_type === "campaign_creative" ||
    Boolean(img.strategy_label || img.strategy_variant_id)
  );
}

export function isInventoryImage(img: ProposalImageAsset): boolean {
  if (isJerseyImage(img)) return true;
  if (img.inventory_label) return true;
  return ["led_board", "stadium_banner", "social_post", "press_backdrop", "scoreboard"].some((t) =>
    img.job_type.includes(t)
  );
}

export type GroupedProposalImages = {
  campaign: ProposalImageAsset[];
  inventory: ProposalImageAsset[];
  other: ProposalImageAsset[];
};

export function groupProposalImages(images: ProposalImageAsset[]): GroupedProposalImages {
  const campaign: ProposalImageAsset[] = [];
  const inventory: ProposalImageAsset[] = [];
  const other: ProposalImageAsset[] = [];

  for (const img of images) {
    if (isCampaignImage(img) && !isJerseyImage(img)) {
      campaign.push(img);
    } else if (isInventoryImage(img)) {
      inventory.push(img);
    } else {
      other.push(img);
    }
  }

  return { campaign, inventory, other };
}

export const INVENTORY_ASSIGN_OPTIONS = [
  { id: "jersey_chest", label: "Camisa — Peito principal" },
  { id: "jersey_sleeve", label: "Camisa — Manga" },
  { id: "jersey_back", label: "Camisa — Costas" },
  { id: "led_board", label: "LED Couto Pereira" },
  { id: "stadium_banner", label: "Banner estádio" },
  { id: "social_media", label: "Redes sociais" },
  { id: "vip_hospitality", label: "Hospitality / VIP" },
  { id: "other", label: "Outro inventário" },
] as const;

const JOB_TYPE_LABELS: Record<string, string> = {
  campaign_creative: "Campanha criativa",
  jersey_mockup: "Mockup da camisa",
  jersey_mockup_official: "Mockup oficial da camisa",
  led_board: "LED Couto Pereira",
  stadium_banner: "Banner estádio",
  social_post: "Redes sociais",
  press_backdrop: "Backdrop imprensa",
  scoreboard: "Painel LED",
};

/** Human-readable caption for landing, bulk approve, and image manager. */
export function resolveProposalImageLabel(
  img: Pick<
    ProposalImageAsset,
    "display_label" | "placement_zone" | "inventory_label" | "strategy_label" | "job_type"
  >
): string {
  const isJersey = img.job_type.includes("jersey");
  const placement = img.placement_zone as JerseyPlacementId | null | undefined;
  if (isJersey || placement) {
    const pt = placement
      ? JERSEY_PLACEMENTS.find((p) => p.id === placement)?.labelPt
      : null;
    if (pt) return `Camisa — ${pt}`;
  }

  if (img.strategy_label?.trim()) {
    return `Campanha — ${img.strategy_label.trim()}`;
  }

  if (img.inventory_label) {
    const inv = INVENTORY_ASSIGN_OPTIONS.find((o) => o.id === img.inventory_label);
    if (inv) return inv.label;
  }

  if (img.display_label) {
    const legacy = img.display_label.match(/^Camisa — ([\w_]+)$/);
    if (legacy) {
      const pt = JERSEY_PLACEMENTS.find((p) => p.id === legacy[1])?.labelPt;
      if (pt) return `Camisa — ${pt}`;
    }
    return img.display_label;
  }

  return JOB_TYPE_LABELS[img.job_type] ?? img.job_type.replace(/_/g, " ");
}
