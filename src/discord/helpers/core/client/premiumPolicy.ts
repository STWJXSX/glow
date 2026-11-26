/**
 * Glow Premium — product tiers, automation access, and limits.
 *
 * Paid tier: premium (1) unlocks all automations, bulk mode, and max limits.
 * Booster (1 boost): premium commands + bulk, 5 accounts, no paid automations.
 * Booster (2+ boosts): + paid automations except AutoKick/AutoLoadout/AutoSurvivors, 20 accounts.
 * Legacy DB values basic/pro/ultimate/monthly/yearly/immortal → premium (1).
 */

import type { PremiumTier } from '#models/premium/GlowPremium.ts';
import {
  AUTOCONFIG_KEY_TO_SYSTEM,
  BOOSTER_AUTOMATION_MIN_BOOSTS,
  buildAutomationMinTierMap,
  canAccessAutomationPaid,
  type AutomationSystemKey,
} from '#helpers/epic/automation/config.ts';

export type { AutomationSystemKey } from '#helpers/epic/automation/config.ts';
export { AUTOCONFIG_KEY_TO_SYSTEM, BOOSTER_AUTOMATION_MIN_BOOSTS };

export type PaidPremiumTier = 'premium';

/** Minimum paid tier level (0 = free, 1 = paid Premium). Derived from automation/config.ts */
export const AUTOMATION_MIN_TIER: Record<AutomationSystemKey, number> = buildAutomationMinTierMap();

export const LEGACY_PAID_TIERS = new Set<PremiumTier>([
  'basic',
  'pro',
  'ultimate',
  'monthly',
  'yearly',
  'immortal',
]);

export function normalizePaidTier(tier: PremiumTier): PaidPremiumTier | 'booster' | 'custom' | null {
  if (tier === 'booster') return 'booster';
  if (tier === 'custom') return 'custom';
  if (tier === 'premium' || LEGACY_PAID_TIERS.has(tier)) return 'premium';
  return null;
}

/** Numeric access level for perks: 0 = none/booster-only, 1 = paid Premium */
export function getPaidTierLevel(tier: PremiumTier, customTier: number | null): number {
  if (tier === 'custom' && customTier != null) {
    return customTier >= 1 ? 1 : 0;
  }
  const normalized = normalizePaidTier(tier);
  if (normalized === 'premium') return 1;
  return 0;
}

export function automationMinTier(system: AutomationSystemKey): number {
  return AUTOMATION_MIN_TIER[system] ?? 1;
}

export function canAccessAutomation(
  paidTierLevel: number,
  system: AutomationSystemKey,
  boostCount = 0,
): boolean {
  return canAccessAutomationPaid(paidTierLevel, system, boostCount);
}

/** booster = 1 boost; booster2 = 2+ boosts (BOOSTER_AUTOMATION_MIN_BOOSTS). */
export const ACCOUNT_LIMIT_BY_TIER = {
  free: 2,
  booster: 5,
  booster2: 20,
  premium: 256,
} as const;

export const TAXI_LIMIT_BY_TIER = {
  free: 1,
  booster: 1,
  premium: 25,
} as const;

/** `boostCount` = server boosts (0 = not boosting). */
export function accountLimitForPaidLevel(paidTierLevel: number, boostCount: number): number {
  if (paidTierLevel >= 1) return ACCOUNT_LIMIT_BY_TIER.premium;
  if (boostCount >= BOOSTER_AUTOMATION_MIN_BOOSTS) return ACCOUNT_LIMIT_BY_TIER.booster2;
  if (boostCount >= 1) return ACCOUNT_LIMIT_BY_TIER.booster;
  return ACCOUNT_LIMIT_BY_TIER.free;
}

/** `boostCount` = server boosts; 2+ boosts get the Premium taxi limit. */
export function taxiLimitForPaidLevel(paidTierLevel: number, boostCount = 0): number {
  if (paidTierLevel >= 1 || boostCount >= BOOSTER_AUTOMATION_MIN_BOOSTS) return TAXI_LIMIT_BY_TIER.premium;
  return TAXI_LIMIT_BY_TIER.free;
}
