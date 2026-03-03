-- Add new invoice statuses for Publisher and Lawyer Invoicing
-- Publisher: billable, in_review
-- Lawyer: signed_awaiting, in_preview

ALTER TABLE public.invoices
  DROP CONSTRAINT IF EXISTS invoices_status_check;

ALTER TABLE public.invoices
  ADD CONSTRAINT invoices_status_check
  CHECK (status IN ('billable', 'pending', 'in_review', 'signed_awaiting', 'in_preview', 'paid', 'chargeback'));

NOTIFY pgrst, 'reload schema';
