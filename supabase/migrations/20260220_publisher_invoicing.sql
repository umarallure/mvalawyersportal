-- ── Publisher Invoicing: schema extensions ──────────────────────────────────
-- Run this migration on the remote DB after the invoices table already has
-- invoice_type TEXT and vendor_name TEXT (from the manual schema edits).

-- 1. Drop vendor_name (replaced by a proper FK to the centers table)
ALTER TABLE public.invoices DROP COLUMN IF EXISTS vendor_name;

-- 2. Add lead_vendor_id → FK to centers
ALTER TABLE public.invoices
  ADD COLUMN IF NOT EXISTS lead_vendor_id UUID NULL
  REFERENCES public.centers(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_invoices_lead_vendor_id
  ON public.invoices USING btree (lead_vendor_id);

-- 3. Add publisher_invoice_id to daily_deal_flow
ALTER TABLE public.daily_deal_flow
  ADD COLUMN IF NOT EXISTS publisher_invoice_id UUID NULL
  REFERENCES public.invoices(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_daily_deal_flow_publisher_invoice_id
  ON public.daily_deal_flow USING btree (publisher_invoice_id);

-- 4. Notify PostgREST to reload schema
NOTIFY pgrst, 'reload schema';
