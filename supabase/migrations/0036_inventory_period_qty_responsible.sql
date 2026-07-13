-- Add operational fields to inventory_items
ALTER TABLE inventory_items
  ADD COLUMN IF NOT EXISTS period text,
  ADD COLUMN IF NOT EXISTS quantity integer,
  ADD COLUMN IF NOT EXISTS responsible text;
