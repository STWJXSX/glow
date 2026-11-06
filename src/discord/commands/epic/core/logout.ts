import { SlashCommandBuilder, ChatInputCommandInteraction } from 'discord.js';
import type { Command } from '#structures/types.ts';
import { buildDiscordLocalizations } from '#helpers/locales/index.ts';
import { handleLogoutCommand } from '#helpers/commands/epic/auth/logoutHandler.ts';

const command: Command = {
  data: new SlashCommandBuilder()
    .setName('logout')
    .setDescription('Remove linked Epic Games accounts from Glow')
    .setNameLocalizations(buildDiscordLocalizations('logout.slash.name'))
    .setDescriptionLocalizations(buildDiscordLocalizations('logout.slash.description')) as SlashCommandBuilder,

  cooldown: 5,
  auth: true,
  deferEphemeral: true,
  nodefer: false,
  onlyslash: true,

  async execute(interaction: ChatInputCommandInteraction): Promise<void> {
    await handleLogoutCommand(interaction);
  },
};

export default command;
