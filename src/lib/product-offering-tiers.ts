export type ProductOfferingTierKey = 'tier_1' | 'tier_2' | 'tier_3' | 'tier_4'

export type ProductOfferingTier = {
  key: ProductOfferingTierKey
  name: string
  price: number
  documentation: string
}

export const PRODUCT_OFFERING_TIERS: ProductOfferingTier[] = [
  {
    key: 'tier_1',
    name: 'Tier 1 Transfer',
    price: 2500,
    documentation: 'Signed Retainer'
  },
  {
    key: 'tier_2',
    name: 'Tier 2 Bronze',
    price: 3000,
    documentation: 'Signed Retainer, Police Report'
  },
  {
    key: 'tier_3',
    name: 'Tier 3 Silver',
    price: 3500,
    documentation: 'Signed Retainer, Police Report, Proof of Medical Treatment'
  },
  {
    key: 'tier_4',
    name: 'Tier 4 Gold',
    price: 5000,
    documentation: 'Signed Retainer, Police Report, Proof of Medical Treatment, Insurance'
  }
]

export const PRODUCT_OFFERING_TIERS_BY_KEY = PRODUCT_OFFERING_TIERS.reduce((acc, tier) => {
  acc[tier.key] = tier
  return acc
}, {} as Record<ProductOfferingTierKey, ProductOfferingTier>)

export const isProductOfferingTierKey = (value: unknown): value is ProductOfferingTierKey => {
  return typeof value === 'string' && Object.prototype.hasOwnProperty.call(PRODUCT_OFFERING_TIERS_BY_KEY, value)
}

export const formatProductOfferingPrice = (price: number) => {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0
  }).format(price)
}
