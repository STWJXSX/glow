import { SlashCommandBuilder, ChatInputCommandInteraction } from 'discord.js';
import type { Command } from '#structures/types.ts';
import { buildDiscordLocalizations } from '#helpers/locales/index.ts';
import { handleSetMainCommand } from '#helpers/commands/epic/auth/setMainHandler.ts';

const command: Command = {
  data: new SlashCommandBuilder()
    .setName('switch')
    .setDescription('Switch your active Epic Games account')
    .setNameLocalizations(buildDiscordLocalizations('setMain.slash.switchName'))
    .setDescriptionLocalizations(buildDiscordLocalizations('setMain.slash.switchDescription')) as SlashCommandBuilder,

  cooldown: 5,
  deferEphemeral: true,
  nodefer: false,
  onlyslash: true,

  async execute(interaction: ChatInputCommandInteraction): Promise<void> {
    await handleSetMainCommand(interaction);
  },
};

export default command;
