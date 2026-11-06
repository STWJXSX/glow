/**
 * COMANDO /ACCOUNT
 * Comandos relacionados con la cuenta de Epic Games
 */

import { SlashCommandBuilder, ChatInputCommandInteraction } from 'discord.js';
import type { Command } from '#structures/types.ts';
import { buildDiscordLocalizations, translateForUser } from '#helpers/locales/index.ts';
import { handleCmdSubcommand } from '#helpers/commands/epic/account/cmd.ts';
// grantaccess disabled — see commands/_disabled/grantaccess.ts.txt
import { handlePanelSubcommand } from '#helpers/commands/epic/account/panel.ts';
import { handleInfoSubcommand } from '#helpers/commands/epic/account/info.ts';
import { handleCheckBanSubcommand } from '#helpers/commands/epic/account/checkBan.ts';
import { handleExchangeCodeSubcommand } from '#helpers/commands/epic/account/exchangecode.ts';
import { handleAccessTokenSubcommand } from '#helpers/commands/epic/account/accesstoken.ts';
import { handleDeviceSubcommand } from '#helpers/commands/epic/account/device.ts';
import { handleTokenInfoSubcommand } from '#helpers/commands/epic/account/tokeninfo.ts';
import { handleExportSubcommand } from '#helpers/commands/epic/account/export.ts';

function subName(key: string) {
  return buildDiscordLocalizations(`account.slash.subcommands.${key}.name`);
}

function subDesc(key: string) {
  return buildDiscordLocalizations(`account.slash.subcommands.${key}.description`);
}

const command: Command = {
  data: new SlashCommandBuilder()
    .setName('account')
    .setDescription('Manage your linked Epic Games account')
    .setNameLocalizations(buildDiscordLocalizations('account.slash.command.name'))
    .setDescriptionLocalizations(buildDiscordLocalizations('account.slash.command.description'))
    .setDMPermission(true)
    .addSubcommand((sub) =>
      sub
        .setName('cmd')
        .setDescription('Generate a Windows CMD command to launch Fortnite')
        .setNameLocalizations(subName('cmd'))
        .setDescriptionLocalizations(subDesc('cmd')),
    )
    /*
    .addSubcommand((sub) =>
      sub
        .setName('grantaccess')
        .setDescription('Request PLAY permission for your Fortnite account')
        .setNameLocalizations(subName('grantaccess'))
        .setDescriptionLocalizations(subDesc('grantaccess')),
    )
    */
    .addSubcommand((sub) =>
      sub
        .setName('panel')
        .setDescription('Open your Epic Games account panel')
        .setNameLocalizations(subName('panel'))
        .setDescriptionLocalizations(subDesc('panel')),
    )
    .addSubcommand((sub) =>
      sub
        .setName('info')
        .setDescription('View your main Epic account information')
        .setNameLocalizations(subName('info'))
        .setDescriptionLocalizations(subDesc('info')),
    )
    .addSubcommand((sub) =>
      sub
        .setName('checkban')
        .setDescription('Check if your account is banned from Fortnite')
        .setNameLocalizations(subName('checkban'))
        .setDescriptionLocalizations(subDesc('checkban')),
    )
    .addSubcommand((sub) =>
      sub
        .setName('exchangecode')
        .setDescription('Generate an exchange code (valid 5 minutes)')
        .setNameLocalizations(subName('exchangecode'))
        .setDescriptionLocalizations(subDesc('exchangecode')),
    )
    .addSubcommand((sub) =>
      sub
        .setName('accesstoken')
        .setDescription('Show your access token (valid 8 hours)')
        .setNameLocalizations(subName('accesstoken'))
        .setDescriptionLocalizations(subDesc('accesstoken')),
    )
    .addSubcommand((sub) =>
      sub
        .setName('device')
        .setDescription('Show your deviceAuth credentials')
        .setNameLocalizations(subName('device'))
        .setDescriptionLocalizations(subDesc('device')),
    )
    .addSubcommand((sub) =>
      sub
        .setName('tokeninfo')
        .setDescription('Inspect an access token')
        .setNameLocalizations(subName('tokeninfo'))
        .setDescriptionLocalizations(subDesc('tokeninfo'))
        .addStringOption((opt) =>
          opt
            .setName('token')
            .setDescription('Access token to inspect')
            .setNameLocalizations(
              buildDiscordLocalizations('account.slash.subcommands.tokeninfo.options.token.name'),
            )
            .setDescriptionLocalizations(
              buildDiscordLocalizations('account.slash.subcommands.tokeninfo.options.token.description'),
            )
            .setRequired(true),
        ),
    )
    .addSubcommand((sub) =>
      sub
        .setName('export')
        .setDescription('Export all linked accounts as a Glow JSON file')
        .setNameLocalizations(subName('export'))
        .setDescriptionLocalizations(subDesc('export')),
    ) as SlashCommandBuilder,

  auth: true,
  cooldown: 5,
  nodefer: true,

  async execute(interaction: ChatInputCommandInteraction) {
    const subcommand = interaction.options.getSubcommand();

    const sensitiveSubcommands = new Set([
      'cmd',
      'panel',
      'info',
      'exchangecode',
      'accesstoken',
      'device',
      'tokeninfo',
      'export',
    ]);

    if (!interaction.deferred && !interaction.replied) {
      await interaction.deferReply({
        ephemeral: sensitiveSubcommands.has(subcommand),
      });
    }

    switch (subcommand) {
      case 'cmd':
        await handleCmdSubcommand(interaction);
        break;
      // case 'grantaccess': await handleGrantAccessSubcommand(interaction); break;
      case 'panel':
        await handlePanelSubcommand(interaction);
        break;
      case 'info':
        await handleInfoSubcommand(interaction);
        break;
      case 'checkban':
        await handleCheckBanSubcommand(interaction);
        break;
      case 'exchangecode':
        await handleExchangeCodeSubcommand(interaction);
        break;
      case 'accesstoken':
        await handleAccessTokenSubcommand(interaction);
        break;
      case 'device':
        await handleDeviceSubcommand(interaction);
        break;
      case 'tokeninfo':
        await handleTokenInfoSubcommand(interaction);
        break;
      case 'export':
        await handleExportSubcommand(interaction);
        break;
      default: {
        const msg = await translateForUser(
          interaction.user.id,
          'account.unknownSubcommand',
          undefined,
          interaction.locale,
        );
        await interaction.editReply({ content: msg });
      }
    }
  },
};

export default command;
