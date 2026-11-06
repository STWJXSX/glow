import {
  SlashCommandBuilder,
  ChatInputCommandInteraction,
} from 'discord.js';
import type { Command } from '#structures/types.ts';
import { buildDiscordLocalizations } from '#helpers/locales/index.ts';
import { handleWorldInfo } from '#helpers/commands/stw/file/worldinfo.ts';

const command: Command = {
  data: new SlashCommandBuilder()
    .setName('file')
    .setDescription('Commands to generate information files')
    .setNameLocalizations(buildDiscordLocalizations('file.cmd.name'))
    .setDescriptionLocalizations(buildDiscordLocalizations('file.cmd.description'))
    .addSubcommand((subcommand) =>
      subcommand
        .setName('worldinfo')
        .setDescription('Generate a JSON file with STW world information')
        .setNameLocalizations(buildDiscordLocalizations('file.cmd.subcommands.worldinfo.name'))
        .setDescriptionLocalizations(buildDiscordLocalizations('file.cmd.subcommands.worldinfo.description'))
        .addStringOption((option) =>
          option
            .setName('name')
            .setDescription('File name without extension')
            .setNameLocalizations(buildDiscordLocalizations('file.cmd.subcommands.worldinfo.options.name.name'))
            .setDescriptionLocalizations(buildDiscordLocalizations('file.cmd.subcommands.worldinfo.options.name.description'))
            .setRequired(false),
        ),
    ) as SlashCommandBuilder,
  auth: true,

  async execute(interaction: ChatInputCommandInteraction): Promise<void> {
    const subcommand = interaction.options.getSubcommand();

    if (subcommand === 'worldinfo') {
      await handleWorldInfo(interaction);
    }
  },
};

export default command;
