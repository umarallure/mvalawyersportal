-- Store the Product Offering tier assigned to a lead for display in My Cases.
ALTER TABLE public.leads
  ADD COLUMN IF NOT EXISTS product_tier text NULL,
  ADD COLUMN IF NOT EXISTS product_tier_price numeric(12, 2) NULL;

COMMENT ON COLUMN public.leads.product_tier IS
  'Product Offering tier key for this lead: tier_1, tier_2, tier_3, or tier_4.';

COMMENT ON COLUMN public.leads.product_tier_price IS
  'Snapshot USD price for the assigned Product Offering tier.';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'leads_product_tier_check'
  ) THEN
    ALTER TABLE public.leads
      ADD CONSTRAINT leads_product_tier_check
      CHECK (
        product_tier IS NULL
        OR product_tier IN ('tier_1', 'tier_2', 'tier_3', 'tier_4')
      );
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'leads_product_tier_price_check'
  ) THEN
    ALTER TABLE public.leads
      ADD CONSTRAINT leads_product_tier_price_check
      CHECK (
        product_tier_price IS NULL
        OR product_tier_price >= 0
      );
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_leads_product_tier
  ON public.leads(product_tier);
