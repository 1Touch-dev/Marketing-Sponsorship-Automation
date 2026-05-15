import { supabaseAdmin } from "@/lib/supabase/server";
import { PageHeader } from "@/components/shared/page-header";
import {
  Shield, Shirt, Layout, Image, MapPin, Package,
  Info, ExternalLink, Tag, Copy,
} from "lucide-react";

export const dynamic = "force-dynamic";

const ASSET_TYPE_META: Record<string, { label: string; icon: typeof Shield; color: string; description: string }> = {
  brand_guidelines: {
    label: "Brand Guidelines",
    icon: Shield,
    color: "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300",
    description: "Coritiba FC colors, typography, logo usage rules",
  },
  sponsor_placement: {
    label: "Sponsor Placement Zones",
    icon: MapPin,
    color: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300",
    description: "Official inventory zones at Couto Pereira",
  },
  jersey_templates: {
    label: "Jersey Templates",
    icon: Shirt,
    color: "bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300",
    description: "Home and away kit templates for sponsor mockups",
  },
  social_layouts: {
    label: "Social Media Layouts",
    icon: Layout,
    color: "bg-pink-100 text-pink-700 dark:bg-pink-900/30 dark:text-pink-300",
    description: "Reusable Instagram, Story, TikTok, YouTube templates",
  },
  visual_references: {
    label: "Visual References",
    icon: Image,
    color: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300",
    description: "Reference concepts for AI visual prompt generation",
  },
};

const CATEGORY_ICONS: Record<string, typeof Shield> = {
  jersey: Shirt,
  banner: Layout,
  led_board: Package,
  social_template: Layout,
  logo_placement: MapPin,
  color_palette: Shield,
  sponsor_zone: MapPin,
};

type BrandAsset = {
  id: string;
  name: string;
  description: string | null;
  asset_category: string;
  ai_prompt: string | null;
  style_notes: string | null;
  aspect_ratio: string | null;
  placement_zones: Array<{ zone_id: string; zone_name: string; dimensions: string; position_notes: string }> | null;
  brand_specs: Record<string, unknown> | null;
  sort_order: number;
};

type BrandAssetPack = {
  id: string;
  name: string;
  description: string | null;
  asset_type: string;
  season: string | null;
  metadata: Record<string, unknown> | null;
  brand_assets: BrandAsset[];
};

export default async function BrandAssetsPage() {
  const sb = supabaseAdmin();

  const { data: packs, error } = await sb
    .from("brand_asset_packs")
    .select("*, brand_assets(*)")
    .eq("status", "active")
    .eq("club", "Coritiba FC")
    .order("created_at", { ascending: true })
    .limit(20);

  const migrationNeeded = error?.code === "42P01";

  return (
    <>
      <PageHeader
        title="Brand & Asset Library"
        description="Coritiba FC reusable brand assets, sponsor placement zones, and visual templates"
      />

      {/* Status banner */}
      <div className="mb-6 flex items-start gap-3 p-4 rounded-xl bg-gradient-to-r from-green-50 to-white dark:from-green-900/20 dark:to-transparent border border-green-200 dark:border-green-800">
        <Shield className="h-5 w-5 text-green-600 mt-0.5 flex-shrink-0" />
        <div>
          <div className="font-semibold text-green-800 dark:text-green-200">
            Coritiba FC Brand Asset System
          </div>
          <div className="text-sm text-green-700 dark:text-green-300 mt-0.5">
            Structured reference framework for Couto Pereira sponsor placement, Verde e Branco brand guidelines,
            jersey templates, and social media layouts. AI visual generation pipeline will connect to these assets in a future phase.
          </div>
        </div>
      </div>

      {migrationNeeded && (
        <div className="mb-6 flex items-start gap-3 p-4 rounded-xl bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800">
          <Info className="h-5 w-5 text-amber-600 mt-0.5 flex-shrink-0" />
          <div>
            <div className="font-semibold text-amber-800 dark:text-amber-200">Migration required</div>
            <div className="text-sm text-amber-700 dark:text-amber-300 mt-0.5">
              Apply <code className="font-mono bg-amber-100 dark:bg-amber-900/50 px-1 rounded">0008_brand_asset_system.sql</code> to your Supabase project to enable the brand asset library.
            </div>
          </div>
        </div>
      )}

      {!migrationNeeded && (!packs || packs.length === 0) && (
        <div className="flex items-start gap-3 p-4 rounded-xl bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 mb-6">
          <Info className="h-5 w-5 text-blue-600 mt-0.5" />
          <div className="text-sm text-blue-700 dark:text-blue-300">
            Migration applied but no packs found. The seed data may need to be re-run.
          </div>
        </div>
      )}

      {/* Asset packs grid */}
      <div className="space-y-8">
        {(packs ?? []).map((pack) => {
          const typedPack = pack as unknown as BrandAssetPack;
          const meta = ASSET_TYPE_META[typedPack.asset_type];
          const Icon = meta?.icon ?? Package;

          return (
            <div key={typedPack.id} className="border rounded-xl overflow-hidden">
              {/* Pack header */}
              <div className="flex items-start gap-4 p-5 bg-muted/30 border-b">
                <div className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 ${meta?.color ?? "bg-gray-100 text-gray-600"}`}>
                  <Icon className="h-5 w-5" />
                </div>
                <div className="flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <h2 className="font-semibold">{typedPack.name}</h2>
                    {typedPack.season && (
                      <span className="text-xs bg-background border px-2 py-0.5 rounded-full">
                        {typedPack.season}
                      </span>
                    )}
                    {meta && (
                      <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${meta.color}`}>
                        {meta.label}
                      </span>
                    )}
                  </div>
                  {typedPack.description && (
                    <p className="text-sm text-muted-foreground mt-0.5">{typedPack.description}</p>
                  )}
                  {typedPack.metadata && Object.keys(typedPack.metadata).length > 0 && (
                    <div className="mt-2 flex flex-wrap gap-2">
                      {Object.entries(typedPack.metadata).slice(0, 4).map(([k, v]) => (
                        <span key={k} className="text-xs bg-background border px-2 py-0.5 rounded-md">
                          <span className="text-muted-foreground">{k}: </span>
                          <span className="font-medium">
                            {Array.isArray(v) ? v.join(", ") : String(v)}
                          </span>
                        </span>
                      ))}
                    </div>
                  )}
                </div>
                <span className="text-xs text-muted-foreground flex-shrink-0">
                  {typedPack.brand_assets.length} asset{typedPack.brand_assets.length !== 1 ? "s" : ""}
                </span>
              </div>

              {/* Assets grid */}
              {typedPack.brand_assets.length > 0 && (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 p-5">
                  {typedPack.brand_assets
                    .sort((a, b) => a.sort_order - b.sort_order)
                    .map((asset) => {
                      const AssetIcon = CATEGORY_ICONS[asset.asset_category] ?? Package;
                      return (
                        <AssetCard key={asset.id} asset={asset} AssetIcon={AssetIcon} />
                      );
                    })}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Architecture note */}
      <div className="mt-10 p-5 rounded-xl border bg-muted/30">
        <h3 className="font-semibold mb-2 flex items-center gap-2">
          <Info className="h-4 w-4 text-muted-foreground" />
          Architecture & Future Integration
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm text-muted-foreground">
          <div>
            <div className="font-medium text-foreground mb-1">Current: Schema Layer</div>
            <ul className="space-y-1 text-xs">
              <li>✓ Brand asset packs defined</li>
              <li>✓ Couto Pereira placement zones catalogued</li>
              <li>✓ AI prompt templates stored per asset</li>
              <li>✓ RLS + audit-ready structure</li>
            </ul>
          </div>
          <div>
            <div className="font-medium text-foreground mb-1">Phase 2: File Storage</div>
            <ul className="space-y-1 text-xs">
              <li>◯ Supabase Storage integration</li>
              <li>◯ Upload Coritiba brand files</li>
              <li>◯ Jersey/banner template images</li>
              <li>◯ Thumbnail generation</li>
            </ul>
          </div>
          <div>
            <div className="font-medium text-foreground mb-1">Phase 3: AI Rendering</div>
            <ul className="space-y-1 text-xs">
              <li>◯ DALL-E / Midjourney integration</li>
              <li>◯ Automatic sponsor logo placement</li>
              <li>◯ AI mockup generation pipeline</li>
              <li>◯ Proposal visual auto-generation</li>
            </ul>
          </div>
        </div>
      </div>
    </>
  );
}

function AssetCard({
  asset,
  AssetIcon,
}: {
  asset: BrandAsset;
  AssetIcon: typeof Shield;
}) {
  return (
    <div className="border rounded-lg p-4 space-y-3 hover:border-primary/30 hover:bg-accent/30 transition-all">
      <div className="flex items-start gap-3">
        <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center flex-shrink-0">
          <AssetIcon className="h-4 w-4 text-primary" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="font-medium text-sm">{asset.name}</div>
          {asset.description && (
            <div className="text-xs text-muted-foreground mt-0.5">{asset.description}</div>
          )}
        </div>
        <div className="flex items-center gap-1.5 flex-shrink-0">
          <span className="text-xs bg-muted px-2 py-0.5 rounded-full font-mono">
            {asset.aspect_ratio ?? "1:1"}
          </span>
        </div>
      </div>

      {/* Category tag */}
      <div className="flex flex-wrap gap-1.5">
        <span className="inline-flex items-center gap-1 text-xs bg-muted px-2 py-0.5 rounded-full">
          <Tag className="h-2.5 w-2.5" />
          {asset.asset_category.replace(/_/g, " ")}
        </span>
      </div>

      {/* Placement zones */}
      {asset.placement_zones && asset.placement_zones.length > 0 && (
        <div className="space-y-1.5">
          {asset.placement_zones.map((zone) => (
            <div key={zone.zone_id} className="text-xs bg-muted/50 rounded-md p-2">
              <div className="font-medium">{zone.zone_name}</div>
              {zone.dimensions && (
                <div className="text-muted-foreground">Size: {zone.dimensions}</div>
              )}
              {zone.position_notes && (
                <div className="text-muted-foreground mt-0.5">{zone.position_notes}</div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* AI prompt (collapsed preview) */}
      {asset.ai_prompt && (
        <details className="text-xs">
          <summary className="cursor-pointer text-muted-foreground hover:text-foreground flex items-center gap-1 select-none">
            <Copy className="h-3 w-3" /> AI generation prompt
          </summary>
          <div className="mt-1.5 p-2 rounded bg-muted/50 font-mono text-muted-foreground leading-relaxed">
            {asset.ai_prompt}
          </div>
          {asset.style_notes && (
            <div className="mt-1 text-muted-foreground/80 italic">{asset.style_notes}</div>
          )}
        </details>
      )}

      {/* Brand specs */}
      {asset.brand_specs && Object.keys(asset.brand_specs).length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {Object.entries(asset.brand_specs).slice(0, 3).map(([k, v]) => (
            <span key={k} className="text-xs bg-background border px-2 py-0.5 rounded-md">
              <span className="text-muted-foreground">{k}: </span>
              <span>{String(v)}</span>
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
