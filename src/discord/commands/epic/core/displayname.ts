/**
 * /displayname change — update Epic display name for the user's main linked account.
 */

import { ChatInputCommandInteraction, SlashCommandBuilder } from 'discord.js';
import type { Command } from '#structures/types.ts';
import { buildDiscordLocalizations, translateForUser } from '#helpers/locales/index.ts';
import { log } from '#helpers/core/logger.ts';
import { createGenericErrorEmbed } from '#helpers/core/embedHelper.ts';
import { handleDisplayNameChangeSubcommand } from '#helpers/commands/epic/account/displayNameChange.ts';

const command: Command = {
  data: new SlashCommandBuilder()
    .setName('displayname')
    .setDescription('Change your Epic Games display name (main account)')
    .setNameLocalizations(buildDiscordLocalizations('displayname.cmd.name'))
    .setDescriptionLocalizations(buildDiscordLocalizations('displayname.cmd._1'))
    .setDMPermission(true)
    .addSubcommand((sub) =>
      sub
        .setName('change')
        .setDescription('Set a new display name for your main Epic account')
        .setNameLocalizations(buildDiscordLocalizations('displayname.change.name'))
        .setDescriptionLocalizations(buildDiscordLocalizations('displayname.change._1'))
        .addStringOption((opt) =>
          opt
            .setName('name')
            .setDescription('New display name (3–16 characters)')
            .setNameLocalizations(buildDiscordLocalizations('displayname.change.options.name.name'))
            .setDescriptionLocalizations(buildDiscordLocalizations('displayname.change.options.name._1'))
            .setRequired(true)
            .setMinLength(3)
            .setMaxLength(16),
        ),
    ),

  cooldown: 15,
  auth: true,

  async execute(interaction: ChatInputCommandInteraction) {
    const sub = interaction.options.getSubcommand();
    try {
      if (sub === 'change') {
        await handleDisplayNameChangeSubcommand(interaction);
        return;
      }
    } catch (error) {
      log.commands.error({ error, sub }, 'displayname command failed');
      const embed = await createGenericErrorEmbed(
        {
          message: await translateForUser(
            interaction.user.id,
            'displayname.errors.unexpected',
            undefined,
            interaction.locale,
          ),
        },
        interaction,
      );
      await interaction.editReply({ embeds: [embed] });
    }
  },
};

export default command;
