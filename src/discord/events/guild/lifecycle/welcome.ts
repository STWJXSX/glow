import {
  Events,
  ContainerBuilder,
  SectionBuilder,
  TextDisplayBuilder,
  ThumbnailBuilder,
  SeparatorBuilder,
  SeparatorSpacingSize,
  MediaGalleryBuilder,
  MediaGalleryItemBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  MessageFlags,
} from 'discord.js';
import type { BotEvent, ExtendedClient } from '#structures/types.ts';
import { SERVER_CONFIG } from '../config/serverConfig.ts';
import { log } from '#helpers/core/logger.ts';

// Dedup guard — stored on the client so it survives module reloads triggered by loadEvents.
// A module-level Set would be wiped every time require.cache is cleared and the file reimported.
function getWelcomedSet(client: ExtendedClient): Set<string> {
  const c = client as any;
  if (!c._recentlyWelcomed) c._recentlyWelcomed = new Set<string>();
  return c._recentlyWelcomed as Set<string>;
}

const event: BotEvent<'guildMemberAdd'> = {
  name: Events.GuildMemberAdd,

  async execute(_client: ExtendedClient, member) {
    if (member.guild.id !== SERVER_CONFIG.GUILD_ID) return;

    const welcomed = getWelcomedSet(_client);
    if (welcomed.has(member.id)) return;
    welcomed.add(member.id);
    setTimeout(() => welcomed.delete(member.id), 10_000);

    if (!member.roles.cache.has(SERVER_CONFIG.MEMBER_ROLE_ID)) {
      await member.roles.add(SERVER_CONFIG.MEMBER_ROLE_ID, 'Welcome — member role').catch((err: unknown) =>
        log.events.error({ err, userId: member.id }, '[welcome] Could not assign member role'),
      );
    }

    const channel = member.guild.channels.cache.get(SERVER_CONFIG.WELCOME_CHANNEL_ID);
    if (!channel?.isTextBased()) return;

    const guild  = member.guild;
    const user   = member.user;
    const count  = guild.memberCount;
    const date   = new Date().toLocaleDateString('en-US', {
      month: 'long',
      day:   'numeric',
      year:  'numeric',
    });

    // Mensaje de notificación fuera del container (necesario para que Discord envíe el ping)
    await (channel as any).send(
      `> 👋 Welcome ${user.toString()} to **${guild.name}**!`,
    ).catch(() => {});

    const linksRow = new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder()
        .setLabel('Rules')
        .setURL(SERVER_CONFIG.LINKS.RULES)
        .setStyle(ButtonStyle.Link),
      new ButtonBuilder()
        .setLabel('Terms of Service')
        .setURL(SERVER_CONFIG.LINKS.TOS)
        .setStyle(ButtonStyle.Link),
      new ButtonBuilder()
        .setLabel('Privacy Policy')
        .setURL(SERVER_CONFIG.LINKS.PRIVACY_POLICY)
        .setStyle(ButtonStyle.Link),
    );

    const container = new ContainerBuilder()
      .setAccentColor(SERVER_CONFIG.COLORS.WELCOME)
      .addSectionComponents(
        new SectionBuilder()
          .addTextDisplayComponents(
            new TextDisplayBuilder().setContent(
              `## Welcome to ${guild.name}\n` +
              `You are our **${toOrdinal(count)}** member.\n` +
              `-# Joined ${date}`,
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
          `-# Head to <#${SERVER_CONFIG.ROLES_CHANNEL_ID}> to pick your roles.`,
        ),
      )
      .addSeparatorComponents(
        new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small),
      )
      .addMediaGalleryComponents(
        new MediaGalleryBuilder().addItems(
          new MediaGalleryItemBuilder().setURL(SERVER_CONFIG.WELCOME_BANNER_URL),
        ),
      )
      .addSeparatorComponents(
        new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small),
      )
      .addActionRowComponents(linksRow as any);

    await (channel as any).send({
      flags:      MessageFlags.IsComponentsV2,
      components: [container],
    }).catch((err: unknown) =>
      log.events.error({ err, userId: user.id }, '[welcome] Could not send welcome message'),
    );
  },
};

function toOrdinal(n: number): string {
  const s   = ['th', 'st', 'nd', 'rd'];
  const v   = n % 100;
  const sfx = s[(v - 20) % 10] ?? s[v] ?? s[0];
  return `${n.toLocaleString()}${sfx}`;
}

export default event;
