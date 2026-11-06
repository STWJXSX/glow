/**
 * Glow Premium — product tiers, automation access, and limits.
 *
 * Paid tiers: basic (1) < pro (2) < ultimate (3).
 * Booster: premium commands only; no bulk, no paid automations.
 * Legacy DB values monthly/yearly/immortal → ultimate (3).
 */

import type { PremiumTier } from '#models/premium/GlowPremium.ts';
import {
  AUTOCONFIG_KEY_TO_SYSTEM,
  buildAutomationMinTierMap,
  canAccessAutomationPaid,
  type AutomationSystemKey,
} from '#helpers/epic/automation/config.ts';

export type { AutomationSystemKey } from '#helpers/epic/automation/config.ts';
export { AUTOCONFIG_KEY_TO_SYSTEM };

export type PaidPremiumTier = 'basic' | 'pro' | 'ultimate';

/** Minimum paid tier level (1–3). 0 = free for everyone. Derived from automation/config.ts */
export const AUTOMATION_MIN_TIER: Record<AutomationSystemKey, number> = buildAutomationMinTierMap();

export const LEGACY_PAID_TIERS = new Set<PremiumTier>(['monthly', 'yearly', 'immortal']);

export function normalizePaidTier(tier: PremiumTier): PaidPremiumTier | 'booster' | 'custom' | null {
  if (tier === 'booster') return 'booster';
  if (tier === 'custom') return 'custom';
  if (tier === 'basic' || tier === 'pro' || tier === 'ultimate') return tier;
  if (LEGACY_PAID_TIERS.has(tier)) return 'ultimate';
  return null;
}

/** Numeric access level for perks: 0 = none/booster-only, 1–3 = paid tiers */
export function getPaidTierLevel(tier: PremiumTier, customTier: number | null): number {
  if (tier === 'custom' && customTier != null) {
    return Math.min(3, Math.max(0, customTier));
  }
  const normalized = normalizePaidTier(tier);
  if (normalized === 'basic') return 1;
  if (normalized === 'pro') return 2;
  if (normalized === 'ultimate') return 3;
  if (normalized === 'booster') return 0;
  return 0;
}

export function automationMinTier(system: AutomationSystemKey): number {
  return AUTOMATION_MIN_TIER[system] ?? 3;
}

export function canAccessAutomation(paidTierLevel: number, system: AutomationSystemKey): boolean {
  return canAccessAutomationPaid(paidTierLevel, system);
}

export const ACCOUNT_LIMIT_BY_TIER = {
  free: 2,
  booster: 5,
  basic: 10,
  pro: 50,
  ultimate: 256,
} as const;

export const TAXI_LIMIT_BY_TIER = {
  free: 1,
  booster: 1,
  basic: 25,
  pro: 25,
  ultimate: 25,
} as const;

export function accountLimitForPaidLevel(paidTierLevel: number, hasBooster: boolean): number {
  if (paidTierLevel >= 3) return ACCOUNT_LIMIT_BY_TIER.ultimate;
  if (paidTierLevel >= 2) return ACCOUNT_LIMIT_BY_TIER.pro;
  if (paidTierLevel >= 1) return ACCOUNT_LIMIT_BY_TIER.basic;
  if (hasBooster) return ACCOUNT_LIMIT_BY_TIER.booster;
  return ACCOUNT_LIMIT_BY_TIER.free;
}

export function taxiLimitForPaidLevel(paidTierLevel: number): number {
  if (paidTierLevel >= 1) return TAXI_LIMIT_BY_TIER.basic;
  return TAXI_LIMIT_BY_TIER.free;
}
