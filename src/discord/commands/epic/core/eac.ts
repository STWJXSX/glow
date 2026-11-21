/**
 * COMANDO /EAC
 * Estado actual de Easy Anti-Cheat guardado por el monitor (build, binarios, historial)
 */

import { SlashCommandBuilder, ChatInputCommandInteraction } from 'discord.js';
import { callCore } from '#api/glowCore.ts';
import { buildDiscordLocalizations, getUserLanguage } from '#helpers/locales/index.ts';
import { buildEacStatusMessage, type EacStatus } from '#helpers/commands/epic/eacStatusMessage.ts';
import type { Command } from '#structures/types.ts';

const command: Command = {
  data: new SlashCommandBuilder()
    .setName('eac')
    .setDescription('Current Easy Anti-Cheat version and recent changes')
    .setNameLocalizations(buildDiscordLocalizations('eacFeed.cmd.name'))
    .setDescriptionLocalizations(buildDiscordLocalizations('eacFeed.cmd.description'))
    .setDMPermission(true) as SlashCommandBuilder,

  auth: false,
  nodefer: false,
  cooldown: 10,

  async execute(interaction: ChatInputCommandInteraction) {
    const lang = await getUserLanguage(interaction.user.id, interaction.locale);
    const status = await callCore<EacStatus>('eac.status');
    await interaction.editReply({ content: null, ...buildEacStatusMessage(status, lang) });
  },
};

export default command;
