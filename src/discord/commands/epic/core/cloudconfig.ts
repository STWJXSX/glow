import {
  SlashCommandBuilder,
  ChatInputCommandInteraction,
  AutocompleteInteraction,
} from 'discord.js';
import type { Command } from '#structures/types.ts';
import { buildDiscordLocalizations } from '#helpers/locales/index.ts';
import { respondLinkedAccountAutocomplete } from '#helpers/commands/epic/cloudconfig/cloudconfigAccounts.ts';
import { respondPlatformAutocomplete } from '#helpers/commands/epic/cloudconfig/cloudconfigPlatforms.ts';
import { handleCloudconfigTransferPlatform } from '#helpers/commands/epic/cloudconfig/transferPlatform.ts';
import { handleCloudconfigTransferAccount } from '#helpers/commands/epic/cloudconfig/transferAccount.ts';
import { handleCloudconfigBackup } from '#helpers/commands/epic/cloudconfig/backupPanel.ts';

const command: Command = {
  data: new SlashCommandBuilder()
    .setName('cloudconfig')
    .setDescription('Copy or back up Fortnite client settings in Epic cloud storage')
    .setNameLocalizations(buildDiscordLocalizations('cloudconfig.cmd.name'))
    .setDescriptionLocalizations(buildDiscordLocalizations('cloudconfig.cmd.description'))
    .addSubcommand((sub) =>
      sub
        .setName('transfer-platform')
        .setDescription('Copy settings from one platform to another on the same account')
        .setNameLocalizations(buildDiscordLocalizations('cloudconfig.sub.transferPlatform.name'))
        .setDescriptionLocalizations(buildDiscordLocalizations('cloudconfig.sub.transferPlatform.description'))
        .addStringOption((opt) =>
          opt
            .setName('from')
            .setDescription('Source platform')
            .setNameLocalizations(buildDiscordLocalizations('cloudconfig.options.from.name'))
            .setDescriptionLocalizations(buildDiscordLocalizations('cloudconfig.options.from.description'))
            .setRequired(true)
            .setAutocomplete(true),
        )
        .addStringOption((opt) =>
          opt
            .setName('to')
            .setDescription('Destination platform')
            .setNameLocalizations(buildDiscordLocalizations('cloudconfig.options.to.name'))
            .setDescriptionLocalizations(buildDiscordLocalizations('cloudconfig.options.to.description'))
            .setRequired(true)
            .setAutocomplete(true),
        )
        .addStringOption((opt) =>
          opt
            .setName('account')
            .setDescription('Linked account (defaults to main)')
            .setNameLocalizations(buildDiscordLocalizations('cloudconfig.options.account.name'))
            .setDescriptionLocalizations(buildDiscordLocalizations('cloudconfig.options.account.description'))
            .setRequired(false)
            .setAutocomplete(true),
        ),
    )
    .addSubcommand((sub) =>
      sub
        .setName('transfer-account')
        .setDescription('Copy all platform settings from one linked account to another')
        .setNameLocalizations(buildDiscordLocalizations('cloudconfig.sub.transferAccount.name'))
        .setDescriptionLocalizations(buildDiscordLocalizations('cloudconfig.sub.transferAccount.description'))
        .addStringOption((opt) =>
          opt
            .setName('source')
            .setDescription('Account to copy from')
            .setNameLocalizations(buildDiscordLocalizations('cloudconfig.options.source.name'))
            .setDescriptionLocalizations(buildDiscordLocalizations('cloudconfig.options.source.description'))
            .setRequired(true)
            .setAutocomplete(true),
        )
        .addStringOption((opt) =>
          opt
            .setName('target')
            .setDescription('Account to copy to')
            .setNameLocalizations(buildDiscordLocalizations('cloudconfig.options.target.name'))
            .setDescriptionLocalizations(buildDiscordLocalizations('cloudconfig.options.target.description'))
            .setRequired(true)
            .setAutocomplete(true),
        ),
    )
    .addSubcommand((sub) =>
      sub
        .setName('backup')
        .setDescription('Save cloud settings to a Glow backup')
        .setNameLocalizations(buildDiscordLocalizations('cloudconfig.sub.backup.name'))
        .setDescriptionLocalizations(buildDiscordLocalizations('cloudconfig.sub.backup.description'))
        .addStringOption((opt) =>
          opt
            .setName('account')
            .setDescription('Linked account (defaults to main)')
            .setNameLocalizations(buildDiscordLocalizations('cloudconfig.options.account.name'))
            .setDescriptionLocalizations(buildDiscordLocalizations('cloudconfig.options.account.description'))
            .setRequired(false)
            .setAutocomplete(true),
        ),
    ) as SlashCommandBuilder,

  auth: true,
  cooldown: 15,
  nodefer: false,

  async autocomplete(interaction: AutocompleteInteraction): Promise<void> {
    const sub = interaction.options.getSubcommand(false);
    const focused = interaction.options.getFocused(true);

    if (focused.name === 'account' || focused.name === 'source' || focused.name === 'target') {
      await respondLinkedAccountAutocomplete(interaction, focused.value);
      return;
    }

    if (focused.name === 'from' || focused.name === 'to') {
      await respondPlatformAutocomplete(interaction, focused.value, false);
    }
  },

  async execute(interaction: ChatInputCommandInteraction): Promise<void> {
    const sub = interaction.options.getSubcommand();
    if (sub === 'transfer-platform') {
      await handleCloudconfigTransferPlatform(interaction);
      return;
    }
    if (sub === 'transfer-account') {
      await handleCloudconfigTransferAccount(interaction);
      return;
    }
    if (sub === 'backup') {
      await handleCloudconfigBackup(interaction);
    }
  },
};

export default command;
