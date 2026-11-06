/**
 * PUBLIC STATS
 *
 * Single live embed in the public stats channel, edited in place every few minutes.
 * Recognizes its own message by the title in the embed description so restarts reuse it.
 */

import { EmbedBuilder, Events, type Message } from 'discord.js';
import os from 'os';
import mongoose from 'mongoose';
import type { BotEvent, ExtendedClient } from '#structures/types.ts';
import { log } from '#helpers/core/logger.ts';
import { EMBED_COLORS } from '#helpers/core/embedHelper.ts';
import { SERVER_CONFIG } from '../config/serverConfig.ts';
import { initBotLogs, LOG_CHANNEL_ID } from '#helpers/discord/channelLogs/botLogs.ts';
import UsuarioInfo from '#models/UsuarioInfo.ts';
import GlowPremium from '#models/premium/GlowPremium.ts';
import CommunityLoadout from '#models/CommunityLoadout.ts';
import AchievementStats from '#models/AchievementStats.ts';

export const PUBLIC_STATS_CHANNEL_ID = LOG_CHANNEL_ID;

const IS_PRODUCTION = process.env.NODE_ENV === 'production';
const UPDATE_INTERVAL_MS = 10 * 60 * 1000;
const INITIAL_DELAY_MS = 30 * 1000;
const DOWNLOADS_URL = 'https://glowhaven.site/api/launcher/downloads';
export const EMBED_TITLE = 'GLOW PUBLIC STATS';

export interface DiscordCounts {
  guilds: number;
  members: number;
  userInstalls: number | null;
}

export interface PublicStats extends DiscordCounts {
  epicAccounts: number;
  discordUsers: number;
  premiumActive: number;
  loadouts: number;
  commandsExecuted: number;
  downloads: { windows: number; android: number } | null;
  dbSizeBytes: number | null;
  cpuModel: string;
  cpuCores: number;
  cpuPercent: number;
  ramUsedBytes: number;
  ramTotalBytes: number;
  processRssBytes: number;
  uptimeSeconds: number;
  wsPing: number | null;
}

let lastDownloads: PublicStats['downloads'] = null;
let statsMessageId: string | null = null;

// ── Formatting ────────────────────────────────────────────────────────────────

function formatBytes(bytes: number): string {
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  return `${(bytes / 1024 / 1024 / 1024).toFixed(2)} GB`;
}

function formatUptime(seconds: number): string {
  const d = Math.floor(seconds / 86400);
  const h = Math.floor((seconds % 86400) / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  return [d ? `${d}d` : '', h ? `${h}h` : '', `${m}m`].filter(Boolean).join(' ');
}

const n = (value: number): string => value.toLocaleString('en-US');

// ── Collectors ────────────────────────────────────────────────────────────────

function cpuTimes(): { idle: number; total: number } {
  return os.cpus().reduce(
    (acc, cpu) => {
      const t = cpu.times;
      acc.idle += t.idle;
      acc.total += t.user + t.nice + t.sys + t.idle + t.irq;
      return acc;
    },
    { idle: 0, total: 0 },
  );
}

/** System-wide CPU usage over a short sampling window. */
async function sampleCpuPercent(windowMs = 500): Promise<number> {
  const a = cpuTimes();
  await new Promise(res => setTimeout(res, windowMs));
  const b = cpuTimes();
  const total = b.total - a.total;
  if (total <= 0) return 0;
  return Math.max(0, Math.min(100, (1 - (b.idle - a.idle) / total) * 100));
}

async function fetchDownloads(): Promise<PublicStats['downloads']> {
  try {
    const res = await fetch(DOWNLOADS_URL, { signal: AbortSignal.timeout(8000) });
    if (!res.ok) return lastDownloads;
    const data = (await res.json()) as { windows?: number; android?: number };
    lastDownloads = { windows: data.windows ?? 0, android: data.android ?? 0 };
  } catch (err) {
    log.bot.warn({ err }, '[PUBLIC-STATS] Could not fetch launcher downloads');
  }
  return lastDownloads;
}

async function fetchDbSize(): Promise<number | null> {
  try {
    const stats = await (mongoose.connection.db as any).command({ dbStats: 1 });
    return stats.dataSize as number;
  } catch {
    return null;
  }
}

/** Linked Epic accounts (all deviceAuths) and the Discord users that own them. */
async function countLinkedAccounts(): Promise<{ epicAccounts: number; discordUsers: number }> {
  const [row] = await UsuarioInfo.aggregate<{ epicAccounts: number; discordUsers: number }>([
    { $match: { deviceAuths: { $exists: true, $not: { $size: 0 } } } },
    { $group: { _id: null, epicAccounts: { $sum: { $size: '$deviceAuths' } }, discordUsers: { $sum: 1 } } },
  ]);
  return { epicAccounts: row?.epicAccounts ?? 0, discordUsers: row?.discordUsers ?? 0 };
}

async function sumCommands(): Promise<number> {
  const [row] = await AchievementStats.aggregate<{ total: number }>([
    { $group: { _id: null, total: { $sum: '$totalCommands' } } },
  ]);
  return row?.total ?? 0;
}

export async function collectPublicStats(
  discord: DiscordCounts,
  wsPing: number | null,
): Promise<PublicStats> {
  const [linked, premiumActive, loadouts, commandsExecuted, downloads, dbSizeBytes, cpuPercent] =
    await Promise.all([
      countLinkedAccounts(),
      GlowPremium.countDocuments({ isActive: true }),
      CommunityLoadout.countDocuments(),
      sumCommands(),
      fetchDownloads(),
      fetchDbSize(),
      sampleCpuPercent(),
    ]);

  const cpus = os.cpus();
  return {
    ...discord,
    ...linked,
    premiumActive,
    loadouts,
    commandsExecuted,
    downloads,
    dbSizeBytes,
    cpuModel: cpus[0]?.model?.trim().replace(/\s+/g, ' ') ?? 'Unknown',
    cpuCores: cpus.length,
    cpuPercent,
    ramUsedBytes: os.totalmem() - os.freemem(),
    ramTotalBytes: os.totalmem(),
    processRssBytes: process.memoryUsage().rss,
    uptimeSeconds: Math.floor(process.uptime()),
    wsPing,
  };
}

// ── Embed ─────────────────────────────────────────────────────────────────────

function section(title: string, lines: string[]): string {
  return [`### __${title}__`, ...lines.map(line => `> ${line}`)].join('\n');
}

export function buildPublicStatsEmbed(s: PublicStats, thumbnailUrl?: string | null): EmbedBuilder {
  const reach = s.members + (s.userInstalls ?? 0);
  const dl = s.downloads;

  const description = [
    `# __${EMBED_TITLE}__`,
    section('Community', [
      `**Linked Epic accounts:** \`${n(s.epicAccounts)}\` (\`${n(s.discordUsers)}\` Discord users)`,
      `**Servers:** \`${n(s.guilds)}\``,
      `**User installs:** \`${s.userInstalls === null ? 'N/A' : n(s.userInstalls)}\``,
      `**Total reach:** \`~${n(reach)}\``,
    ]),
    section(
      'Launcher downloads',
      dl
        ? [
            `**Windows:** \`${n(dl.windows)}\``,
            `**Android:** \`${n(dl.android)}\``,
            `**Total:** \`${n(dl.windows + dl.android)}\``,
          ]
        : ['`N/A`'],
    ),
    section('Activity', [
      `**Commands executed:** \`${n(s.commandsExecuted)}\``,
      `**Active Premium:** \`${n(s.premiumActive)}\``,
      `**Community loadouts:** \`${n(s.loadouts)}\``,
    ]),
    section('System', [
      `**CPU:** \`${s.cpuModel}\` · ${s.cpuCores} cores · \`${s.cpuPercent.toFixed(1)}%\``,
      `**RAM:** \`${formatBytes(s.ramUsedBytes)}\` / \`${formatBytes(s.ramTotalBytes)}\` (bot: \`${formatBytes(s.processRssBytes)}\`)`,
      `**Database:** \`${s.dbSizeBytes === null ? 'N/A' : formatBytes(s.dbSizeBytes)}\``,
      `**Uptime:** \`${formatUptime(s.uptimeSeconds)}\`${s.wsPing !== null ? ` · **Ping:** \`${s.wsPing}ms\`` : ''}`,
    ]),
  ].join('\n\n');

  const embed = new EmbedBuilder().setColor(EMBED_COLORS.info).setDescription(description);
  if (thumbnailUrl) embed.setThumbnail(thumbnailUrl);
  return embed;
}

// ── Message sync ──────────────────────────────────────────────────────────────

const RESTICK_DEBOUNCE_MS = 5000;
const STATS_REUSE_MS = 5 * 60 * 1000;

let lastStats: { at: number; value: PublicStats } | null = null;
let syncChain: Promise<void> = Promise.resolve();
let restickTimer: NodeJS.Timeout | null = null;

function isStatsMessage(message: Message, botId: string | undefined): boolean {
  return message.author.id === botId && message.embeds.some(e => e.description?.includes(EMBED_TITLE));
}

export async function discordCountsFromClient(client: ExtendedClient): Promise<DiscordCounts> {
  let userInstalls: number | null = null;
  try {
    const app = await client.application?.fetch();
    userInstalls = app?.approximateUserInstallCount ?? null;
  } catch (err) {
    log.bot.warn({ err }, '[PUBLIC-STATS] Could not fetch user install count');
  }
  return {
    guilds: client.guilds.cache.size,
    members: client.guilds.cache.reduce((total, g) => total + g.memberCount, 0),
    userInstalls,
  };
}

function serverIconUrl(client: ExtendedClient): string | null {
  return client.guilds.cache.get(SERVER_CONFIG.GUILD_ID)?.iconURL({ size: 256 }) ?? null;
}

/**
 * Keeps the stats embed as the LAST message of the channel (Discord has no "sticky bottom"):
 * if it is already the last message it is edited in place, otherwise it is deleted and re-posted.
 */
async function syncStatsMessage(client: ExtendedClient, reuseCached: boolean): Promise<void> {
  const channel = await client.channels.fetch(PUBLIC_STATS_CHANNEL_ID);
  if (!channel?.isTextBased() || !('send' in channel)) {
    log.bot.warn('[PUBLIC-STATS] Channel not found or not text-based');
    return;
  }

  let stats = lastStats && reuseCached && Date.now() - lastStats.at < STATS_REUSE_MS ? lastStats.value : null;
  if (!stats) {
    stats = await collectPublicStats(await discordCountsFromClient(client), client.ws.ping);
    lastStats = { at: Date.now(), value: stats };
  }
  const embed = buildPublicStatsEmbed(stats, serverIconUrl(client));

  if (!statsMessageId) {
    const recent = await channel.messages.fetch({ limit: 25 });
    statsMessageId = recent.find(m => isStatsMessage(m, client.user?.id))?.id ?? null;
  }

  if (statsMessageId && channel.lastMessageId === statsMessageId) {
    try {
      await channel.messages.edit(statsMessageId, { embeds: [embed] });
      return;
    } catch {
      statsMessageId = null;
    }
  }

  if (statsMessageId) {
    await channel.messages.delete(statsMessageId).catch(() => undefined);
  }
  const sent = await channel.send({ embeds: [embed] });
  statsMessageId = sent.id;
}

function queueSync(client: ExtendedClient, reuseCached: boolean): void {
  syncChain = syncChain
    .then(() => syncStatsMessage(client, reuseCached))
    .catch(err => log.bot.error({ err }, '[PUBLIC-STATS] Update failed'));
}

/** Called after every log message: moves the stats embed back to the bottom once logs calm down. */
function scheduleRestick(client: ExtendedClient): void {
  if (restickTimer) clearTimeout(restickTimer);
  restickTimer = setTimeout(() => queueSync(client, true), RESTICK_DEBOUNCE_MS);
}

const event: BotEvent<'clientReady'> = {
  name: Events.ClientReady,
  once: true,

  async execute(client: ExtendedClient) {
    if (!IS_PRODUCTION) {
      log.bot.info('[PUBLIC-STATS] Skipped (NODE_ENV is not production)');
      return;
    }
    initBotLogs(client, {
      thumbnailUrl: serverIconUrl(client),
      afterSend: () => scheduleRestick(client),
    });
    setTimeout(() => queueSync(client, false), INITIAL_DELAY_MS);
    setInterval(() => queueSync(client, false), UPDATE_INTERVAL_MS);
  },
};

export default event;
