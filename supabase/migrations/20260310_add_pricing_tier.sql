-- Add pricing_tier column to attorney_profiles table
ALTER TABLE public.attorney_profiles
  ADD COLUMN IF NOT EXISTS pricing_tier text NULL;

-- Add constraint to ensure valid tier values
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'ap_pricing_tier_check'
  ) THEN
    ALTER TABLE public.attorney_profiles
      ADD CONSTRAINT ap_pricing_tier_check
      CHECK (
        pricing_tier IS NULL
        OR pricing_tier IN ('tier_1', 'tier_2', 'tier_3', 'tier_4')
      );
  END IF;
END $$;

-- Create index for faster queries on pricing_tier
CREATE INDEX IF NOT EXISTS idx_attorney_profiles_pricing_tier 
  ON public.attorney_profiles(pricing_tier);
