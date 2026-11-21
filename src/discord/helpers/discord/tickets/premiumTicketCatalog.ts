/** Mirror of web/src/domain/shared/premiumCatalog.ts for ticket + payment log. */

export type ProductTier = 'premium';
export type BillingPeriod = 'monthly' | 'lifetime';

export const MONTHLY_BASE_PRICE_EUR = 4;
export const MONTHLY_DISCOUNT_FROM_MONTH = 4;
export const MONTHLY_DISCOUNTED_PRICE_EUR = 2;
export const LIFETIME_PRICE_EUR = 40;
export const LIFETIME_MONTH_THRESHOLD = 10;
export const MAX_MONTHLY_QUANTITY = 9;
export const DAYS_PER_MONTH = 30;

export const ACTIVE_PLAN_IDS = [
  'premium_monthly',
  'premium_2m',
  'premium_3m',
  'premium_4m',
  'premium_5m',
  'premium_6m',
  'premium_7m',
  'premium_8m',
  'premium_9m',
  'premium_lifetime',
] as const;

export const PLAN_IDS = ACTIVE_PLAN_IDS;

export type PremiumPlanId = (typeof ACTIVE_PLAN_IDS)[number];

export interface PremiumSelection {
  planId: PremiumPlanId;
  isLifetime: boolean;
  months: number | null;
  durationDays: number | null;
  priceEUR: number;
  basePriceEUR: number;
  savingsEUR: number;
  discountApplied: boolean;
  convertedToLifetime: boolean;
}

export function calculateMonthlyBundlePriceEUR(months: number): number {
  if (!Number.isInteger(months) || months < 1) {
    throw new RangeError(`Invalid month quantity: ${months}`);
  }
  if (months >= LIFETIME_MONTH_THRESHOLD) {
    return LIFETIME_PRICE_EUR;
  }
  const fullPriceMonths = Math.min(months, MONTHLY_DISCOUNT_FROM_MONTH - 1);
  const discountedMonths = Math.max(0, months - (MONTHLY_DISCOUNT_FROM_MONTH - 1));
  return fullPriceMonths * MONTHLY_BASE_PRICE_EUR + discountedMonths * MONTHLY_DISCOUNTED_PRICE_EUR;
}

export function calculatePremiumSelection(months: number): PremiumSelection {
  if (!Number.isInteger(months) || months < 1) {
    throw new RangeError(`Invalid month quantity: ${months}`);
  }
  if (months >= LIFETIME_MONTH_THRESHOLD) {
    const basePriceEUR = months * MONTHLY_BASE_PRICE_EUR;
    return {
      planId: 'premium_lifetime',
      isLifetime: true,
      months: null,
      durationDays: null,
      priceEUR: LIFETIME_PRICE_EUR,
      basePriceEUR,
      savingsEUR: Math.max(0, basePriceEUR - LIFETIME_PRICE_EUR),
      discountApplied: true,
      convertedToLifetime: true,
    };
  }
  const planId = (months === 1 ? 'premium_monthly' : `premium_${months}m`) as PremiumPlanId;
  const priceEUR = calculateMonthlyBundlePriceEUR(months);
  const basePriceEUR = months * MONTHLY_BASE_PRICE_EUR;
  return {
    planId,
    isLifetime: false,
    months,
    durationDays: months * DAYS_PER_MONTH,
    priceEUR,
    basePriceEUR,
    savingsEUR: basePriceEUR - priceEUR,
    discountApplied: months >= MONTHLY_DISCOUNT_FROM_MONTH,
    convertedToLifetime: false,
  };
}

export const PLAN_MONTHS: Record<PremiumPlanId, number | null> = {
  premium_monthly: 1,
  premium_2m: 2,
  premium_3m: 3,
  premium_4m: 4,
  premium_5m: 5,
  premium_6m: 6,
  premium_7m: 7,
  premium_8m: 8,
  premium_9m: 9,
  premium_lifetime: null,
};

export const PLAN_DURATION_DAYS: Record<PremiumPlanId, number | null> = {
  premium_monthly: 30,
  premium_2m: 60,
  premium_3m: 90,
  premium_4m: 120,
  premium_5m: 150,
  premium_6m: 180,
  premium_7m: 210,
  premium_8m: 240,
  premium_9m: 270,
  premium_lifetime: null,
};

export const PLAN_PRICE_EUR: Record<PremiumPlanId, number> = {
  premium_monthly: 4,
  premium_2m: 8,
  premium_3m: 12,
  premium_4m: 14,
  premium_5m: 16,
  premium_6m: 18,
  premium_7m: 20,
  premium_8m: 22,
  premium_9m: 24,
  premium_lifetime: 40,
};

export const PLAN_LABELS: Record<string, string> = {
  premium_monthly: 'Premium — 1 Month',
  premium_2m: 'Premium — 2 Months',
  premium_3m: 'Premium — 3 Months',
  premium_4m: 'Premium — 4 Months',
  premium_5m: 'Premium — 5 Months',
  premium_6m: 'Premium — 6 Months',
  premium_7m: 'Premium — 7 Months',
  premium_8m: 'Premium — 8 Months',
  premium_9m: 'Premium — 9 Months',
  premium_lifetime: 'Premium — Lifetime',
  basic_monthly: 'Basic Monthly (legacy)',
  basic_annual: 'Basic Annual (legacy)',
  pro_monthly: 'Pro Monthly (legacy)',
  pro_annual: 'Pro Annual (legacy)',
  ultimate_monthly: 'Ultimate Monthly (legacy)',
  ultimate_annual: 'Ultimate Annual (legacy)',
  ultimate_lifetime: 'Ultimate Lifetime (legacy)',
  monthly: 'Monthly (legacy)',
  yearly: 'Annual (legacy)',
  immortal: 'Lifetime (legacy)',
};

const LEGACY_ANNUAL_PLANS = new Set(['basic_annual', 'pro_annual', 'ultimate_annual', 'yearly']);

export function isPremiumPlanId(value: string): value is PremiumPlanId {
  return (ACTIVE_PLAN_IDS as readonly string[]).includes(value);
}

export function planToProductTier(_planId: PremiumPlanId | string): ProductTier {
  return 'premium';
}

export function getPlanLabel(planId: string): string {
  return PLAN_LABELS[planId] ?? planId;
}

export function getPlanExpiresAt(planId: PremiumPlanId | string): Date | null {
  if (LEGACY_ANNUAL_PLANS.has(planId)) {
    return new Date(Date.now() + 365 * 24 * 60 * 60 * 1000);
  }
  const resolved = resolvePlanId(planId);
  if (!resolved) return null;
  const days = PLAN_DURATION_DAYS[resolved];
  if (days === null) return null;
  return new Date(Date.now() + days * 24 * 60 * 60 * 1000);
}

export function resolvePlanId(plan: string): PremiumPlanId | null {
  if (isPremiumPlanId(plan)) return plan;
  const legacy: Record<string, PremiumPlanId> = {
    basic_monthly: 'premium_monthly',
    pro_monthly: 'premium_monthly',
    ultimate_monthly: 'premium_monthly',
    monthly: 'premium_monthly',
    basic_annual: 'premium_lifetime',
    pro_annual: 'premium_lifetime',
    ultimate_annual: 'premium_lifetime',
    yearly: 'premium_lifetime',
    ultimate_lifetime: 'premium_lifetime',
    immortal: 'premium_lifetime',
  };
  return legacy[plan] ?? null;
}
