-- Fulfillment is an attorney-managed workspace. Keep its stage independent
-- from leads.status and daily_deal_flow.status so board movement does not
-- affect My Cases, invoicing, or settlement workflows.

ALTER TABLE public.leads
  ADD COLUMN IF NOT EXISTS fulfillment_stage text NULL,
  ADD COLUMN IF NOT EXISTS fulfillment_stage_updated_at timestamptz NULL,
  ADD COLUMN IF NOT EXISTS fulfillment_stage_updated_by uuid NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'leads_fulfillment_stage_check'
  ) THEN
    ALTER TABLE public.leads
      ADD CONSTRAINT leads_fulfillment_stage_check
      CHECK (
        fulfillment_stage IS NULL
        OR fulfillment_stage IN (
          'signed_cases',
          'active_cases',
          'dropped_cases',
          'successful_cases'
        )
      );
  END IF;
END $$;

UPDATE public.leads
SET fulfillment_stage = CASE
  WHEN lower(coalesce(fulfillment_stage, status, '')) IN (
    'returned_back',
    'returned back',
    'returned back (14 days window)',
    'active_cases',
    'active cases'
  ) THEN 'active_cases'
  WHEN lower(coalesce(fulfillment_stage, status, '')) IN (
    'dropped_retainers',
    'dropped retainers',
    'dropped cases',
    'dropped_cases',
    'attorney_rejected',
    'customer_rejected'
  ) THEN 'dropped_cases'
  WHEN lower(coalesce(fulfillment_stage, status, '')) IN (
    'successful_cases',
    'successful cases',
    'qualified_payable',
    'customer_approved'
  ) THEN 'successful_cases'
  ELSE 'signed_cases'
END
WHERE fulfillment_stage IS NULL
   OR fulfillment_stage NOT IN (
     'signed_cases',
     'active_cases',
     'dropped_cases',
     'successful_cases'
   );

CREATE INDEX IF NOT EXISTS idx_leads_fulfillment_stage
  ON public.leads(fulfillment_stage);

CREATE INDEX IF NOT EXISTS idx_leads_assigned_attorney_fulfillment_stage
  ON public.leads(assigned_attorney_id, fulfillment_stage);

COMMENT ON COLUMN public.leads.fulfillment_stage IS
  'Attorney-managed Fulfillment board stage. Independent from lead status and financial workflow statuses.';

NOTIFY pgrst, 'reload schema';
