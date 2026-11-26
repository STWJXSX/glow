/**
 * Blacklist gate for commands. The blacklist lives in Glow Services (shared with the web dashboard
 * and the launcher); the bot only asks whether a user may run commands and caches the answer.
 */

import type { ChatInputCommandInteraction } from 'discord.js';
import { log } from '../logger.ts';
import { callCore, isGlowCoreEnabled } from '../../../api/glowCore.ts';

const CACHE_TTL_MS = 60_000;
const MAX_CACHE = 5_000;

const cache = new Map<string, { blocked: boolean; expires: number }>();

/** Drops cached answers (one user, or all) after a ban/unban so it applies at once. */
export function invalidateBlacklistGate(userId?: string): void {
  if (userId) cache.delete(userId);
  else cache.clear();
}

async function isBlocked(userId: string): Promise<boolean> {
  const hit = cache.get(userId);
  if (hit && hit.expires > Date.now()) return hit.blocked;
  if (!isGlowCoreEnabled()) return false;

  try {
    const blocked = (await callCore<{ blocked: boolean }>('blacklist.check', userId)).blocked === true;
    if (cache.size >= MAX_CACHE) cache.clear();
    cache.set(userId, { blocked, expires: Date.now() + CACHE_TTL_MS });
    return blocked;
  } catch (err) {
    log.bot.warn({ err, userId }, 'Blacklist no disponible — se usa el último resultado conocido');
    return hit?.blocked ?? false;
  }
}

export async function checkBlacklist(
  interaction: ChatInputCommandInteraction,
): Promise<{ allowed: boolean; reason?: string }> {
  return (await isBlocked(interaction.user.id)) ? { allowed: false, reason: 'blacklisted' } : { allowed: true };
}
