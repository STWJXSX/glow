/**
 * Stored server-boost counts (written by the core boost sync job every 3h).
 *
 * Booster plan:
 *   1 boost  → premium commands + bulk, 5 accounts.
 *   2+ boosts → + paid automations (except Premium-only ones), 20 accounts.
 */

import GlowBoost from '#models/premium/GlowBoost.ts';
import { log } from '../logger.ts';

const CACHE_TTL_MS = 60_000;
const cache = new Map<string, { value: number; expiry: number }>();

function effectiveCount(doc: { boostCount?: number; manualCount?: number | null } | null): number {
  if (!doc) return 0;
  const computed = Math.max(0, doc.boostCount ?? 0);
  // Manual override only applies while the member is still boosting.
  if (computed === 0) return 0;
  return doc.manualCount != null ? Math.max(0, doc.manualCount) : computed;
}

/** Stored boost count; throws on DB error (callers that must not fail open). */
export async function getStoredBoostCountOrThrow(userId: string, fresh = false): Promise<number> {
  const cached = cache.get(userId);
  if (!fresh && cached && cached.expiry > Date.now()) return cached.value;
  const doc = await GlowBoost.findOne({ discordId: userId })
    .select('boostCount manualCount')
    .lean<{ boostCount: number; manualCount: number | null }>();
  const value = effectiveCount(doc);
  if (cache.size > 5000) cache.clear();
  cache.set(userId, { value, expiry: Date.now() + CACHE_TTL_MS });
  return value;
}

/** Stored boost count; 0 on DB error. */
export async function getStoredBoostCount(userId: string): Promise<number> {
  try {
    return await getStoredBoostCountOrThrow(userId);
  } catch (error) {
    log.database.error({ error, userId }, '[Boosts] Error reading stored boost count');
    return 0;
  }
}

export function invalidateBoostCache(userId?: string): void {
  if (userId) cache.delete(userId);
  else cache.clear();
}
