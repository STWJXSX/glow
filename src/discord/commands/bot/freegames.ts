/**
 * COMANDO /FREEGAMES
 * Shows current and upcoming free Epic Games.
 */

import { SlashCommandBuilder, ChatInputCommandInteraction } from 'discord.js';
import type { Command } from '#structures/types.ts';
import { callCoreWithTimeout } from '#api/glowCore.ts';
import { buildDiscordLocalizations, translateForUser } from '#helpers/locales/index.ts';
import { createErrorEmbed, createInfoEmbed } from '#helpers/core/embedHelper.ts';

interface FreeGame {
  title: string;
  seller: string;
  image: string;
  originalPrice: string;
  freeUntil: string;
  url: string;
}

interface FreeGamesResult {
  current: FreeGame[];
  upcoming: FreeGame[];
}

const command: Command = {
  data: new SlashCommandBuilder()
    .setName('freegames')
    .setDescription('Shows current and upcoming free Epic Games')
    .setNameLocalizations(buildDiscordLocalizations('freegames.cmd.name'))
    .setDescriptionLocalizations(buildDiscordLocalizations('freegames.cmd._1'))
    .setDMPermission(true) as any,

  cooldown: 15,

  async execute(interaction: ChatInputCommandInteraction) {
    const userId = interaction.user.id;
    const locale = interaction.locale;

    try {
      const [freeLabel, untilLabel, upcomingTitle, emptyTitle, emptyDescription] = await Promise.all([
        translateForUser(userId, 'freegames.freeLabel', undefined, locale),
        translateForUser(userId, 'freegames.until', undefined, locale),
        translateForUser(userId, 'freegames.upcomingTitle', undefined, locale),
        translateForUser(userId, 'freegames.emptyTitle', undefined, locale),
        translateForUser(userId, 'freegames.emptyDescription', undefined, locale),
      ]);

      const games = await callCoreWithTimeout<FreeGamesResult>('freegames.list', 60_000);
      const embeds = [];

      for (const game of games.current) {
        let desc = game.originalPrice && game.originalPrice !== '0'
          ? `~~${game.originalPrice}~~ → **${freeLabel}**`
          : `**${freeLabel}**`;

        if (game.freeUntil) {
          const ts = Math.floor(new Date(game.freeUntil).getTime() / 1000);
          desc += `\n${untilLabel}: <t:${ts}:F>`;
        }

        if (game.seller) {
          desc = `**${game.seller}**\n${desc}`;
        }

        embeds.push(await createInfoEmbed({
          title: game.title,
          description: desc,
          thumbnail: game.image ?? undefined,
          interaction,
        }));
      }

      if (games.upcoming.length > 0) {
        embeds.push(await createInfoEmbed({
          title: upcomingTitle,
          description: games.upcoming.map(g => `• [${g.title}](${g.url})`).join('\n'),
          interaction,
        }));
      }

      if (embeds.length === 0) {
        embeds.push(await createInfoEmbed({
          title: emptyTitle,
          description: emptyDescription,
          interaction,
        }));
      }

      await interaction.editReply({ embeds: embeds.slice(0, 10) });
    } catch {
      const msg = await translateForUser(userId, 'freegames.errorFetch', undefined, locale);
      const embed = await createErrorEmbed({ description: msg, interaction });
      await interaction.editReply({ embeds: [embed] });
    }
  },
};

export default command;
