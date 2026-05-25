-- 0017: Inventory operational fields requested by James Thunder Marketing
-- Digital: avg_views, content_hours, team_required
-- Physical: production_cost, setup_hours, line_items

ALTER TABLE public.inventory_items
  ADD COLUMN IF NOT EXISTS avg_views        INTEGER      DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS content_hours    NUMERIC(6,2) DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS team_required    TEXT         DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS production_cost  NUMERIC(12,2) DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS setup_hours      NUMERIC(6,2) DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS line_items       JSONB        DEFAULT '[]';

COMMENT ON COLUMN public.inventory_items.avg_views       IS 'Average views/impressions per post or campaign unit (digital)';
COMMENT ON COLUMN public.inventory_items.content_hours   IS 'Hours of content production required per unit (digital)';
COMMENT ON COLUMN public.inventory_items.team_required   IS 'Team roles/assets required (e.g. player, videographer)';
COMMENT ON COLUMN public.inventory_items.production_cost IS 'Estimated production cost in BRL (physical)';
COMMENT ON COLUMN public.inventory_items.setup_hours     IS 'Setup hours required (physical)';
COMMENT ON COLUMN public.inventory_items.line_items      IS 'Line items/requirements breakdown [{name, cost, hours}]';
