/**
 * COMANDO /gamepanel
 * STW game panel: equip hero loadouts by commander and manage party kick actions.
 */

import { SlashCommandBuilder, ChatInputCommandInteraction } from 'discord.js';
import { buildDiscordLocalizations } from '#helpers/locales/index.ts';
import type { Command } from '#structures/types.ts';
import { handleGamePanel } from '#helpers/commands/stw/gamepanel.ts';

const command: Command = {
  data: new SlashCommandBuilder()
    .setName('gamepanel')
    .setDescription('Open the STW game panel to switch loadouts and manage party actions')
    .setNameLocalizations(buildDiscordLocalizations('gamepanel.cmd.name'))
    .setDescriptionLocalizations(buildDiscordLocalizations('gamepanel.cmd._1')) as unknown as SlashCommandBuilder,

  auth: true,
  nodefer: false,
  cooldown: 5,

  async execute(interaction: ChatInputCommandInteraction): Promise<void> {
    await handleGamePanel(interaction);
  },
};

export default command;
