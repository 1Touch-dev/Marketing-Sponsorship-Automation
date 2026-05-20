-- ============================================================
-- MIGRATION 0014 — Run this in Supabase Dashboard > SQL Editor
-- ============================================================
-- Step 1: Add columns to inventory_items
-- Step 2: Add columns to companies  
-- Step 3: Clean up duplicates and seed canonical inventory
-- Step 4: Create proposal_inventory_items table

-- STEP 1 & 2: Add columns
ALTER TABLE public.inventory_items
  ADD COLUMN IF NOT EXISTS total_quantity      INTEGER     DEFAULT 1,
  ADD COLUMN IF NOT EXISTS quantity_sold       INTEGER     DEFAULT 0,
  ADD COLUMN IF NOT EXISTS quantity_reserved   INTEGER     DEFAULT 0,
  ADD COLUMN IF NOT EXISTS unit_type           TEXT        DEFAULT 'per_season',
  ADD COLUMN IF NOT EXISTS slot_duration_sec   INTEGER,
  ADD COLUMN IF NOT EXISTS slot_timing         TEXT,
  ADD COLUMN IF NOT EXISTS price_small         NUMERIC,
  ADD COLUMN IF NOT EXISTS price_medium        NUMERIC,
  ADD COLUMN IF NOT EXISTS price_large         NUMERIC,
  ADD COLUMN IF NOT EXISTS price_enterprise    NUMERIC,
  ADD COLUMN IF NOT EXISTS is_exclusive        BOOLEAN     DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS notes               TEXT;

ALTER TABLE public.companies
  ADD COLUMN IF NOT EXISTS last_discovery_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS discovery_method  TEXT;

-- STEP 3: Remove all duplicates + seed canonical inventory
TRUNCATE public.inventory_items RESTART IDENTITY CASCADE;

INSERT INTO public.inventory_items (name,description,inventory_type,category,total_quantity,unit_type,slot_duration_sec,slot_timing,price_min,price_max,price_small,price_medium,price_large,price_enterprise,currency,availability,is_exclusive,exposure_reach,sort_order,status) VALUES
('Jersey Front — Principal Sponsor','Primary chest logo on official Coritiba FC match jersey.','physical','jersey',1,'per_season',NULL,NULL,80000,250000,80000,140000,200000,250000,'BRL','limited',TRUE,'All matches broadcast nationally + social media',10,'active'),
('Jersey Sleeve — Left Sleeve','Secondary sponsor logo on left sleeve.','physical','jersey',1,'per_season',NULL,NULL,25000,80000,25000,45000,65000,80000,'BRL','available',TRUE,'All matches + social media',11,'active'),
('Jersey Sleeve — Right Sleeve','Secondary sponsor logo on right sleeve.','physical','jersey',1,'per_season',NULL,NULL,25000,80000,25000,45000,65000,80000,'BRL','available',TRUE,'All matches + social media',12,'active'),
('Jersey Back / Name Sponsor','Logo below player name on jersey back.','physical','jersey',1,'per_season',NULL,NULL,15000,50000,15000,28000,40000,50000,'BRL','available',FALSE,'All matches + social media',13,'active'),
('Training Kit Sponsor','Logo on official Coritiba FC training wear.','physical','jersey',1,'per_season',NULL,NULL,5000,20000,5000,10000,15000,20000,'BRL','available',FALSE,'Training sessions + social media',14,'active'),
('LED Perimeter Board — Pre-Match Slot','LED board during pre-match warm-up (~30 min). Adjustable slot.','physical','stadium',4,'per_game',30,'pre_match',2000,8000,2000,4000,6000,8000,'BRL','available',FALSE,'Stadium + broadcast',20,'active'),
('LED Perimeter Board — Half-Time Slot','LED board during half-time interval.','physical','stadium',4,'per_game',30,'half_time',3000,10000,3000,6000,8000,10000,'BRL','available',FALSE,'Stadium + half-time broadcast',21,'active'),
('LED Perimeter Board — Full Match','LED board throughout entire match.','physical','stadium',4,'per_game',NULL,'full_match',8000,25000,8000,15000,20000,25000,'BRL','available',FALSE,'Full match broadcast',22,'active'),
('LED Perimeter Board — Full Season','LED perimeter all home matches, full season.','physical','stadium',4,'per_season',NULL,'full_season',20000,60000,20000,35000,48000,60000,'BRL','available',FALSE,'All home matches',23,'active'),
('Giant Scoreboard — Video Ad (30s)','30-second video ad on Couto Pereira screen.','physical','stadium',6,'per_game',30,'configurable',3000,10000,3000,6000,8000,10000,'BRL','available',FALSE,'Stadium audience',24,'active'),
('Giant Scoreboard — Video Ad (60s)','60-second video ad on Couto Pereira screen.','physical','stadium',4,'per_game',60,'configurable',5000,18000,5000,10000,14000,18000,'BRL','available',FALSE,'Stadium audience',25,'active'),
('Stadium Naming Rights','Full naming rights to Couto Pereira.','physical','stadium',1,'per_season',NULL,NULL,200000,800000,NULL,NULL,400000,800000,'BRL','limited',TRUE,'All comms + broadcast globally',26,'active'),
('Press Backdrop / Flash Zone','Logo on official press backdrop at all press conferences.','physical','press',2,'per_season',NULL,NULL,5000,20000,5000,10000,15000,20000,'BRL','available',FALSE,'All press conferences + broadcast',30,'active'),
('VIP Hospitality Box — Per Match','Private VIP box at Couto Pereira per match.','physical','hospitality',3,'per_game',NULL,NULL,3000,15000,3000,7000,11000,15000,'BRL','available',FALSE,'Executive networking',31,'active'),
('VIP Hospitality Package — Full Season','Private VIP box for all home matches.','physical','hospitality',3,'per_season',NULL,NULL,15000,60000,15000,30000,45000,60000,'BRL','available',FALSE,'Season-long engagement',32,'active'),
('Instagram Feed Post — Branded','Sponsored feed post on official Coritiba FC Instagram.','digital','social',4,'per_month',NULL,NULL,2000,8000,2000,4000,6000,8000,'BRL','available',FALSE,'500k+ Instagram followers',40,'active'),
('Instagram Stories — Branded Activation','Branded story on official Coritiba FC Instagram.','digital','social',8,'per_month',NULL,NULL,1500,5000,1500,3000,4000,5000,'BRL','available',FALSE,'500k+ followers',41,'active'),
('Instagram Reels — Sponsored Content','Branded Reels on official Coritiba FC Instagram.','digital','social',4,'per_month',NULL,NULL,3000,12000,3000,6000,9000,12000,'BRL','available',FALSE,'500k+ followers + viral',42,'active'),
('TikTok — Viral Brand Activation','Branded TikTok on official Coritiba FC account.','digital','social',4,'per_month',NULL,NULL,2000,10000,2000,5000,8000,10000,'BRL','available',FALSE,'Growing TikTok audience',43,'active'),
('YouTube — Sponsored Video','Brand integration in Coritiba FC YouTube content.','digital','social',2,'per_month',NULL,NULL,5000,25000,5000,12000,18000,25000,'BRL','available',FALSE,'YouTube subscribers',44,'active'),
('Player Content — Brand Integration','Sponsored player content for brand promotion.','digital','player',2,'per_month',NULL,NULL,5000,30000,5000,15000,22000,30000,'BRL','available',FALSE,'Player audiences + official',45,'active'),
('Email Newsletter — Sponsored Edition','Brand sponsorship of official supporter newsletter.','digital','email',2,'per_month',NULL,NULL,1500,5000,1500,3000,4000,5000,'BRL','available',FALSE,'Engaged supporter email list',46,'active'),
('Match Day Digital Package','Combined match day: story + reel + notification.','digital','social',4,'per_game',NULL,NULL,4000,15000,4000,8000,12000,15000,'BRL','available',FALSE,'Peak match day audience',47,'active');

-- STEP 4: Create proposal_inventory_items junction table
CREATE TABLE IF NOT EXISTS public.proposal_inventory_items (
  id                UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  proposal_id       UUID        NOT NULL REFERENCES public.proposals(id) ON DELETE CASCADE,
  inventory_id      UUID        NOT NULL REFERENCES public.inventory_items(id),
  quantity          INTEGER     DEFAULT 1,
  unit_type         TEXT,
  slot_timing       TEXT,
  slot_duration_sec INTEGER,
  scope             TEXT        DEFAULT 'per_season',
  price_agreed      NUMERIC,
  currency          TEXT        DEFAULT 'BRL',
  notes             TEXT,
  created_at        TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_proposal_inventory_proposal ON public.proposal_inventory_items(proposal_id);

ALTER TABLE public.proposal_inventory_items ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "service_all_proposal_inventory_items" ON public.proposal_inventory_items;
CREATE POLICY "service_all_proposal_inventory_items" ON public.proposal_inventory_items FOR ALL TO service_role USING (true) WITH CHECK (true);

NOTIFY pgrst, 'reload schema';
