/**
 * Bulk guild role sync for devtool — paced under Discord member PATCH limits
 * (≈10 requests / 10s per guild on /guilds/{id}/members/{id}).
 */

import { EmbedBuilder, type Client, type Guild, type GuildMember } from 'discord.js';
import GlowPremium from '#models/premium/GlowPremium.ts';
import { SERVER_CONFIG } from '#events/guild/config/serverConfig.ts';
import {
  allConfiguredPremiumRoleIds,
  getTierLevel,
  tierRoleIdForLevel,
} from '#helpers/core/client/premium.ts';
import { log } from '#helpers/core/logger.ts';

/** Stay below Discord's ~10 member-modify requests per 10s guild bucket */
const PATCH_LIMIT = 9;
const PATCH_WINDOW_MS = 10_000;
const PROGRESS_MIN_INTERVAL_MS = 4_000;

export interface RoleSyncStats {
  total: number;
  processed: number;
  updated: number;
  skipped: number;
  errors: number;
  elapsedMs: number;
}

export type RoleSyncProgress = RoleSyncStats & { phase: string };

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isRateLimitError(err: unknown): boolean {
  const e = err as { status?: number; code?: number; retryAfter?: number };
  return e?.status === 429 || e?.code === 429;
}

function retryAfterMs(err: unknown): number {
  const e = err as { retryAfter?: number; rawError?: { retry_after?: number } };
  const seconds = e?.retryAfter ?? e?.rawError?.retry_after ?? 1;
  return Math.ceil(seconds * 1000) + 100;
}

/** Schedules member role API calls under the guild member-modify bucket */
class MemberModifyRateLimiter {
  private queue: Array<() => Promise<void>> = [];
  private pumping = false;
  private timestamps: number[] = [];

  schedule<T>(fn: () => Promise<T>): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      this.queue.push(async () => {
        try {
          resolve(await fn());
        } catch (err) {
          reject(err);
        }
      });
      this.pump();
    });
  }

  private async pump(): Promise<void> {
    if (this.pumping) return;
    this.pumping = true;

    while (this.queue.length > 0) {
      const now = Date.now();
      this.timestamps = this.timestamps.filter((t) => now - t < PATCH_WINDOW_MS);

      if (this.timestamps.length >= PATCH_LIMIT) {
        const oldest = this.timestamps[0] ?? now;
        await sleep(PATCH_WINDOW_MS - (now - oldest) + 50);
        continue;
      }

      const task = this.queue.shift();
      if (!task) break;

      this.timestamps.push(Date.now());
      await task();
    }

    this.pumping = false;
    if (this.queue.length > 0) this.pump();
  }
}

const memberModifyLimiter = new MemberModifyRateLimiter();

async function withRateLimitRetry(fn: () => Promise<unknown>, maxRetries = 6): Promise<void> {
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      await fn();
      return;
    } catch (err) {
      if (isRateLimitError(err) && attempt < maxRetries - 1) {
        await sleep(retryAfterMs(err));
        continue;
      }
      throw err;
    }
  }
}

async function applyMemberRoleChange(
  member: GuildMember,
  newRoleIds: string[],
  reason: string,
): Promise<boolean> {
  const current = [...member.roles.cache.keys()].filter((id) => id !== member.guild.id);
  const sortedCurrent = [...current].sort();
  const sortedNew = [...newRoleIds].sort();

  if (
    sortedCurrent.length === sortedNew.length
    && sortedCurrent.every((id, i) => id === sortedNew[i])
  ) {
    return false;
  }

  await memberModifyLimiter.schedule(() =>
    withRateLimitRetry(() => member.guild.members.edit(member.id, { roles: newRoleIds, reason })),
  );
  return true;
}

function tierLevelForRoleId(roleId: string): number {
  const basic = process.env.PREMIUM_ROLE_BASIC_ID ?? '';
  const pro = process.env.PREMIUM_ROLE_PRO_ID ?? '';
  const ultimate = process.env.PREMIUM_ROLE_ULTIMATE_ID ?? '';
  if (roleId === ultimate) return 3;
  if (roleId === pro) return 2;
  if (roleId === basic) return 1;
  return 0;
}

async function buildExpectedPremiumRoleMap(): Promise<Map<string, string>> {
  const now = new Date();
  const docs = await GlowPremium.find({
    isActive: true,
    $or: [{ expiresAt: { $gt: now } }, { expiresAt: null }],
  }).lean();

  const map = new Map<string, string>();

  for (const doc of docs) {
    const level = getTierLevel(doc.tier, doc.customTier);
    if (level < 1) continue;

    const roleId = tierRoleIdForLevel(level);
    if (!roleId) continue;

    const existing = map.get(doc.discordId);
    if (!existing) {
      map.set(doc.discordId, roleId);
      continue;
    }

    if (level > tierLevelForRoleId(existing)) {
      map.set(doc.discordId, roleId);
    }
  }

  return map;
}

function buildPremiumRoles(
  member: GuildMember,
  expectedRoleId: string | null,
  premiumRoleIds: string[],
): string[] {
  const kept = [...member.roles.cache.keys()]
    .filter((id) => id !== member.guild.id && !premiumRoleIds.includes(id));

  if (expectedRoleId) kept.push(expectedRoleId);
  return kept;
}

async function runWithProgress(
  total: number,
  phase: string,
  onProgress: ((stats: RoleSyncProgress) => void | Promise<void>) | undefined,
  runner: (emit: (processed: number, updated: number, skipped: number, errors: number) => Promise<void>) => Promise<void>,
): Promise<RoleSyncStats> {
  const start = Date.now();
  let lastEmit = 0;
  let processed = 0;
  let updated = 0;
  let skipped = 0;
  let errors = 0;

  const emit = async (
    nextProcessed: number,
    nextUpdated: number,
    nextSkipped: number,
    nextErrors: number,
  ) => {
    processed = nextProcessed;
    updated = nextUpdated;
    skipped = nextSkipped;
    errors = nextErrors;

    const now = Date.now();
    if (!onProgress || now - lastEmit < PROGRESS_MIN_INTERVAL_MS) return;
    lastEmit = now;

    await onProgress({
      phase,
      total,
      processed,
      updated,
      skipped,
      errors,
      elapsedMs: now - start,
    });
  };

  await runner(emit);

  const stats: RoleSyncStats = {
    total,
    processed,
    updated,
    skipped,
    errors,
    elapsedMs: Date.now() - start,
  };

  if (onProgress) {
    await onProgress({ phase: 'done', ...stats });
  }

  return stats;
}

export async function syncMemberRoles(
  guild: Guild,
  onProgress?: (stats: RoleSyncProgress) => void | Promise<void>,
): Promise<RoleSyncStats> {
  const roleId = SERVER_CONFIG.MEMBER_ROLE_ID;
  const queue = [...guild.members.cache.filter((m) => !m.roles.cache.has(roleId)).values()];
  const skippedAlready = guild.members.cache.size - queue.length;

  return runWithProgress(queue.length, 'member', onProgress, async (emit) => {
    let processed = 0;
    let updated = 0;
    const skipped = skippedAlready;
    let errors = 0;

    for (const member of queue) {
      try {
        await memberModifyLimiter.schedule(() =>
          withRateLimitRetry(() =>
            member.roles.add(roleId, 'DevTool — member role sync'),
          ),
        );
        updated++;
      } catch (err) {
        errors++;
        log.commands.warn({ err, memberId: member.id }, '[role-sync] member role failed');
      }

      processed++;
      await emit(processed, updated, skipped, errors);
    }
  });
}

export async function syncPremiumRolesBulk(
  guild: Guild,
  onProgress?: (stats: RoleSyncProgress) => void | Promise<void>,
): Promise<RoleSyncStats> {
  const premiumRoleIds = allConfiguredPremiumRoleIds();
  if (premiumRoleIds.length === 0) {
    throw new Error('No PREMIUM_ROLE_*_ID configured in environment');
  }

  const expectedMap = await buildExpectedPremiumRoleMap();
  const membersToSync = new Map<string, GuildMember>();

  for (const [discordId] of expectedMap) {
    const member = guild.members.cache.get(discordId);
    if (member) membersToSync.set(discordId, member);
  }

  for (const roleId of premiumRoleIds) {
    const role = guild.roles.cache.get(roleId);
    if (!role) continue;
    for (const member of role.members.values()) {
      membersToSync.set(member.id, member);
    }
  }

  const queue = [...membersToSync.values()];

  return runWithProgress(queue.length, 'premium', onProgress, async (emit) => {
    let processed = 0;
    let updated = 0;
    let skipped = 0;
    let errors = 0;

    for (const member of queue) {
      const expectedRole = expectedMap.get(member.id) ?? null;
      const newRoles = buildPremiumRoles(member, expectedRole, premiumRoleIds);

      try {
        const changed = await applyMemberRoleChange(
          member,
          newRoles,
          'DevTool — premium tier sync',
        );
        if (changed) updated++;
        else skipped++;
      } catch (err) {
        errors++;
        log.commands.warn({ err, memberId: member.id }, '[role-sync] premium role failed');
      }

      processed++;
      await emit(processed, updated, skipped, errors);
    }
  });
}

export async function resolveSupportGuild(client: Client): Promise<Guild | null> {
  const guildId = SERVER_CONFIG.GUILD_ID;
  return client.guilds.fetch(guildId).catch(() => null);
}

export function buildRoleSyncResultEmbed(
  type: 'member' | 'premium',
  guild: Guild,
  stats: RoleSyncStats,
): EmbedBuilder {
  const label = type === 'member' ? 'Member role' : 'Premium tiers';
  const seconds = (stats.elapsedMs / 1000).toFixed(1);

  return new EmbedBuilder()
    .setColor(stats.errors > 0 ? 0xffa500 : 0x00ae86)
    .setTitle(`Role sync — ${label}`)
    .setDescription(`Guild: **${guild.name}** (${guild.id})`)
    .addFields(
      { name: 'Queued', value: String(stats.total), inline: true },
      { name: 'Processed', value: String(stats.processed), inline: true },
      { name: 'Updated', value: String(stats.updated), inline: true },
      { name: 'Skipped', value: String(stats.skipped), inline: true },
      { name: 'Errors', value: String(stats.errors), inline: true },
      { name: 'Duration', value: `${seconds}s`, inline: true },
    )
    .setTimestamp();
}
