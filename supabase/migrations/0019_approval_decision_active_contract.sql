-- 0019: Add active_contract to approval_decision enum (optional audit trail)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_enum e
    JOIN pg_type t ON e.enumtypid = t.oid
    WHERE t.typname = 'approval_decision' AND e.enumlabel = 'active_contract'
  ) THEN
    ALTER TYPE public.approval_decision ADD VALUE 'active_contract';
  END IF;
EXCEPTION WHEN others THEN
  RAISE NOTICE '0019: %', SQLERRM;
END $$;
