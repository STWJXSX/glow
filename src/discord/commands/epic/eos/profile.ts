/**
 * COMANDO /PROFILE
 * Consulta tu perfil de Fortnite (STW, BR, XP)
 */

import { SlashCommandBuilder, AutocompleteInteraction, ChatInputCommandInteraction } from 'discord.js';
import type { Command } from '#structures/types.ts';
import { buildDiscordLocalizations } from '#helpers/locales/index.ts';
import { handleSTW } from '#helpers/commands/epic/profile/stw.ts';
import { handleBR } from '#helpers/commands/epic/profile/br.ts';
import { handleXP } from '#helpers/commands/epic/profile/xp.ts';
import { searchPlayersAutocomplete } from '#helpers/epic/social/searchPlayers.ts';
import { log } from '#helpers/core/logger.ts';

const command: Command = {
  data: new SlashCommandBuilder()
    .setName('profile')
    .setDescription('Check your Fortnite profile')
    .setNameLocalizations(buildDiscordLocalizations('profile.cmd.name'))
    .setDescriptionLocalizations(buildDiscordLocalizations('profile.cmd._1'))
    .setDMPermission(true)
    .addSubcommand(sub =>
      sub
        .setName('stw')
        .setDescription('Check your STW profile (optional: another player)')
        .setNameLocalizations(buildDiscordLocalizations('profile.cmd.stw.name'))
        .setDescriptionLocalizations(buildDiscordLocalizations('profile.cmd.stw._1'))
        .addStringOption(option =>
          option
            .setName('player')
            .setDescription('Another player (optional — leave empty for your main account)')
            .setNameLocalizations(buildDiscordLocalizations('profile.cmd.stw.options.player.name'))
            .setDescriptionLocalizations(buildDiscordLocalizations('profile.cmd.stw.options.player._1'))
            .setRequired(false)
            .setAutocomplete(true)
        )
    )
    .addSubcommand(sub =>
      sub
        .setName('br')
        .setDescription('Show your general Battle Royale statistics')
        .setNameLocalizations(buildDiscordLocalizations('profile.cmd.br.name'))
        .setDescriptionLocalizations(buildDiscordLocalizations('profile.cmd.br._1'))
    )
    .addSubcommand(sub =>
      sub
        .setName('xp')
        .setDescription('Show your XP progress and pass levels in Fortnite')
        .setNameLocalizations(buildDiscordLocalizations('profile.cmd.xp.name'))
        .setDescriptionLocalizations(buildDiscordLocalizations('profile.cmd.xp._1'))
    ),

  auth: true,

  async autocomplete(interaction: AutocompleteInteraction): Promise<void> {
    try {
      const subcommand = interaction.options.getSubcommand();
      if (subcommand === 'stw') {
        await searchPlayersAutocomplete(interaction, 'player', 25);
      }
    } catch (error) {
      log.bot.error({ error }, '[profile] Error en autocomplete');
      await interaction.respond([]);
    }
  },

  async execute(interaction: ChatInputCommandInteraction): Promise<void> {
    const sub = interaction.options.getSubcommand();

    if (sub === 'stw') {
      return handleSTW(interaction);
    }

    if (sub === 'br') {
      return handleBR(interaction);
    }

    if (sub === 'xp') {
      return handleXP(interaction);
    }
  },
};

export default command;
