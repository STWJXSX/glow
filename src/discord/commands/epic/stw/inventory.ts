import { SlashCommandBuilder, ChatInputCommandInteraction } from 'discord.js';
import type { Command } from '#structures/types.ts';
import { buildDiscordLocalizations } from '#helpers/locales/index.ts';
import { runStwInventoryImagePanel } from '#helpers/epic/stw/inventory/stwInventoryImagePanel.ts';

/** STW inventory as images, with a source selector (campaign, venture or storm shield storage). */
const command: Command = {
  data: new SlashCommandBuilder()
    .setName('inventory')
    .setDescription('Inventory image with filters (campaign, venture or storage)')
    .setNameLocalizations(buildDiscordLocalizations('inventory.cmd.name'))
    .setDescriptionLocalizations(buildDiscordLocalizations('inventory.cmd.subcommands.image.description')),
  auth: true,
  nodefer: false,

  async execute(interaction: ChatInputCommandInteraction): Promise<void> {
    await runStwInventoryImagePanel(interaction, 'campaign');
  },
};

export default command;
