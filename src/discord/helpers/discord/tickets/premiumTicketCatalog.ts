/** Mirror of apps/web/platform/src/domain/shared/premiumCatalog.ts for ticket + payment log. */

export type ProductTier = 'basic' | 'pro' | 'ultimate';
export type BillingPeriod = 'monthly' | 'annual' | 'lifetime';

export const PLAN_IDS = [
  'basic_monthly',
  'basic_annual',
  'pro_monthly',
  'pro_annual',
  'ultimate_monthly',
  'ultimate_annual',
  'ultimate_lifetime',
] as const;

export type PremiumPlanId = (typeof PLAN_IDS)[number];

const DURATION_DAYS: Record<PremiumPlanId, number | null> = {
  basic_monthly: 30,
  basic_annual: 365,
  pro_monthly: 30,
  pro_annual: 365,
  ultimate_monthly: 30,
  ultimate_annual: 365,
  ultimate_lifetime: null,
};

const PRODUCT_TIER: Record<PremiumPlanId, ProductTier> = {
  basic_monthly: 'basic',
  basic_annual: 'basic',
  pro_monthly: 'pro',
  pro_annual: 'pro',
  ultimate_monthly: 'ultimate',
  ultimate_annual: 'ultimate',
  ultimate_lifetime: 'ultimate',
};

export const PLAN_PRICE_EUR: Record<PremiumPlanId, number> = {
  basic_monthly: 2,
  basic_annual: 16,
  pro_monthly: 3,
  pro_annual: 20,
  ultimate_monthly: 4,
  ultimate_annual: 25,
  ultimate_lifetime: 50,
};

export function isPremiumPlanId(value: string): value is PremiumPlanId {
  return (PLAN_IDS as readonly string[]).includes(value);
}

export function buildPlanId(tier: ProductTier, period: BillingPeriod): PremiumPlanId {
  return `${tier}_${period}` as PremiumPlanId;
}

export function periodsForTier(tier: ProductTier): BillingPeriod[] {
  if (tier === 'ultimate') return ['monthly', 'annual', 'lifetime'];
  return ['monthly', 'annual'];
}

export function planToProductTier(planId: PremiumPlanId): ProductTier {
  return PRODUCT_TIER[planId];
}

export function getPlanExpiresAt(planId: PremiumPlanId | string): Date | null {
  const resolved = resolvePlanId(planId);
  if (!resolved) return null;
  const days = DURATION_DAYS[resolved];
  if (days === null) return null;
  return new Date(Date.now() + days * 24 * 60 * 60 * 1000);
}

export function resolvePlanId(plan: string): PremiumPlanId | null {
  if (isPremiumPlanId(plan)) return plan;
  const legacy: Record<string, PremiumPlanId> = {
    monthly: 'ultimate_monthly',
    yearly: 'ultimate_annual',
    immortal: 'ultimate_lifetime',
  };
  return legacy[plan] ?? null;
}
