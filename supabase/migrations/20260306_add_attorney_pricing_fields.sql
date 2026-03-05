ALTER TABLE public.attorney_profiles
  ADD COLUMN IF NOT EXISTS case_rate_per_deal numeric NULL,
  ADD COLUMN IF NOT EXISTS upfront_payment_percentage numeric NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'ap_upfront_pay_pct_rng'
  ) THEN
    ALTER TABLE public.attorney_profiles
      ADD CONSTRAINT ap_upfront_pay_pct_rng
      CHECK (
        upfront_payment_percentage IS NULL
        OR (upfront_payment_percentage >= 0 AND upfront_payment_percentage <= 100)
      );
  END IF;
END $$;
