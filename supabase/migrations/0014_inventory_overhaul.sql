-- Migration 0014: Inventory overhaul — individual units, adjustable slots, quantity tracking, size-based pricing
-- Run this in Supabase SQL Editor

-- 1. Add new columns to inventory_items
ALTER TABLE inventory_items
  ADD COLUMN IF NOT EXISTS total_quantity      INTEGER     DEFAULT 1,
  ADD COLUMN IF NOT EXISTS quantity_sold       INTEGER     DEFAULT 0,
  ADD COLUMN IF NOT EXISTS quantity_reserved   INTEGER     DEFAULT 0,
  ADD COLUMN IF NOT EXISTS unit_type           TEXT        DEFAULT 'per_season',
  ADD COLUMN IF NOT EXISTS slot_duration_sec   INTEGER     NULL,
  ADD COLUMN IF NOT EXISTS slot_timing         TEXT        NULL,
  ADD COLUMN IF NOT EXISTS price_small         NUMERIC     NULL,
  ADD COLUMN IF NOT EXISTS price_medium        NUMERIC     NULL,
  ADD COLUMN IF NOT EXISTS price_large         NUMERIC     NULL,
  ADD COLUMN IF NOT EXISTS price_enterprise    NUMERIC     NULL,
  ADD COLUMN IF NOT EXISTS is_exclusive        BOOLEAN     DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS notes               TEXT        NULL;

-- 2. Remove duplicates — keep only one of each name
DELETE FROM inventory_items a
USING inventory_items b
WHERE a.id < b.id
  AND a.name = b.name;

-- 3. Seed clean, canonical inventory items
-- First clear what's there and re-seed properly
TRUNCATE inventory_items RESTART IDENTITY CASCADE;

INSERT INTO inventory_items (
  name, description, inventory_type, category,
  total_quantity, unit_type, slot_duration_sec, slot_timing,
  price_min, price_max, price_small, price_medium, price_large, price_enterprise,
  currency, availability, is_exclusive, exposure_reach,
  sort_order, status
) VALUES

-- ── JERSEY ────────────────────────────────────────────────────────────────
(
  'Jersey Front — Principal Sponsor',
  'Primary chest logo on official Coritiba FC match jersey. Highest visibility placement.',
  'physical', 'jersey',
  1, 'per_season', NULL, NULL,
  80000, 250000, 80000, 140000, 200000, 250000,
  'BRL', 'limited', TRUE,
  'All matches broadcast nationally + social media + press photos',
  10, 'active'
),
(
  'Jersey Sleeve — Left Sleeve',
  'Secondary sponsor logo on left sleeve of official Coritiba FC jersey.',
  'physical', 'jersey',
  1, 'per_season', NULL, NULL,
  25000, 80000, 25000, 45000, 65000, 80000,
  'BRL', 'available', TRUE,
  'All matches + social media + press photos',
  11, 'active'
),
(
  'Jersey Sleeve — Right Sleeve',
  'Secondary sponsor logo on right sleeve of official Coritiba FC jersey.',
  'physical', 'jersey',
  1, 'per_season', NULL, NULL,
  25000, 80000, 25000, 45000, 65000, 80000,
  'BRL', 'available', TRUE,
  'All matches + social media + press photos',
  12, 'active'
),
(
  'Jersey Back / Name Sponsor',
  'Logo below player name on jersey back.',
  'physical', 'jersey',
  1, 'per_season', NULL, NULL,
  15000, 50000, 15000, 28000, 40000, 50000,
  'BRL', 'available', FALSE,
  'All matches + social media',
  13, 'active'
),
(
  'Training Kit Sponsor',
  'Logo on official Coritiba FC training wear used in all training sessions.',
  'physical', 'jersey',
  1, 'per_season', NULL, NULL,
  5000, 20000, 5000, 10000, 15000, 20000,
  'BRL', 'available', FALSE,
  'Training sessions + social media content',
  14, 'active'
),

-- ── LED / STADIUM ─────────────────────────────────────────────────────────
(
  'LED Perimeter Board — Pre-Match Slot',
  'LED board display during pre-match warm-up period (~30 min before kick-off). Adjustable slot duration.',
  'physical', 'stadium',
  4, 'per_game', 30, 'pre_match',
  2000, 8000, 2000, 4000, 6000, 8000,
  'BRL', 'available', FALSE,
  'Stadium attendance + broadcast (when camera pans)',
  20, 'active'
),
(
  'LED Perimeter Board — Half-Time Slot',
  'LED board display during half-time interval. High audience attention moment.',
  'physical', 'stadium',
  4, 'per_game', 30, 'half_time',
  3000, 10000, 3000, 6000, 8000, 10000,
  'BRL', 'available', FALSE,
  'Stadium attendance + broadcast half-time coverage',
  21, 'active'
),
(
  'LED Perimeter Board — Full Match',
  'LED board display throughout the entire match (pre + both halves + half-time).',
  'physical', 'stadium',
  4, 'per_game', NULL, 'full_match',
  8000, 25000, 8000, 15000, 20000, 25000,
  'BRL', 'available', FALSE,
  'Full match broadcast + stadium attendance',
  22, 'active'
),
(
  'LED Perimeter Board — Full Season Package',
  'LED perimeter board for all home matches throughout the season.',
  'physical', 'stadium',
  4, 'per_season', NULL, 'full_season',
  20000, 60000, 20000, 35000, 48000, 60000,
  'BRL', 'available', FALSE,
  'All home matches — season-long brand presence',
  23, 'active'
),
(
  'Giant Scoreboard — Video Ad (30s)',
  'Video advertisement on Couto Pereira giant screen. 30-second slot.',
  'physical', 'stadium',
  6, 'per_game', 30, 'configurable',
  3000, 10000, 3000, 6000, 8000, 10000,
  'BRL', 'available', FALSE,
  'Stadium audience — high impact moment',
  24, 'active'
),
(
  'Giant Scoreboard — Video Ad (60s)',
  'Video advertisement on Couto Pereira giant screen. 60-second slot.',
  'physical', 'stadium',
  4, 'per_game', 60, 'configurable',
  5000, 18000, 5000, 10000, 14000, 18000,
  'BRL', 'available', FALSE,
  'Stadium audience — extended brand moment',
  25, 'active'
),
(
  'Stadium Naming Rights',
  'Full naming rights to Couto Pereira stadium.',
  'physical', 'stadium',
  1, 'per_season', NULL, NULL,
  200000, 800000, NULL, NULL, 400000, 800000,
  'BRL', 'limited', TRUE,
  'All communications, broadcasts, and press globally',
  26, 'active'
),

-- ── PRESS / EVENT ─────────────────────────────────────────────────────────
(
  'Press Backdrop / Flash Zone',
  'Brand logo on official press backdrop used at all press conferences and post-match interviews.',
  'physical', 'press',
  2, 'per_season', NULL, NULL,
  5000, 20000, 5000, 10000, 15000, 20000,
  'BRL', 'available', FALSE,
  'All press conferences + broadcast media interviews',
  30, 'active'
),
(
  'VIP Hospitality Box — Per Match',
  'Private VIP box at Couto Pereira per match. Includes catering, player access (configurable).',
  'physical', 'hospitality',
  3, 'per_game', NULL, NULL,
  3000, 15000, 3000, 7000, 11000, 15000,
  'BRL', 'available', FALSE,
  'Direct executive networking + brand experience',
  31, 'active'
),
(
  'VIP Hospitality Package — Full Season',
  'Private VIP box for all home matches. Premium executive relationship-building.',
  'physical', 'hospitality',
  3, 'per_season', NULL, NULL,
  15000, 60000, 15000, 30000, 45000, 60000,
  'BRL', 'available', FALSE,
  'Season-long executive engagement',
  32, 'active'
),

-- ── DIGITAL ───────────────────────────────────────────────────────────────
(
  'Instagram Feed Post — Branded',
  'Sponsored Instagram feed post published on official Coritiba FC account.',
  'digital', 'social',
  4, 'per_month', NULL, NULL,
  2000, 8000, 2000, 4000, 6000, 8000,
  'BRL', 'available', FALSE,
  '500k+ Instagram followers',
  40, 'active'
),
(
  'Instagram Stories — Branded Activation',
  'Branded story sequence on official Coritiba FC Instagram.',
  'digital', 'social',
  8, 'per_month', NULL, NULL,
  1500, 5000, 1500, 3000, 4000, 5000,
  'BRL', 'available', FALSE,
  '500k+ Instagram followers — story format',
  41, 'active'
),
(
  'Instagram Reels — Sponsored Content',
  'Branded Reels content on official Coritiba FC Instagram account.',
  'digital', 'social',
  4, 'per_month', NULL, NULL,
  3000, 12000, 3000, 6000, 9000, 12000,
  'BRL', 'available', FALSE,
  '500k+ followers + viral potential',
  42, 'active'
),
(
  'TikTok — Viral Brand Activation',
  'Branded TikTok content on official Coritiba FC TikTok account.',
  'digital', 'social',
  4, 'per_month', NULL, NULL,
  2000, 10000, 2000, 5000, 8000, 10000,
  'BRL', 'available', FALSE,
  'Growing TikTok audience — high viral reach',
  43, 'active'
),
(
  'YouTube — Sponsored Video',
  'Brand integration in YouTube content on official Coritiba FC channel.',
  'digital', 'social',
  2, 'per_month', NULL, NULL,
  5000, 25000, 5000, 12000, 18000, 25000,
  'BRL', 'available', FALSE,
  'YouTube subscribers + long-form content audience',
  44, 'active'
),
(
  'Player Content — Brand Integration',
  'Sponsored content featuring Coritiba FC players promoting the brand (social posts, short videos).',
  'digital', 'player',
  2, 'per_month', NULL, NULL,
  5000, 30000, 5000, 15000, 22000, 30000,
  'BRL', 'available', FALSE,
  'Player personal audiences + official channels',
  45, 'active'
),
(
  'Email Newsletter — Sponsored Edition',
  'Brand sponsorship of official Coritiba FC supporter email newsletter.',
  'digital', 'email',
  2, 'per_month', NULL, NULL,
  1500, 5000, 1500, 3000, 4000, 5000,
  'BRL', 'available', FALSE,
  'Engaged supporter email list — direct inbox',
  46, 'active'
),
(
  'Match Day Digital Package',
  'Combined digital activation on match day: story + reel + push notification. High-engagement moment.',
  'digital', 'social',
  4, 'per_game', NULL, NULL,
  4000, 15000, 4000, 8000, 12000, 15000,
  'BRL', 'available', FALSE,
  'Peak audience engagement — match day',
  47, 'active'
);

-- 4. Create proposal_inventory_items junction table (individual line items in a proposal)
CREATE TABLE IF NOT EXISTS proposal_inventory_items (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  proposal_id     UUID        NOT NULL REFERENCES proposals(id) ON DELETE CASCADE,
  inventory_id    UUID        NOT NULL REFERENCES inventory_items(id),
  quantity        INTEGER     DEFAULT 1,
  unit_type       TEXT        NULL,
  slot_timing     TEXT        NULL,
  slot_duration_sec INTEGER   NULL,
  scope           TEXT        DEFAULT 'per_season',  -- per_game, per_month, per_season
  price_agreed    NUMERIC     NULL,
  currency        TEXT        DEFAULT 'BRL',
  notes           TEXT        NULL,
  created_at      TIMESTAMPTZ DEFAULT NOW()
);

-- 5. Add index
CREATE INDEX IF NOT EXISTS idx_proposal_inventory_proposal ON proposal_inventory_items(proposal_id);
