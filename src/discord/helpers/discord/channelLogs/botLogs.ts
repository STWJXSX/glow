/**
 * BOT LOGS
 *
 * Moderation events (bans / unbans of the official server) posted to the moderation logs channel.
 * The public stats embed lives in its own channel (see events/guild/stats/publicStats.ts).
 */

import { EmbedBuilder, type Client } from 'discord.js';
import { log } from '#helpers/core/logger.ts';
import { EMBED_COLORS } from '#helpers/core/embedHelper.ts';

export const MODERATION_LOG_CHANNEL_ID = '1459565316303753307';

const IS_PRODUCTION = process.env.NODE_ENV === 'production';

let logClient: Client | null = null;
let thumbnailUrl: string | null = null;
let sendQueue: Promise<void> = Promise.resolve();

export function initBotLogs(client: Client, options: { thumbnailUrl?: string | null }): void {
  logClient = client;
  thumbnailUrl = options.thumbnailUrl ?? null;
}

function isBotLogsActive(): boolean {
  return IS_PRODUCTION && logClient !== null;
}

/** Sends one embed to the moderation logs channel (serialized). */
export function sendLogEmbed(embed: EmbedBuilder): Promise<void> {
  if (!isBotLogsActive()) return Promise.resolve();
  const client = logClient!;

  sendQueue = sendQueue
    .then(async () => {
      try {
        const channel = await client.channels.fetch(MODERATION_LOG_CHANNEL_ID);
        if (!channel?.isTextBased() || !('send' in channel)) return;
        await channel.send({ embeds: [embed] });
      } catch (err) {
        log.bot.error({ err }, '[BOT-LOGS] Failed to send moderation log');
      }
    })
    .catch(() => undefined);
  return sendQueue;
}

/** Moderation-style log: `# __Title__` plus `> ` lines. */
export function buildModerationEmbed(
  title: string,
  lines: string[],
  style: 'info' | 'success' | 'warning' | 'error' = 'info',
): EmbedBuilder {
  const embed = new EmbedBuilder()
    .setColor(EMBED_COLORS[style])
    .setDescription([`# __${title}__`, ...lines.map(line => `> ${line}`)].join('\n'));
  if (thumbnailUrl) embed.setThumbnail(thumbnailUrl);
  return embed;
}
