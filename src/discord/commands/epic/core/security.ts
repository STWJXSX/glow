import { SlashCommandBuilder, ChatInputCommandInteraction } from 'discord.js';
import type { Command } from '#structures/types.ts';
import { buildDiscordLocalizations } from '#helpers/locales/index.ts';
import {
  ensureAutoSecurityUser,
  handleSecurityPanel,
} from '#helpers/commands/epic/autosecurity/configure.ts';

const command: Command = {
  data: new SlashCommandBuilder()
    .setName('security')
    .setDescription('Account Guardian — monitoring, alerts, and settings')
    .setNameLocalizations(buildDiscordLocalizations('autosecurity.cmd.name'))
    .setDescriptionLocalizations(buildDiscordLocalizations('autosecurity.cmd._1')) as SlashCommandBuilder,

  auth: true,
  cooldown: 10,
  automationSystem: 'autosecurity',

  async execute(interaction: ChatInputCommandInteraction): Promise<void> {
    const discordId = interaction.user.id;
    const main = await ensureAutoSecurityUser(interaction, discordId);
    if (!main) return;
    await handleSecurityPanel(interaction, main, discordId);
  },
};

export default command;
