
-- Helper view: Retainer settlements with attorney name
CREATE OR REPLACE VIEW retainer_settlements_view AS
SELECT
  d.id,
  d.submission_id,
  d.insured_name,
  d.client_phone_number,
  d.lead_vendor,
  d.face_amount,
  d.date         AS date_signed,
  d.status,
  d.assigned_attorney_id,
  a.full_name    AS assigned_attorney_name,
  d.created_at
FROM daily_deal_flow d
LEFT JOIN attorney_profiles a ON a.user_id = d.assigned_attorney_id
WHERE d.status IN (
  'Retainer Signed',
  'Attorney Review',
  'Attorney Paid',
  'Approved – Payable',
  'Paid to BPO'
)
ORDER BY d.created_at DESC;

-- Index on status for fast filtering of settlement stages
CREATE INDEX IF NOT EXISTS idx_daily_deal_flow_status
  ON daily_deal_flow(status);

-- Notify PostgREST to reload schema
NOTIFY pgrst, 'reload schema';
