/**
 * /collectionbook — Collection Book overview panel with missing slots, materials and upgrade.
 */

import { SlashCommandBuilder, ChatInputCommandInteraction } from 'discord.js';
import type { Command } from '#structures/types.ts';
import { buildDiscordLocalizations } from '#helpers/locales/index.ts';
import { runCollectionBookPanel } from '#helpers/epic/stw/collectionbook/collectionBookPanel.ts';

const command: Command = {
  data: new SlashCommandBuilder()
    .setName('collectionbook')
    .setDescription('Collection Book overview, missing slots, materials and upgrades')
    .setNameLocalizations(buildDiscordLocalizations('collectionbook.cmd.name'))
    .setDescriptionLocalizations(buildDiscordLocalizations('collectionbook.cmd.description'))
    .setDMPermission(true) as SlashCommandBuilder,

  auth: true,
  nodefer: false,
  cooldown: 15,

  async execute(interaction: ChatInputCommandInteraction) {
    await runCollectionBookPanel(interaction);
  },
};

export default command;
