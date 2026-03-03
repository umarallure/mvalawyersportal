-- Retainer Settlements: stage label updates + new Review stage

-- 1) Update existing rows to new labels (daily_deal_flow.status stores label text)
UPDATE public.daily_deal_flow
SET status = 'Awaiting Billable'
WHERE status = 'Retainer Signed';

UPDATE public.daily_deal_flow
SET status = 'Invoice to Attorney'
WHERE status = 'Attorney Review';

UPDATE public.daily_deal_flow
SET status = 'Payable to BPO'
WHERE status = 'Approved – Payable';

-- 2) Keep the helper view in sync with updated labels + new stage
DROP VIEW IF EXISTS public.retainer_settlements_view;

CREATE VIEW public.retainer_settlements_view AS
SELECT
  d.id,
  d.submission_id,
  d.insured_name,
  d.client_phone_number,
  d.lead_vendor,
  d.date         AS date_signed,
  d.status,
  d.assigned_attorney_id,
  a.full_name    AS assigned_attorney_name,
  d.created_at
FROM public.daily_deal_flow d
LEFT JOIN public.attorney_profiles a ON a.user_id = d.assigned_attorney_id
WHERE d.status IN (
  'Awaiting Billable',
  'Invoice to Attorney',
  'Attorney Paid',
  'Review',
  'Payable to BPO',
  'Paid to BPO'
)
ORDER BY d.created_at DESC;

NOTIFY pgrst, 'reload schema';
