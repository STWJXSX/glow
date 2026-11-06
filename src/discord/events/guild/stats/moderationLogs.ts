/**
 * MODERATION LOGS
 *
 * Bans / unbans of the official server, posted to the public logs channel.
 */

import { AuditLogEvent, Events, type Guild, type User } from 'discord.js';
import type { BotEvent, ExtendedClient } from '#structures/types.ts';
import { log } from '#helpers/core/logger.ts';
import { buildModerationEmbed, sendLogEmbed } from '#helpers/discord/channelLogs/botLogs.ts';
import { SERVER_CONFIG } from '../config/serverConfig.ts';

async function findModerator(guild: Guild, target: User, type: AuditLogEvent): Promise<string> {
  try {
    const logs = await guild.fetchAuditLogs({ type, limit: 5 });
    const entry = logs.entries.find(e => e.targetId === target.id && Date.now() - e.createdTimestamp < 15_000);
    return entry?.executor ? `<@${entry.executor.id}>` : 'Unknown';
  } catch {
    return 'Unknown';
  }
}

function userLines(user: User): string[] {
  return [`**User:** <@${user.id}> (\`${user.username}\`)`, `**ID:** \`${user.id}\``];
}

const banAdd: BotEvent<'guildBanAdd'> = {
  name: Events.GuildBanAdd,
  once: false,

  async execute(_client: ExtendedClient, ban) {
    if (ban.guild.id !== SERVER_CONFIG.GUILD_ID) return;
    try {
      const full = ban.partial ? await ban.fetch() : ban;
      const moderator = await findModerator(ban.guild, full.user, AuditLogEvent.MemberBanAdd);
      await sendLogEmbed(
        buildModerationEmbed(
          'Member Banned',
          [...userLines(full.user), `**Moderator:** ${moderator}`, `**Reason:** ${full.reason ?? 'No reason provided'}`],
          'error',
        ),
      );
    } catch (err) {
      log.bot.error({ err }, '[BOT-LOGS] Failed to log ban');
    }
  },
};

export default banAdd;
