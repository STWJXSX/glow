import {
  Events,
  ContainerBuilder,
  SectionBuilder,
  TextDisplayBuilder,
  ThumbnailBuilder,
  SeparatorBuilder,
  SeparatorSpacingSize,
  MessageFlags,
} from 'discord.js';
import type { BotEvent, ExtendedClient } from '#structures/types.ts';
import { SERVER_CONFIG } from '../config/serverConfig.ts';
import { log } from '#helpers/core/logger.ts';

const event: BotEvent<'guildMemberRemove'> = {
  name: Events.GuildMemberRemove,

  async execute(_client: ExtendedClient, member) {
    if (member.guild.id !== SERVER_CONFIG.GUILD_ID) return;

    const channel = member.guild.channels.cache.get(SERVER_CONFIG.FAREWELL_CHANNEL_ID);
    if (!channel?.isTextBased()) return;

    const guild = member.guild;
    const user  = member.user;
    const count = guild.memberCount;
    const date  = new Date().toLocaleDateString('en-US', {
      month: 'long',
      day:   'numeric',
      year:  'numeric',
    });

    const container = new ContainerBuilder()
      .setAccentColor(SERVER_CONFIG.COLORS.FAREWELL)
      .addSectionComponents(
        new SectionBuilder()
          .addTextDisplayComponents(
            new TextDisplayBuilder().setContent(
              `## Goodbye, ${user.username}\n` +
              `**${user.toString()}** has left the server.\n` +
              `-# ${date}`,
            ),
          )
          .setThumbnailAccessory(
            new ThumbnailBuilder().setURL(
              user.displayAvatarURL({ size: 256, extension: 'png' }),
            ),
          ),
      )
      .addSeparatorComponents(
        new SeparatorBuilder()
          .setDivider(true)
          .setSpacing(SeparatorSpacingSize.Small),
      )
      .addTextDisplayComponents(
        new TextDisplayBuilder().setContent(
          `-# The server now has **${count.toLocaleString()}** members.`,
        ),
      );

    await (channel as any).send({
      flags:      MessageFlags.IsComponentsV2,
      components: [container],
    }).catch((err: unknown) =>
      log.events.error({ err, userId: user.id }, '[farewell] Could not send farewell message'),
    );
  },
};

export default event;
