import { checkUserPremium, getRealUserPremium, resolvePremiumAccess, isPremiumCheckBypassed } from './premium.ts';
import {
  accountLimitForPaidLevel,
  taxiLimitForPaidLevel,
} from './premiumPolicy.ts';
import PremiumAccountGrace from '#models/PremiumAccountGrace.ts';

export const ACCOUNT_LIMITS = {
  FREE: 2,
  BOOSTER: 5,
  BASIC: 10,
  PRO: 50,
  ULTIMATE: 256,
} as const;

export const TAXI_LIMITS = {
  FREE: 1,
  BOOSTER: 1,
  PAID: 25,
} as const;

export const GRACE_PERIOD_MS = 24 * 60 * 60 * 1000;

async function paidLevelWithBooster(userId: string, client?: unknown): Promise<number> {
  const access = await resolvePremiumAccess(userId, client);
  if (access.paidTierLevel > 0) return access.paidTierLevel;
  if (access.isBoosterOnly) return 0;
  return 0;
}

export async function getAccountLimit(userId: string, client?: unknown): Promise<number> {
  const access = await resolvePremiumAccess(userId, client);
  if (access.paidTierLevel > 0) {
    return accountLimitForPaidLevel(access.paidTierLevel, false);
  }
  if (access.isBoosterOnly) return ACCOUNT_LIMITS.BOOSTER;
  return ACCOUNT_LIMITS.FREE;
}

export async function getRealAccountLimit(userId: string, client?: unknown): Promise<number> {
  const { tierLevel } = await getRealUserPremium(userId);
  if (tierLevel > 0) return accountLimitForPaidLevel(tierLevel, false);
  const boosted = client ? await resolvePremiumAccess(userId, client) : null;
  if (boosted?.isBoosterOnly) return ACCOUNT_LIMITS.BOOSTER;
  return ACCOUNT_LIMITS.FREE;
}

export async function getTaxiLimit(userId: string): Promise<number> {
  const { tierLevel } = await checkUserPremium(userId);
  return taxiLimitForPaidLevel(tierLevel);
}

export async function getRealTaxiLimit(userId: string): Promise<number> {
  const { tierLevel } = await getRealUserPremium(userId);
  return taxiLimitForPaidLevel(tierLevel);
}

export interface ResolvedLimit {
  max: number;
  graceActive: boolean;
  graceUntil: Date | null;
  excessAccounts: number;
  excessTaxi: number;
}

export async function resolveAccountRegistrationLimit(
  userId: string,
  currentCount: number,
  client?: unknown,
): Promise<ResolvedLimit> {
  const bypassLimit = await getAccountLimit(userId, client);
  if (isPremiumCheckBypassed()) {
    return {
      max: bypassLimit,
      graceActive: false,
      graceUntil: null,
      excessAccounts: 0,
      excessTaxi: 0,
    };
  }

  const realLimit = await getRealAccountLimit(userId, client);
  const grace = await PremiumAccountGrace.findOne({
    discordId: userId,
    graceUntil: { $gt: new Date() },
  }).lean();

  const excessAccounts = Math.max(0, currentCount - realLimit);
  const graceActive = !!grace && excessAccounts > 0;

  return {
    max: graceActive ? realLimit : bypassLimit,
    graceActive,
    graceUntil: grace?.graceUntil ?? null,
    excessAccounts,
    excessTaxi: 0,
  };
}

export async function resolveTaxiRegistrationLimit(
  userId: string,
  currentCount: number,
): Promise<ResolvedLimit> {
  const bypassLimit = await getTaxiLimit(userId);
  if (isPremiumCheckBypassed()) {
    return {
      max: bypassLimit,
      graceActive: false,
      graceUntil: null,
      excessAccounts: 0,
      excessTaxi: 0,
    };
  }

  const realLimit = await getRealTaxiLimit(userId);
  const grace = await PremiumAccountGrace.findOne({
    discordId: userId,
    graceUntil: { $gt: new Date() },
  }).lean();

  const excessTaxi = Math.max(0, currentCount - realLimit);
  const graceActive = !!grace && excessTaxi > 0;

  return {
    max: graceActive ? realLimit : bypassLimit,
    graceActive,
    graceUntil: grace?.graceUntil ?? null,
    excessAccounts: 0,
    excessTaxi,
  };
}
