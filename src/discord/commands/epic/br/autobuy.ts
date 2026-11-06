import { SlashCommandBuilder, ChatInputCommandInteraction } from 'discord.js';
import { buildDiscordLocalizations } from '#helpers/locales/index.ts';
import type { Command } from '#structures/types.ts';
import { handleAutoBuyBrPanel } from '#helpers/commands/br/autobuy/brPanel.ts';
import { handleAutoBuyStwPanel } from '#helpers/commands/br/autobuy/stwPanel.ts';

const command: Command = {
  data: new SlashCommandBuilder()
    .setName('autobuy')
    .setDescription('Manage automatic BR and STW shop purchases')
    .setNameLocalizations(buildDiscordLocalizations('autobuy.cmd.name'))
    .setDescriptionLocalizations(buildDiscordLocalizations('autobuy.cmd._1'))
    .addSubcommand((sub) =>
      sub
        .setName('br')
        .setDescription('Manage your BR shop watchlist')
        .setNameLocalizations(buildDiscordLocalizations('autobuy.cmd.br.name'))
        .setDescriptionLocalizations(buildDiscordLocalizations('autobuy.cmd.br._1')),
    )
    .addSubcommand((sub) =>
      sub
        .setName('stw')
        .setDescription('Configure STW shop auto-buy items')
        .setNameLocalizations(buildDiscordLocalizations('autobuy.cmd.stw.name'))
        .setDescriptionLocalizations(buildDiscordLocalizations('autobuy.cmd.stw._1')),
    ) as SlashCommandBuilder,

  auth: true,
  premMonthly: true,
  nodefer: false,

  async execute(interaction: ChatInputCommandInteraction): Promise<void> {
    const sub = interaction.options.getSubcommand(true);

    if (sub === 'br') {
      await handleAutoBuyBrPanel(interaction);
    } else if (sub === 'stw') {
      await handleAutoBuyStwPanel(interaction);
    }
  },
};

export default command;
