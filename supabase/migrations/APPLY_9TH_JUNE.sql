-- =========================================================================
-- 9th June Migration — Apply in Supabase Dashboard SQL Editor
-- =========================================================================
-- Copy this entire file and paste into:
-- https://supabase.com/dashboard/project/lmjwjztokzombtstmume/sql/new
-- Then click Run.
-- =========================================================================

-- ─── MIGRATION 0028: Add 'competitor' to company_status enum ─────────────
-- Allows storing rival brands / competitor clubs in the companies table
-- with status = 'competitor' (red badge in the UI).
-- 'competitor' is inserted BEFORE 'prospect' in the pipeline order.

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_enum
    WHERE enumtypid = 'company_status'::regtype
      AND enumlabel = 'competitor'
  ) THEN
    ALTER TYPE company_status ADD VALUE 'competitor' BEFORE 'prospect';
  END IF;
END$$;

-- Verify — expected output: competitor | prospect | active | paused | closed
SELECT enumlabel FROM pg_enum
WHERE enumtypid = 'company_status'::regtype
ORDER BY enumsortorder;
