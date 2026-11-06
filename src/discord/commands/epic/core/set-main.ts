import { SlashCommandBuilder, ChatInputCommandInteraction, AutocompleteInteraction } from 'discord.js';
import type { Command } from '#structures/types.ts';
import { buildDiscordLocalizations } from '#helpers/locales/index.ts';
import {
  handleSetMainAutocomplete,
  handleSetMainDirectCommand,
} from '#helpers/commands/epic/auth/setMainHandler.ts';

const command: Command = {
  data: new SlashCommandBuilder()
    .setName('set-main')
    .setDescription('Choose your active Epic Games account')
    .setNameLocalizations(buildDiscordLocalizations('setMain.slash.setMainName'))
    .setDescriptionLocalizations(buildDiscordLocalizations('setMain.slash.setMainDescription'))
    .addStringOption((option) =>
      option
        .setName('account')
        .setDescription('Account to set as your main account')
        .setNameLocalizations(buildDiscordLocalizations('setMain.option.account.name'))
        .setDescriptionLocalizations(buildDiscordLocalizations('setMain.option.account.description'))
        .setRequired(true)
        .setAutocomplete(true),
    ) as SlashCommandBuilder,

  cooldown: 5,
  deferEphemeral: true,
  nodefer: false,
  onlyslash: true,

  async autocomplete(interaction: AutocompleteInteraction): Promise<void> {
    await handleSetMainAutocomplete(interaction);
  },

  async execute(interaction: ChatInputCommandInteraction): Promise<void> {
    await handleSetMainDirectCommand(interaction);
  },
};

export default command;
