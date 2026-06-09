-- ============================================================
-- MIGRATION: Add 'competitor' to company_status enum
-- ============================================================
-- Run this in: Supabase Dashboard → SQL Editor → New query → Run
-- File: supabase/migrations/0028_competitor_company_status.sql
-- ============================================================

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

-- Verify the result (should now include 'competitor'):
SELECT enumlabel FROM pg_enum
WHERE enumtypid = 'company_status'::regtype
ORDER BY enumsortorder;
