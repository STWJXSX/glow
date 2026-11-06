/**
 * COMANDO /FEEDS
 * Sistema de notificaciones automáticas para Fortnite
 * Permite activar/desactivar feeds en canales del servidor o DMs
 */

import { SlashCommandBuilder, ChatInputCommandInteraction, PermissionFlagsBits, ChannelType, AutocompleteInteraction } from 'discord.js';
import { log } from '#helpers/core/logger.ts';
import { generarEmbedError } from '#helpers/core/generarEmbedError.ts';
import type { Command } from '#structures/types.ts';
import { buildDiscordLocalizations, buildLocalizedChoices, translateForUser } from '#helpers/locales/index.ts';

// Handlers de servidor
import { handleServerActivate } from '#helpers/commands/discord/feeds/serverActivate.ts';
import { handleServerDeactivate, handleServerDeactivateAutocomplete } from '#helpers/commands/discord/feeds/serverDeactivate.ts';
import { handleServerInfo } from '#helpers/commands/discord/feeds/serverInfo.ts';

// Handlers de DM
import { handleDMActivate } from '#helpers/commands/discord/feeds/dmActivate.ts';
import { handleDMDeactivate, handleDMDeactivateAutocomplete } from '#helpers/commands/discord/feeds/dmDeactivate.ts';
import { handleDMInfo } from '#helpers/commands/discord/feeds/dmInfo.ts';

// Tipos de feeds disponibles
export const FEED_TYPES = [
  'tienda',
  'pavos',
  'supervivientes',
  'esquemas',
  'heroes',
  'defensores',
  'epicgames',
  'epicstatus',
  'worldinfo',
  'worldinfo_nomods',
  'competitive',
  'fnupdate',
  'eacupdate',
  'adminpanelcodes',
] as const;

export type FeedType = typeof FEED_TYPES[number];

const FEED_CHOICES = buildLocalizedChoices(
  'feeds.cmd.choices',
  FEED_TYPES.map(value => ({ value })),
);

const command: Command = {
  data: new SlashCommandBuilder()
    .setName('feeds')
    .setDescription('Manage automatic Fortnite notifications')
    .setNameLocalizations(buildDiscordLocalizations('feeds.cmd.name'))
    .setDescriptionLocalizations(buildDiscordLocalizations('feeds.cmd._1'))
    .setDMPermission(true)
    .setDefaultMemberPermissions(null)

    .addSubcommandGroup(group =>
      group
        .setName('server')
        .setDescription('Manage server feeds')
        .setNameLocalizations(buildDiscordLocalizations('feeds.cmd.server.name'))
        .setDescriptionLocalizations(buildDiscordLocalizations('feeds.cmd.server._1'))
        .addSubcommand(sub =>
          sub
            .setName('activate')
            .setDescription('Activate a feed in a server channel')
            .setNameLocalizations(buildDiscordLocalizations('feeds.cmd.server.activate.name'))
            .setDescriptionLocalizations(buildDiscordLocalizations('feeds.cmd.server.activate._1'))
            .addStringOption(opt =>
              opt
                .setName('feed')
                .setDescription('Type of feed to activate')
                .setNameLocalizations(buildDiscordLocalizations('feeds.cmd.options.feed.name'))
                .setDescriptionLocalizations(buildDiscordLocalizations('feeds.cmd.options.feed._1'))
                .setRequired(true)
                .addChoices(...FEED_CHOICES)
            )
            .addChannelOption(opt =>
              opt
                .setName('channel')
                .setDescription('Channel where feed will be sent (current channel if not specified)')
                .setNameLocalizations(buildDiscordLocalizations('feeds.cmd.options.channel.name'))
                .setDescriptionLocalizations(buildDiscordLocalizations('feeds.cmd.options.channel._1'))
                .addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement)
                .setRequired(false)
            )
            .addRoleOption(opt =>
              opt
                .setName('role')
                .setDescription('Role to mention when feed is posted')
                .setNameLocalizations(buildDiscordLocalizations('feeds.cmd.options.role.name'))
                .setDescriptionLocalizations(buildDiscordLocalizations('feeds.cmd.options.role._1'))
                .setRequired(false)
            )
        )
        .addSubcommand(sub =>
          sub
            .setName('deactivate')
            .setDescription('Deactivate a server feed')
            .setNameLocalizations(buildDiscordLocalizations('feeds.cmd.server.deactivate.name'))
            .setDescriptionLocalizations(buildDiscordLocalizations('feeds.cmd.server.deactivate._1'))
            .addStringOption(opt =>
              opt
                .setName('feed')
                .setDescription('Feed to deactivate')
                .setNameLocalizations(buildDiscordLocalizations('feeds.cmd.options.feedDeactivate.name'))
                .setDescriptionLocalizations(buildDiscordLocalizations('feeds.cmd.options.feedDeactivate._1'))
                .setRequired(true)
                .setAutocomplete(true)
            )
        )
        .addSubcommand(sub =>
          sub
            .setName('info')
            .setDescription('Show active server feeds')
            .setNameLocalizations(buildDiscordLocalizations('feeds.cmd.server.info.name'))
            .setDescriptionLocalizations(buildDiscordLocalizations('feeds.cmd.server.info._1'))
        )
    )

    .addSubcommandGroup(group =>
      group
        .setName('dm')
        .setDescription('Manage DM feeds')
        .setNameLocalizations(buildDiscordLocalizations('feeds.cmd.dm.name'))
        .setDescriptionLocalizations(buildDiscordLocalizations('feeds.cmd.dm._1'))
        .addSubcommand(sub =>
          sub
            .setName('activate')
            .setDescription('Activate a feed in your DMs')
            .setNameLocalizations(buildDiscordLocalizations('feeds.cmd.dm.activate.name'))
            .setDescriptionLocalizations(buildDiscordLocalizations('feeds.cmd.dm.activate._1'))
            .addStringOption(opt =>
              opt
                .setName('feed')
                .setDescription('Type of feed to activate')
                .setNameLocalizations(buildDiscordLocalizations('feeds.cmd.options.feed.name'))
                .setDescriptionLocalizations(buildDiscordLocalizations('feeds.cmd.options.feed._1'))
                .setRequired(true)
                .addChoices(...FEED_CHOICES)
            )
        )
        .addSubcommand(sub =>
          sub
            .setName('deactivate')
            .setDescription('Deactivate a DM feed')
            .setNameLocalizations(buildDiscordLocalizations('feeds.cmd.dm.deactivate.name'))
            .setDescriptionLocalizations(buildDiscordLocalizations('feeds.cmd.dm.deactivate._1'))
            .addStringOption(opt =>
              opt
                .setName('feed')
                .setDescription('Feed to deactivate')
                .setNameLocalizations(buildDiscordLocalizations('feeds.cmd.options.feedDeactivate.name'))
                .setDescriptionLocalizations(buildDiscordLocalizations('feeds.cmd.options.feedDeactivate._1'))
                .setRequired(true)
                .setAutocomplete(true)
            )
        )
        .addSubcommand(sub =>
          sub
            .setName('info')
            .setDescription('Show your active DM feeds')
            .setNameLocalizations(buildDiscordLocalizations('feeds.cmd.dm.info.name'))
            .setDescriptionLocalizations(buildDiscordLocalizations('feeds.cmd.dm.info._1'))
        )
    ),

  cooldown: 3,

  async autocomplete(interaction: AutocompleteInteraction) {
    const subcommandGroup = interaction.options.getSubcommandGroup();
    const subcommand = interaction.options.getSubcommand();

    if (subcommand !== 'deactivate') {
      await interaction.respond([]);
      return;
    }

    try {
      if (subcommandGroup === 'server') {
        await handleServerDeactivateAutocomplete(interaction);
      } else if (subcommandGroup === 'dm') {
        await handleDMDeactivateAutocomplete(interaction);
      }
    } catch (error) {
      log.commands.error({ error }, 'Error en autocomplete de feeds');
      await interaction.respond([]).catch(() => {});
    }
  },

  async execute(interaction: ChatInputCommandInteraction) {
    const subcommandGroup = interaction.options.getSubcommandGroup();
    const subcommand = interaction.options.getSubcommand();
    const userId = interaction.user.id;
    const locale = interaction.locale;

    try {
      if (subcommandGroup === 'server') {
        if (!interaction.inGuild()) {
          const descripcion = await translateForUser(userId, 'feeds.cmd.errors.guildOnly', undefined, locale);
          const embed = await generarEmbedError('custom', { descripcion, client: interaction.client, interaction });
          await interaction.editReply({ embeds: [embed] });
          return;
        }

        const member = interaction.member;
        const hasPermissions = member &&
          'permissions' in member &&
          typeof member.permissions !== 'string' &&
          member.permissions.has(PermissionFlagsBits.Administrator);

        if (!hasPermissions) {
          const descripcion = await translateForUser(userId, 'feeds.cmd.errors.noAdmin', undefined, locale);
          const embed = await generarEmbedError('custom', { descripcion, client: interaction.client, interaction });
          await interaction.editReply({ embeds: [embed] });
          return;
        }

        if (subcommand === 'activate') {
          await handleServerActivate(interaction);
        } else if (subcommand === 'deactivate') {
          await handleServerDeactivate(interaction);
        } else if (subcommand === 'info') {
          await handleServerInfo(interaction);
        }
      } else if (subcommandGroup === 'dm') {
        if (subcommand === 'activate') {
          await handleDMActivate(interaction);
        } else if (subcommand === 'deactivate') {
          await handleDMDeactivate(interaction);
        } else if (subcommand === 'info') {
          await handleDMInfo(interaction);
        }
      }
    } catch (error) {
      log.commands.error({ error, subcommand, subcommandGroup }, 'Error ejecutando comando feeds');

      const descripcion = await translateForUser(userId, 'feeds.cmd.errors.generic', undefined, locale);
      const embed = await generarEmbedError('custom', { descripcion, client: interaction.client, interaction });
      await interaction.editReply({ embeds: [embed] });
    }
  },
};

export default command;
