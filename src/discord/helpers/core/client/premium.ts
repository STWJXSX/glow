/**
 * GLOW PREMIUM SYSTEM
 *
 * Paid tiers: basic (1) < pro (2) < ultimate (3).
 * Booster: premium commands only (no bulk, no paid automations).
 *
 * COMMAND FLAGS:
 *   prem            — booster or any paid tier
 *   premPro         — pro+ (level >= 2); premMonthly is an alias
 *   premUltimate    — ultimate only (level >= 3); premYearly / premImmortal alias
 *   premBooster     — booster-only gate (paid tiers also pass)
 */

import GlowPremium, { onGlowPremiumChange, type PremiumTier } from '#models/premium/GlowPremium.ts';
import GlowPremiumCheckState from '#models/premium/GlowPremiumCheckState.ts';
import { log } from '../logger.ts';
import type { Command } from '#structures/types.ts';
import {
  getPaidTierLevel,
  canAccessAutomation,
  type AutomationSystemKey,
} from './premiumPolicy.ts';
import {
  canAccessAutomationSystem,
  resolveAutomationConfig,
} from '#helpers/epic/automation/config.ts';
import type { AutoconfigPanelKey } from '#helpers/epic/automation/autoconfigStatus.ts';

// ─── Config ────────────────────────────────────────────────────
const BOOST_GUILD_ID = process.env.BOOST_GUILD_ID ?? process.env.SUPPORT_SERVER ?? '';

const PREMIUM_ROLE_GUILD_ID = process.env.PREMIUM_ROLE_GUILD_ID || process.env.PREMIUM_AUTO_GUILD_ID || BOOST_GUILD_ID;
const PREMIUM_ROLE_BASIC_ID = process.env.PREMIUM_ROLE_BASIC_ID ?? '';
const PREMIUM_ROLE_PRO_ID = process.env.PREMIUM_ROLE_PRO_ID ?? '';
const PREMIUM_ROLE_ULTIMATE_ID = process.env.PREMIUM_ROLE_ULTIMATE_ID ?? '';
/** @deprecated Use PREMIUM_ROLE_*_ID; kept for backward compatibility */
const PREMIUM_AUTO_ROLE_ID = process.env.PREMIUM_AUTO_ROLE_ID ?? '';

// ─── Types ─────────────────────────────────────────────────────

export type { PremiumTier } from '#models/premium/GlowPremium.ts';

export interface PremiumDoc {
  discordId: string;
  tier: PremiumTier;
  customTier: number | null;
  isActive: boolean;
  expiresAt: Date | null;
  createdAt: Date;
  roleIds: string[];
  guildId: string | null;
  grantedBy: string | null;
  key: string | null;
  notes: string | null;
  warningSent: boolean;
}

export interface PremiumResult {
  hasPremium: boolean;
  tier: PremiumTier | null;
  tierLevel: number;
  premiums: PremiumDoc[];
}

export interface CommandPremiumResult {
  allowed: boolean;
  reason: string | null;
  hasPremium: boolean;
  tier: PremiumTier | null;
  tierLevel: number;
}

export interface ResolvedPremiumAccess {
  /** Paid tier from DB: 0 = none, 1 = basic, 2 = pro, 3 = ultimate */
  paidTierLevel: number;
  canUsePremiumCommands: boolean;
  canUseBulk: boolean;
  isBoosterOnly: boolean;
  tier: PremiumTier | null;
  hasStoredPremium: boolean;
}

// ─── Helpers ───────────────────────────────────────────────────

/** Resolve numeric paid tier level for a premium document */
export function getTierLevel(tier: PremiumTier, customTier: number | null): number {
  return getPaidTierLevel(tier, customTier);
}

/** Get the highest tier level from a list of premiums */
function highestTierLevel(premiums: PremiumDoc[]): { tier: PremiumTier | null; level: number } {
  let best: PremiumTier | null = null;
  let bestLevel = 0;
  for (const p of premiums) {
    const lvl = getTierLevel(p.tier, p.customTier);
    if (lvl > bestLevel) {
      bestLevel = lvl;
      best = p.tier;
    }
  }
  return { tier: best, level: bestLevel };
}

// ─── Core queries ──────────────────────────────────────────────

/**
 * Get all active premiums for a user.
 * On DB error returns empty array.
 */
export async function getUserPremiums(userId: string): Promise<PremiumDoc[]> {
  try {
    const now = new Date();
    return await GlowPremium.find({
      discordId: userId,
      isActive: true,
      $or: [
        { expiresAt: { $gt: now } },
        { expiresAt: null },
      ],
    }).lean<PremiumDoc[]>() ?? [];
  } catch (error) {
    log.database.error({ error, userId }, '[Premium] Error fetching user premiums');
    return [];
  }
}

/**
 * Check premium status for a user. Returns highest tier info.
 * Respects global premium bypass (treats user as immortal during bypass).
 */
export async function checkUserPremium(userId: string): Promise<PremiumResult> {
  if (isPremiumCheckBypassed()) {
    return { hasPremium: true, tier: 'ultimate', tierLevel: 3, premiums: [] };
  }
  return getRealUserPremium(userId);
}

/**
 * Real premium from DB only — never affected by bypass.
 * Use for grace enforcement and downgrade detection.
 */
// Short per-user cache: one command used to run the premium + booster checks twice.
const PREMIUM_CACHE_TTL_MS = 60_000;
const realPremiumCache = new Map<string, { value: PremiumResult; expiry: number }>();
const boosterCache = new Map<string, { value: boolean; expiry: number }>();

/** Drop cached premium/booster state (call after granting or removing premium). */
export function invalidatePremiumCache(userId?: string): void {
  if (userId) {
    realPremiumCache.delete(userId);
    boosterCache.delete(userId);
  } else {
    realPremiumCache.clear();
    boosterCache.clear();
  }
}

// Any premium write (grant, renewal, expiry, admin removal) clears the cached state.
onGlowPremiumChange((discordId) => invalidatePremiumCache(discordId));

function pruneCache<T>(cache: Map<string, { value: T; expiry: number }>): void {
  if (cache.size < 5000) return;
  const now = Date.now();
  for (const [key, entry] of cache) if (entry.expiry <= now) cache.delete(key);
}

export async function getRealUserPremium(userId: string): Promise<PremiumResult> {
  const cached = realPremiumCache.get(userId);
  if (cached && cached.expiry > Date.now()) return cached.value;
  const value = await getRealUserPremiumUncached(userId);
  pruneCache(realPremiumCache);
  realPremiumCache.set(userId, { value, expiry: Date.now() + PREMIUM_CACHE_TTL_MS });
  return value;
}

async function getRealUserPremiumUncached(userId: string): Promise<PremiumResult> {
  const premiums = await getUserPremiums(userId);
  if (premiums.length === 0) {
    return { hasPremium: false, tier: null, tierLevel: 0, premiums: [] };
  }
  const { tier, level } = highestTierLevel(premiums);
  return { hasPremium: true, tier, tierLevel: level, premiums };
}

// ─── Specific tier checks ──────────────────────────────────────

/** Any premium at all (level >= 1) */
export async function hasAnyPremium(userId: string): Promise<boolean> {
  const { hasPremium } = await checkUserPremium(userId);
  return hasPremium;
}

/** Paid basic or higher (level >= 1) */
export async function hasBasicPlus(userId: string): Promise<boolean> {
  const { tierLevel } = await checkUserPremium(userId);
  return tierLevel >= 1;
}

/** Pro or higher (level >= 2) */
export async function hasProPlus(userId: string): Promise<boolean> {
  const { tierLevel } = await checkUserPremium(userId);
  return tierLevel >= 2;
}

/** @deprecated Use hasProPlus */
export async function hasMonthlyPlus(userId: string): Promise<boolean> {
  return hasProPlus(userId);
}

/** Ultimate (level >= 3) */
export async function hasUltimatePlus(userId: string): Promise<boolean> {
  const { tierLevel } = await checkUserPremium(userId);
  return tierLevel >= 3;
}

/** @deprecated Use hasUltimatePlus */
export async function hasYearlyPlus(userId: string): Promise<boolean> {
  return hasUltimatePlus(userId);
}

/** @deprecated Use hasUltimatePlus */
export async function hasImmortal(userId: string): Promise<boolean> {
  return hasUltimatePlus(userId);
}

/** @deprecated Use hasProPlusOrThrow */
export async function hasMonthlyPlusOrThrow(userId: string): Promise<boolean> {
  return hasProPlusOrThrow(userId);
}

export async function hasProPlusOrThrow(userId: string): Promise<boolean> {
  return (await getStoredPaidTierLevelOrThrow(userId)) >= 2;
}

export async function getStoredPaidTierLevelOrThrow(userId: string): Promise<number> {
  if (isPremiumCheckBypassed()) return 3;
  const now = new Date();
  const premiums = await GlowPremium.find({
    discordId: userId,
    isActive: true,
    $or: [
      { expiresAt: { $gt: now } },
      { expiresAt: null },
    ],
  }).lean<PremiumDoc[]>();

  if (!premiums?.length) return 0;

  let bestLevel = 0;
  for (const p of premiums) {
    const lvl = getTierLevel(p.tier, p.customTier);
    if (lvl > bestLevel) bestLevel = lvl;
  }
  return bestLevel;
}

export async function hasAutomationAccessOrThrow(
  userId: string,
  system: AutomationSystemKey,
): Promise<boolean> {
  const level = await getStoredPaidTierLevelOrThrow(userId);
  return canAccessAutomation(level, system);
}

/**
 * Any stored paid tier (level >= 1), but throws on DB error.
 */
export async function hasBoosterPlusOrThrow(userId: string): Promise<boolean> {
  return (await getStoredPaidTierLevelOrThrow(userId)) >= 1;
}

/**
 * Check if user is a Discord Nitro Booster in the configured guild.
 * Does NOT check DB premium — purely Discord boost status.
 */
export async function isBooster(userId: string, client: any): Promise<boolean> {
  if (!BOOST_GUILD_ID || !client) return false;
  const cached = boosterCache.get(userId);
  if (cached && cached.expiry > Date.now()) return cached.value;
  let value = false;
  try {
    const guild = await client.guilds.fetch(BOOST_GUILD_ID).catch(() => null);
    if (guild) {
      const member = await guild.members.fetch(userId).catch(() => null);
      value = !!member?.premiumSince;
    }
  } catch {
    value = false;
  }
  pruneCache(boosterCache);
  boosterCache.set(userId, { value, expiry: Date.now() + PREMIUM_CACHE_TTL_MS });
  return value;
}

export async function resolvePremiumAccess(userId: string, client?: any): Promise<ResolvedPremiumAccess> {
  if (isPremiumCheckBypassed()) {
    return {
      paidTierLevel: 3,
      canUsePremiumCommands: true,
      canUseBulk: true,
      isBoosterOnly: false,
      tier: 'ultimate',
      hasStoredPremium: true,
    };
  }

  const real = await getRealUserPremium(userId);
  const boosted = client ? await isBooster(userId, client) : false;
  const canUsePremiumCommands = real.hasPremium || boosted;

  return {
    paidTierLevel: real.tierLevel,
    canUsePremiumCommands,
    canUseBulk: real.tierLevel >= 1,
    isBoosterOnly: !real.hasPremium && boosted,
    tier: real.tier,
    hasStoredPremium: real.hasPremium,
  };
}

export async function canUseBulkMode(userId: string, client?: any): Promise<boolean> {
  const access = await resolvePremiumAccess(userId, client);
  return access.canUseBulk;
}

export function tierRoleIdForLevel(paidTierLevel: number): string | null {
  if (paidTierLevel >= 3 && PREMIUM_ROLE_ULTIMATE_ID) return PREMIUM_ROLE_ULTIMATE_ID;
  if (paidTierLevel >= 2 && PREMIUM_ROLE_PRO_ID) return PREMIUM_ROLE_PRO_ID;
  if (paidTierLevel >= 1 && PREMIUM_ROLE_BASIC_ID) return PREMIUM_ROLE_BASIC_ID;
  return PREMIUM_AUTO_ROLE_ID || null;
}

export function allConfiguredPremiumRoleIds(): string[] {
  return [PREMIUM_ROLE_BASIC_ID, PREMIUM_ROLE_PRO_ID, PREMIUM_ROLE_ULTIMATE_ID, PREMIUM_AUTO_ROLE_ID]
    .filter(Boolean);
}

// ─── Global premium-check bypass (DB-backed) ─────────────────────

interface PremiumCheckCache {
  checksDisabled: boolean;
  bypassUntil: number | null;
  graceScanPending: boolean;
  durationLabel: string | null;
}

const DEFAULT_CACHE: PremiumCheckCache = {
  checksDisabled: false,
  bypassUntil: null,
  graceScanPending: false,
  durationLabel: null,
};

let premiumCheckCache: PremiumCheckCache = { ...DEFAULT_CACHE };

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;

export interface PremiumCheckBypassInfo {
  bypassed: boolean;
  source: 'env' | 'development' | 'database' | null;
  until: Date | null;
  durationLabel: string | null;
}

/** Parse duration: 4h, 2d, 1w, 3m (months = 30 days). No minutes. */
export function parsePremiumCheckDuration(input: string): number | null {
  const m = input.trim().toLowerCase().match(/^(\d+)(h|d|w|m)$/);
  if (!m) return null;

  const amount = Number(m[1]);
  if (!Number.isFinite(amount) || amount <= 0) return null;

  switch (m[2]) {
    case 'h': return amount * HOUR_MS;
    case 'd': return amount * DAY_MS;
    case 'w': return amount * 7 * DAY_MS;
    case 'm': return amount * 30 * DAY_MS;
    default: return null;
  }
}

function applyCacheFromDoc(doc: {
  checksEnabled: boolean;
  bypassUntil: Date | null;
  graceScanPending: boolean;
  durationLabel: string | null;
}): void {
  if (doc.checksEnabled) {
    premiumCheckCache = {
      checksDisabled: false,
      bypassUntil: null,
      graceScanPending: doc.graceScanPending,
      durationLabel: null,
    };
    return;
  }

  const untilMs = doc.bypassUntil?.getTime() ?? null;
  premiumCheckCache = {
    checksDisabled: true,
    bypassUntil: untilMs,
    graceScanPending: doc.graceScanPending,
    durationLabel: doc.durationLabel,
  };
}

/** Load bypass state from MongoDB (call on bot ready). */
export async function loadPremiumCheckState(): Promise<void> {
  try {
    let doc = await GlowPremiumCheckState.findOne({ key: 'global' });
    if (!doc) {
      premiumCheckCache = { ...DEFAULT_CACHE };
      return;
    }

    if (!doc.checksEnabled && doc.bypassUntil && doc.bypassUntil.getTime() <= Date.now()) {
      doc.checksEnabled = true;
      doc.bypassUntil = null;
      doc.durationLabel = null;
      doc.graceScanPending = true;
      await doc.save();
    }

    applyCacheFromDoc(doc);
    log.bot.info(
      {
        checksDisabled: premiumCheckCache.checksDisabled,
        until: premiumCheckCache.bypassUntil,
        duration: premiumCheckCache.durationLabel,
      },
      '[Premium] Premium check state loaded from DB',
    );
  } catch (error) {
    log.database.error({ error }, '[Premium] Failed to load premium check state — checks enabled by default');
    premiumCheckCache = { ...DEFAULT_CACHE };
  }
}

/** Slash commands for the premium product (redeem, admin). Not registered in free mode. */
export const PREMIUM_PRODUCT_COMMAND_NAMES = new Set(['premium', 'premium-admin']);

/**
 * Register `/premium` and `/premium-admin` with Discord only while monetization is on.
 * Free mode: `PREMIUM_CHECK=false`, or DB `premiumcheck` disabled (checks bypassed).
 */
export function shouldRegisterPremiumProductCommands(): boolean {
  if (process.env.PREMIUM_CHECK === 'false') return false;

  if (process.env.NODE_ENV === 'development') {
    return process.env.PREMIUM_PRODUCT_COMMANDS !== 'false';
  }

  if (!premiumCheckCache.checksDisabled) return true;
  if (premiumCheckCache.bypassUntil !== null && Date.now() >= premiumCheckCache.bypassUntil) {
    return true;
  }
  return false;
}

export function isPremiumProductCommandName(name: string): boolean {
  return PREMIUM_PRODUCT_COMMAND_NAMES.has(name);
}

/** True when premium requirements should be skipped (env, dev, or DB bypass). */
export function isPremiumCheckBypassed(): boolean {
  if (process.env.PREMIUM_CHECK === 'false') return true;
  if (process.env.NODE_ENV === 'development') return true;

  if (!premiumCheckCache.checksDisabled) return false;
  if (premiumCheckCache.bypassUntil === null) return true;
  return Date.now() < premiumCheckCache.bypassUntil;
}

export function getPremiumCheckBypassInfo(): PremiumCheckBypassInfo {
  if (process.env.PREMIUM_CHECK === 'false') {
    return { bypassed: true, source: 'env', until: null, durationLabel: null };
  }
  if (process.env.NODE_ENV === 'development') {
    return { bypassed: true, source: 'development', until: null, durationLabel: null };
  }

  if (premiumCheckCache.checksDisabled) {
    if (premiumCheckCache.bypassUntil !== null && Date.now() >= premiumCheckCache.bypassUntil) {
      return { bypassed: false, source: null, until: null, durationLabel: null };
    }

    return {
      bypassed: true,
      source: 'database',
      until: premiumCheckCache.bypassUntil ? new Date(premiumCheckCache.bypassUntil) : null,
      durationLabel: premiumCheckCache.durationLabel,
    };
  }

  return { bypassed: false, source: null, until: null, durationLabel: null };
}

/**
 * Enable/disable premium checks (persisted in DB).
 * duration examples: 4h, 31d, 2w, 3m — omit for indefinite bypass.
 */
export async function setPremiumCheckBypass(
  enabled: boolean,
  duration?: string | null,
  setBy?: string | null,
): Promise<void> {
  const hadBypass = premiumCheckCache.checksDisabled;

  if (enabled) {
    const doc = await GlowPremiumCheckState.findOneAndUpdate(
      { key: 'global' },
      {
        checksEnabled: true,
        bypassUntil: null,
        durationLabel: null,
        graceScanPending: hadBypass,
        updatedBy: setBy ?? null,
        updatedAt: new Date(),
      },
      { upsert: true, new: true },
    );
    applyCacheFromDoc(doc!);
    return;
  }

  let bypassUntil: Date | null = null;
  let durationLabel: string | null = null;

  if (duration?.trim()) {
    const ms = parsePremiumCheckDuration(duration);
    if (ms === null) {
      throw new Error('Invalid duration. Use: 4h, 2d, 1w, 3m (hours, days, weeks, months).');
    }
    bypassUntil = new Date(Date.now() + ms);
    durationLabel = duration.trim().toLowerCase();
  }

  const doc = await GlowPremiumCheckState.findOneAndUpdate(
    { key: 'global' },
    {
      checksEnabled: false,
      bypassUntil,
      durationLabel,
      graceScanPending: false,
      updatedBy: setBy ?? null,
      updatedAt: new Date(),
    },
    { upsert: true, new: true },
  );
  applyCacheFromDoc(doc!);
}

export function consumePendingGraceScan(): boolean {
  if (!premiumCheckCache.graceScanPending) return false;
  premiumCheckCache.graceScanPending = false;
  void GlowPremiumCheckState.updateOne({ key: 'global' }, { graceScanPending: false }).catch(() => {});
  return true;
}

/** Re-enable checks when timed bypass expires. Returns true if it just expired. */
export async function checkBypassJustExpired(): Promise<boolean> {
  if (!premiumCheckCache.checksDisabled) return false;
  if (premiumCheckCache.bypassUntil === null) return false;
  if (Date.now() < premiumCheckCache.bypassUntil) return false;

  await setPremiumCheckBypass(true, null, null);
  return true;
}

// ─── Command requirement checker ───────────────────────────────

/**
 * Main checker used by interactionCreate pipeline.
 *
 *   prem / premBooster     — booster or any paid tier
 *   premPro / premMonthly  — paid tier level >= 2
 *   premUltimate / yearly / immortal — paid tier level >= 3
 */
export async function checkAutomationCommandAccess(
  userId: string,
  panelKey: AutoconfigPanelKey,
  client: any,
): Promise<CommandPremiumResult> {
  if (isPremiumCheckBypassed()) {
    return { allowed: true, reason: null, hasPremium: true, tier: 'ultimate', tierLevel: 3 };
  }

  const access = await resolvePremiumAccess(userId, client);
  const allowed = canAccessAutomationSystem(
    access.paidTierLevel,
    access.canUsePremiumCommands,
    panelKey,
  );

  if (allowed) {
    return {
      allowed: true,
      reason: null,
      hasPremium: access.canUsePremiumCommands,
      tier: access.tier,
      tierLevel: access.paidTierLevel,
    };
  }

  const { requiredTier } = resolveAutomationConfig(panelKey);
  const reasonKey = requiredTier === 'ultimate'
    ? 'ultimate_premium_required'
    : requiredTier === 'pro'
      ? 'pro_premium_required'
      : 'premium_required';

  return {
    allowed: false,
    reason: reasonKey,
    hasPremium: access.hasStoredPremium,
    tier: access.tier,
    tierLevel: access.paidTierLevel,
  };
}

export async function checkCommandPremiumRequirements(
  command: Command,
  userId: string,
  _serverId: string | null,
  client: any,
): Promise<CommandPremiumResult> {
  if (command.automationSystem) {
    return checkAutomationCommandAccess(userId, command.automationSystem, client);
  }

  const requiresPremium =
    command.prem || command.premPro || command.premMonthly || command.premUltimate ||
    command.premYearly || command.premImmortal || command.premBooster;

  if (!requiresPremium) {
    return { allowed: true, reason: null, hasPremium: false, tier: null, tierLevel: 0 };
  }

  if (isPremiumCheckBypassed()) {
    log.commands.debug({ userId }, '[Premium] Premium check bypassed');
    return { allowed: true, reason: null, hasPremium: true, tier: 'ultimate', tierLevel: 3 };
  }

  let result: PremiumResult;
  try {
    result = await getRealUserPremium(userId);
  } catch (error) {
    log.database.error({ error, userId }, '[Premium] DB error — allowing by default');
    return { allowed: true, reason: null, hasPremium: true, tier: null, tierLevel: 0 };
  }

  const boosted = await isBooster(userId, client);
  const paidLevel = result.tierLevel;
  const commandAccess = result.hasPremium || boosted;

  if (command.premBooster && !command.prem && !command.premPro && !command.premMonthly
    && !command.premUltimate && !command.premYearly && !command.premImmortal) {
    if (!commandAccess) {
      return { allowed: false, reason: 'premium_required', hasPremium: false, tier: null, tierLevel: 0 };
    }
    return {
      allowed: true,
      reason: null,
      hasPremium: commandAccess,
      tier: result.tier ?? (boosted ? 'booster' : null),
      tierLevel: paidLevel,
    };
  }

  let requiredLevel = 0;
  let reasonKey = 'premium_required';

  if (command.premUltimate || command.premYearly || command.premImmortal) {
    requiredLevel = 3;
    reasonKey = 'ultimate_premium_required';
  } else if (command.premPro || command.premMonthly) {
    requiredLevel = 2;
    reasonKey = 'pro_premium_required';
  } else if (command.prem) {
    requiredLevel = 0;
    reasonKey = 'premium_required';
  }

  if (command.prem && requiredLevel === 0) {
    if (!commandAccess) {
      return { allowed: false, reason: reasonKey, hasPremium: false, tier: null, tierLevel: paidLevel };
    }
    return {
      allowed: true,
      reason: null,
      hasPremium: true,
      tier: result.tier ?? (boosted ? 'booster' : null),
      tierLevel: paidLevel,
    };
  }

  if (paidLevel < requiredLevel) {
    return {
      allowed: false,
      reason: reasonKey,
      hasPremium: result.hasPremium,
      tier: result.tier,
      tierLevel: paidLevel,
    };
  }

  return { allowed: true, reason: null, hasPremium: true, tier: result.tier, tierLevel: paidLevel };
}

// ─── Compatibility ─────────────────────────────────────────────

export async function hasUserPremium(userId: string): Promise<boolean> {
  return hasAnyPremium(userId);
}

// ─── Auto-role management ──────────────────────────────────────

/**
 * Grant the auto premium role to a user.
 * Call after granting/redeeming premium.
 */
export async function grantPremiumAutoRole(client: any, userId: string, paidTierLevel?: number): Promise<void> {
  await syncPremiumTierRoles(client, userId, paidTierLevel);
}

export async function revokePremiumAutoRole(client: any, userId: string): Promise<void> {
  if (isPremiumCheckBypassed()) return;
  await syncPremiumTierRoles(client, userId, 0);
}

/**
 * Grant exactly one tier role (basic / pro / ultimate) and remove the others.
 */
export async function syncPremiumTierRoles(
  client: any,
  userId: string,
  paidTierLevel?: number,
): Promise<void> {
  if (isPremiumCheckBypassed()) return;
  if (!PREMIUM_ROLE_GUILD_ID || !client) return;

  let level = paidTierLevel;
  if (level === undefined) {
    const { tierLevel } = await getRealUserPremium(userId);
    level = tierLevel;
  }

  const targetRoleId = tierRoleIdForLevel(level ?? 0);
  const allRoles = allConfiguredPremiumRoleIds();
  if (!targetRoleId && allRoles.length === 0) return;

  try {
    const guild = await client.guilds.fetch(PREMIUM_ROLE_GUILD_ID).catch(() => null);
    if (!guild) return;
    const member = await guild.members.fetch(userId).catch(() => null);
    if (!member) return;

    for (const roleId of allRoles) {
      if (roleId === targetRoleId) continue;
      if (member.roles.cache.has(roleId)) {
        await member.roles.remove(roleId, 'Premium tier sync').catch(() => {});
      }
    }

    if (targetRoleId && !member.roles.cache.has(targetRoleId)) {
      await member.roles.add(targetRoleId, 'Premium tier sync').catch(() => {});
    }
  } catch {
    // Best effort
  }
}
