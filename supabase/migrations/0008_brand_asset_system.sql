-- Migration 0008: Brand Asset System for Coritiba FC
-- Creates a reusable brand/reference asset framework for:
--   - Coritiba FC brand guidelines
--   - Jersey templates
--   - Sponsor placement zones
--   - Visual references
--   - Reusable social layouts
-- 
-- NO AI rendering pipeline yet — just structured schema + storage org.

-- ---------------------------------------------------------------------------
-- brand_asset_packs: top-level groupings of brand assets
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS brand_asset_packs (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name          TEXT NOT NULL,               -- e.g. "Coritiba FC Brand 2025"
  description   TEXT,
  club          TEXT NOT NULL DEFAULT 'Coritiba FC',
  season        TEXT,                         -- e.g. "2025", "2025/26"
  asset_type    TEXT NOT NULL,               -- 'brand_guidelines' | 'jersey_templates' | 'visual_references' | 'social_layouts' | 'sponsor_placement'
  status        TEXT NOT NULL DEFAULT 'active',  -- 'active' | 'archived'
  metadata      JSONB DEFAULT '{}',
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------------------------
-- brand_assets: individual asset items within a pack
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS brand_assets (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  pack_id         UUID REFERENCES brand_asset_packs(id) ON DELETE CASCADE,
  name            TEXT NOT NULL,
  description     TEXT,
  asset_category  TEXT NOT NULL,            -- 'jersey' | 'banner' | 'led_board' | 'social_template' | 'logo_placement' | 'color_palette' | 'typography' | 'sponsor_zone'
  
  -- File references (Supabase storage paths or external URLs)
  file_path       TEXT,                     -- storage path e.g. "brand-assets/coritiba/jersey-home-2025.png"
  thumbnail_path  TEXT,
  external_url    TEXT,
  
  -- Visual generation integration
  ai_prompt       TEXT,                     -- reusable AI image prompt for this asset type
  style_notes     TEXT,                     -- visual style guidance
  aspect_ratio    TEXT DEFAULT '1:1',
  
  -- Sponsor placement zones (for jersey/stadium templates)
  placement_zones JSONB DEFAULT '[]',       -- [{zone_id, zone_name, dimensions, position_notes}]
  
  -- Brand specs
  brand_specs     JSONB DEFAULT '{}',       -- {colors, fonts, sizes, guidelines}
  
  tags            TEXT[] DEFAULT '{}',
  sort_order      INT DEFAULT 0,
  status          TEXT NOT NULL DEFAULT 'active',
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------------------------
-- Seed: Coritiba FC core brand reference packs
-- ---------------------------------------------------------------------------
INSERT INTO brand_asset_packs (name, description, club, season, asset_type, metadata) VALUES
(
  'Coritiba FC Brand Identity 2025',
  'Core brand guidelines for Coritiba FC — colors, typography, logo usage rules',
  'Coritiba FC',
  '2025',
  'brand_guidelines',
  '{"primary_colors": ["#006400", "#FFFFFF"], "accent_colors": ["#000000"], "logo_versions": ["primary", "horizontal", "icon"], "font_primary": "Helvetica Neue", "font_secondary": "Arial"}'
),
(
  'Couto Pereira Sponsor Placement Zones',
  'Official sponsor placement inventory at Estádio Major Antônio Couto Pereira',
  'Coritiba FC',
  '2025',
  'sponsor_placement',
  '{"stadium": "Couto Pereira", "capacity": 40502, "zones": ["perimeter_led", "giant_scoreboard", "jersey_front", "jersey_sleeve", "jersey_back", "warmup_kit", "training_kit", "press_backdrop", "vip_area"]}'
),
(
  'Coritiba FC Jersey Templates 2025',
  'Home and away kit templates for sponsor logo placement mockups',
  'Coritiba FC',
  '2025',
  'jersey_templates',
  '{"home_kit": {"primary": "#006400", "secondary": "#FFFFFF", "trim": "#000000"}, "away_kit": {"primary": "#FFFFFF", "secondary": "#006400", "trim": "#000000"}}'
),
(
  'Coritiba FC Social Media Templates',
  'Reusable social media layout templates — Instagram, Stories, TikTok',
  'Coritiba FC',
  '2025',
  'social_layouts',
  '{"platforms": ["instagram_feed", "instagram_story", "tiktok", "twitter_x", "youtube_thumbnail"], "brand_colors_used": true}'
),
(
  'Coritiba FC Visual Reference Library',
  'Reference image concepts for AI visual prompt generation',
  'Coritiba FC',
  '2025',
  'visual_references',
  '{"reference_types": ["matchday", "training", "fan_zone", "stadium_wide", "aerial_couto_pereira", "player_action"]}'
)
ON CONFLICT DO NOTHING;

-- Seed brand_assets for Couto Pereira placement zones
DO $$
DECLARE
  pack_id UUID;
BEGIN
  SELECT id INTO pack_id FROM brand_asset_packs WHERE asset_type = 'sponsor_placement' AND club = 'Coritiba FC' LIMIT 1;
  
  IF pack_id IS NOT NULL THEN
    INSERT INTO brand_assets (pack_id, name, description, asset_category, ai_prompt, style_notes, aspect_ratio, placement_zones, brand_specs, sort_order) VALUES
    (
      pack_id,
      'Perimeter LED Boards — Couto Pereira',
      'LED perimeter advertising boards around the Couto Pereira pitch',
      'led_board',
      'Couto Pereira stadium pitch-side LED advertising board showing sponsor logo, green and white Coritiba FC branding visible in background, professional sports photography, photorealistic',
      'Wide format 16:3 ratio, high brightness LED display, green Coritiba FC pitch in background',
      '16:3',
      '[{"zone_id": "led_perimeter", "zone_name": "Perimeter LED Board", "dimensions": "5m × 1m (standard unit)", "position_notes": "Pitch-side, broadcast visible, TV exposure during all home matches"}]',
      '{"exposure": "national_broadcast", "matches_per_season": 20, "format": "static_or_animated"}',
      1
    ),
    (
      pack_id,
      'Jersey Front Placement',
      'Primary jersey chest sponsor placement — highest visibility',
      'jersey',
      'Coritiba FC green and white jersey, sponsor logo prominently placed on chest, clean white Coxa-Branca kit, photorealistic product photography, premium sportswear aesthetic',
      'Vertical format, jersey laid flat or worn, clean background, green and white Coritiba colors',
      '3:4',
      '[{"zone_id": "jersey_chest", "zone_name": "Jersey Chest (Primary Sponsor)", "dimensions": "20cm × 10cm", "position_notes": "Center chest, highest visibility for broadcast and photography"}]',
      '{"exposure": "broadcast_and_matchday", "kit_versions": ["home", "away"], "note": "Premier sponsor position"}',
      2
    ),
    (
      pack_id,
      'Stadium Giant Scoreboard',
      'Couto Pereira giant scoreboard sponsor branding',
      'banner',
      'Couto Pereira stadium interior showing giant scoreboard with sponsor advertisement, Coritiba FC crowd in green and white in background, dramatic stadium lighting, wide angle',
      'Landscape stadium photography, dramatic lighting, crowd atmosphere',
      '16:9',
      '[{"zone_id": "scoreboard", "zone_name": "Giant Scoreboard", "dimensions": "Large format display", "position_notes": "Visible from all seating areas, shown between plays"}]',
      '{"exposure": "in_stadium", "format": "static_or_video", "visibility": "all_seating_areas"}',
      3
    ),
    (
      pack_id,
      'Press Backdrop / Flash Interview Zone',
      'Sponsor branding on Coritiba FC press conference and interview backdrop',
      'banner',
      'Coritiba FC press conference backdrop with Coritiba FC and sponsor co-branding, green and white pattern, professional news photography setting, players or staff in foreground',
      'Step-and-repeat banner format, alternating Coritiba FC and sponsor logos',
      '16:9',
      '[{"zone_id": "press_backdrop", "zone_name": "Press Conference Backdrop", "dimensions": "4m × 2m", "position_notes": "Used for all post-match interviews, press conferences, media days — high TV/social media exposure"}]',
      '{"exposure": "media_and_social", "usage": "all_press_events"}',
      4
    )
    ON CONFLICT DO NOTHING;
  END IF;
END $$;

-- Seed brand_assets for social templates
DO $$
DECLARE
  pack_id UUID;
BEGIN
  SELECT id INTO pack_id FROM brand_asset_packs WHERE asset_type = 'social_layouts' AND club = 'Coritiba FC' LIMIT 1;
  
  IF pack_id IS NOT NULL THEN
    INSERT INTO brand_assets (pack_id, name, description, asset_category, ai_prompt, style_notes, aspect_ratio, brand_specs, sort_order) VALUES
    (
      pack_id,
      'Instagram Feed — Sponsor Activation Post',
      'Reusable Instagram feed post template for sponsor activation announcements',
      'social_template',
      'Coritiba FC Instagram post announcing new sponsor partnership, Verde e Branco green and white color scheme, sponsor logo and Coritiba FC crest side by side, dynamic sports typography, modern social media design',
      'Square format, bold typography, green (#006400) and white dominant colors, Coritiba FC crest prominent',
      '1:1',
      '{"platform": "instagram_feed", "dimensions": "1080×1080px", "cta_zone": true, "logo_zones": ["top_left_coritiba", "center_sponsor"]}',
      1
    ),
    (
      pack_id,
      'Instagram Story — Matchday Sponsor',
      'Instagram Story template for matchday sponsor activation',
      'social_template',
      'Coritiba FC Instagram Story matchday activation, sponsor logo prominently placed, countdown or match details, Couto Pereira stadium in background, Coxa-Branca green and white energy, vertical format',
      'Vertical story format, 9:16, energetic matchday feel, green and white gradient',
      '9:16',
      '{"platform": "instagram_story", "dimensions": "1080×1920px", "swipe_up_zone": true, "sponsor_zone": "lower_third"}',
      2
    ),
    (
      pack_id,
      'YouTube Thumbnail — Sponsor Partnership Announcement',
      'YouTube thumbnail for announcing a new Coritiba FC partnership',
      'social_template',
      'YouTube thumbnail: "Nova Parceria" Coritiba FC partnership announcement, Coxa-Branca player with trophy or crest, sponsor logo integration, bold red/green contrast, professional YouTube thumbnail style',
      '16:9, bold clickbait-appropriate styling, large text, faces/players if possible',
      '16:9',
      '{"platform": "youtube_thumbnail", "dimensions": "1280×720px", "text_area": true}',
      3
    )
    ON CONFLICT DO NOTHING;
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- Indexes
-- ---------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_brand_asset_packs_asset_type ON brand_asset_packs(asset_type);
CREATE INDEX IF NOT EXISTS idx_brand_asset_packs_status ON brand_asset_packs(status);
CREATE INDEX IF NOT EXISTS idx_brand_assets_pack_id ON brand_assets(pack_id);
CREATE INDEX IF NOT EXISTS idx_brand_assets_asset_category ON brand_assets(asset_category);
CREATE INDEX IF NOT EXISTS idx_brand_assets_status ON brand_assets(status);

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------
ALTER TABLE brand_asset_packs ENABLE ROW LEVEL SECURITY;
ALTER TABLE brand_assets ENABLE ROW LEVEL SECURITY;

-- Service role bypass (same pattern as rest of schema)
DROP POLICY IF EXISTS "service_role_all_brand_asset_packs" ON brand_asset_packs;
CREATE POLICY "service_role_all_brand_asset_packs" ON brand_asset_packs
  FOR ALL TO service_role USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "service_role_all_brand_assets" ON brand_assets;
CREATE POLICY "service_role_all_brand_assets" ON brand_assets
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- Authenticated read
DROP POLICY IF EXISTS "auth_read_brand_asset_packs" ON brand_asset_packs;
CREATE POLICY "auth_read_brand_asset_packs" ON brand_asset_packs
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "auth_read_brand_assets" ON brand_assets;
CREATE POLICY "auth_read_brand_assets" ON brand_assets
  FOR SELECT TO authenticated USING (true);

-- ---------------------------------------------------------------------------
-- Updated_at trigger
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS set_updated_at_brand_asset_packs ON brand_asset_packs;
CREATE TRIGGER set_updated_at_brand_asset_packs
  BEFORE UPDATE ON brand_asset_packs
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS set_updated_at_brand_assets ON brand_assets;
CREATE TRIGGER set_updated_at_brand_assets
  BEFORE UPDATE ON brand_assets
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
