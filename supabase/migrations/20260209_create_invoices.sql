-- Create invoices table
CREATE TABLE IF NOT EXISTS invoices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_number TEXT NOT NULL UNIQUE,
  lawyer_id UUID NOT NULL REFERENCES app_users(user_id) ON DELETE CASCADE,
  created_by UUID NOT NULL REFERENCES app_users(user_id) ON DELETE SET NULL,
  date_range_start DATE NOT NULL,
  date_range_end DATE NOT NULL,
  deal_ids UUID[] DEFAULT '{}',
  items JSONB NOT NULL DEFAULT '[]',
  subtotal NUMERIC(12,2) NOT NULL DEFAULT 0,
  tax_rate NUMERIC(5,4) NOT NULL DEFAULT 0,
  tax_amount NUMERIC(12,2) NOT NULL DEFAULT 0,
  total_amount NUMERIC(12,2) NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'paid', 'chargeback')),
  notes TEXT,
  due_date DATE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Index for lawyer lookup
CREATE INDEX IF NOT EXISTS idx_invoices_lawyer_id ON invoices(lawyer_id);
CREATE INDEX IF NOT EXISTS idx_invoices_status ON invoices(status);
CREATE INDEX IF NOT EXISTS idx_invoices_created_at ON invoices(created_at DESC);

-- Auto-update updated_at
CREATE OR REPLACE FUNCTION update_invoices_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_invoices_updated_at
  BEFORE UPDATE ON invoices
  FOR EACH ROW
  EXECUTE FUNCTION update_invoices_updated_at();

-- RLS policies
ALTER TABLE invoices ENABLE ROW LEVEL SECURITY;

-- Admins and super_admins can do everything
CREATE POLICY invoices_admin_all ON invoices
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM app_users
      WHERE app_users.user_id = auth.uid()
      AND app_users.role IN ('super_admin', 'admin')
    )
  );

-- Lawyers can only read their own invoices
CREATE POLICY invoices_lawyer_select ON invoices
  FOR SELECT
  USING (
    lawyer_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM app_users
      WHERE app_users.user_id = auth.uid()
      AND app_users.role = 'lawyer'
    )
  );

-- Lawyers can update the status of their own invoices (mark as paid)
CREATE POLICY invoices_lawyer_update_status ON invoices
  FOR UPDATE
  USING (
    lawyer_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM app_users
      WHERE app_users.user_id = auth.uid()
      AND app_users.role = 'lawyer'
    )
  )
  WITH CHECK (
    lawyer_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM app_users
      WHERE app_users.user_id = auth.uid()
      AND app_users.role = 'lawyer'
    )
  );

-- Link deals to invoices: add invoice_id column to daily_deal_flow
ALTER TABLE public.daily_deal_flow
  ADD COLUMN IF NOT EXISTS invoice_id UUID NULL REFERENCES invoices(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_daily_deal_flow_invoice_id
  ON public.daily_deal_flow(invoice_id);

-- Allow admin and super_admin to update invoice_id on any deal
CREATE POLICY daily_deal_flow_admin_update_invoice_id ON daily_deal_flow
  FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM app_users
      WHERE app_users.user_id = auth.uid()
      AND app_users.role IN ('admin', 'super_admin')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM app_users
      WHERE app_users.user_id = auth.uid()
      AND app_users.role IN ('admin', 'super_admin')
    )
  );
