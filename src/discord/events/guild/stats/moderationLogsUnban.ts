import { AuditLogEvent, Events } from 'discord.js';
import type { BotEvent, ExtendedClient } from '#structures/types.ts';
import { log } from '#helpers/core/logger.ts';
import { buildModerationEmbed, sendLogEmbed } from '#helpers/discord/channelLogs/botLogs.ts';
import { SERVER_CONFIG } from '../config/serverConfig.ts';

const banRemove: BotEvent<'guildBanRemove'> = {
  name: Events.GuildBanRemove,
  once: false,

  async execute(_client: ExtendedClient, ban) {
    if (ban.guild.id !== SERVER_CONFIG.GUILD_ID) return;
    try {
      let moderator = 'Unknown';
      try {
        const logs = await ban.guild.fetchAuditLogs({ type: AuditLogEvent.MemberBanRemove, limit: 5 });
        const entry = logs.entries.find(e => e.targetId === ban.user.id && Date.now() - e.createdTimestamp < 15_000);
        if (entry?.executor) moderator = `<@${entry.executor.id}>`;
      } catch { /* missing audit log permission */ }

      await sendLogEmbed(
        buildModerationEmbed(
          'Member Unbanned',
          [
            `**User:** <@${ban.user.id}> (\`${ban.user.username}\`)`,
            `**ID:** \`${ban.user.id}\``,
            `**Moderator:** ${moderator}`,
          ],
          'success',
        ),
      );
    } catch (err) {
      log.bot.error({ err }, '[BOT-LOGS] Failed to log unban');
    }
  },
};

export default banRemove;
