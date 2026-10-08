-- Migration 0053: one allocation ID from quote line to contract, delivery task and renewal (Task 4).
--
-- The allocation ID is the quote line's own id (proposal_inventory_items.id).
-- It is a plain uuid wherever it is carried, with no foreign key, so the
-- identifier outlives a line that is later removed and the lineage is kept.
--
-- Additive only: new columns and one new table.

-- A renewal line points back at the allocation it continues.
ALTER TABLE public.proposal_inventory_items
  ADD COLUMN IF NOT EXISTS renewed_from_allocation_id uuid;

CREATE INDEX IF NOT EXISTS idx_proposal_inventory_renewed_from
  ON public.proposal_inventory_items (renewed_from_allocation_id)
  WHERE renewed_from_allocation_id IS NOT NULL;

-- A contract is bound to the exact revision of the terms that was signed.
ALTER TABLE public.contracts
  ADD COLUMN IF NOT EXISTS revision_id uuid
    REFERENCES public.proposal_revisions(id) ON DELETE SET NULL;

-- What each contract committed to, line by line, copied from the frozen revision.
CREATE TABLE IF NOT EXISTS public.contract_allocations (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id      uuid NOT NULL DEFAULT '00000000-0000-0000-0000-000000000001'::uuid,
  contract_id    uuid NOT NULL REFERENCES public.contracts(id) ON DELETE CASCADE,
  allocation_id  uuid NOT NULL,
  proposal_id    uuid,
  revision_id    uuid REFERENCES public.proposal_revisions(id) ON DELETE SET NULL,
  inventory_id   uuid,
  inventory_name text,
  quantity       integer NOT NULL DEFAULT 1,
  unit           text,
  period         text,
  unit_price     numeric,
  currency       text NOT NULL DEFAULT 'BRL',
  discount_pct   numeric(5,2),
  created_at     timestamptz NOT NULL DEFAULT now(),
  UNIQUE (contract_id, allocation_id)
);

CREATE INDEX IF NOT EXISTS idx_contract_allocations_allocation
  ON public.contract_allocations (allocation_id);

ALTER TABLE public.contract_allocations ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "service_all_contract_allocations" ON public.contract_allocations;
CREATE POLICY "service_all_contract_allocations" ON public.contract_allocations
  FOR ALL TO service_role USING (true) WITH CHECK (true);

NOTIFY pgrst, 'reload schema';
