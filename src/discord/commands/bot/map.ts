import { SlashCommandBuilder, ChatInputCommandInteraction } from 'discord.js';
import axios from 'axios';
import type { Command } from '#structures/types.ts';
import { buildDiscordLocalizations, translateForUser } from '#helpers/locales/index.ts';
import { log } from '#helpers/core/logger.ts';
import { createInfoEmbed } from '#helpers/core/embedHelper.ts';

const MAP_API_URL = 'https://fortnite-api.com/v1/map';

interface MapApiPayload {
  images: {
    blank: string;
    pois: string;
  };
}

async function fetchMapFromApi(): Promise<MapApiPayload | null> {
  try {
    const { data } = await axios.get<{ status: number; data: MapApiPayload }>(MAP_API_URL, {
      timeout: 15_000,
    });

    if (data?.status !== 200 || !data.data?.images) {
      return null;
    }

    return data.data;
  } catch (error) {
    log.epic.error({ error }, '[map] Error fetching map from fortnite-api.com');
    return null;
  }
}

async function handleImageMap(interaction: ChatInputCommandInteraction) {
  const userId = interaction.user.id;
  const locale = interaction.locale;

  try {
    const mapData = await fetchMapFromApi();

    if (!mapData) {
      await interaction.editReply({
        content: await translateForUser(userId, 'map.image.error', undefined, locale),
        embeds: [],
      });
      return;
    }

    const mapImageUrl = mapData.images?.pois || mapData.images?.blank;
    if (!mapImageUrl) {
      await interaction.editReply({
        content: await translateForUser(userId, 'map.image.error', undefined, locale),
        embeds: [],
      });
      return;
    }

    const embed = await createInfoEmbed({
      title: await translateForUser(userId, 'map.image.embed.title', undefined, locale),
      description: '\u200b',
      image: mapImageUrl,
      footer: {
        text: await translateForUser(userId, 'map.image.embed.footer', undefined, locale),
      },
      timestamp: true,
      interaction,
    });

    await interaction.editReply({ content: null, embeds: [embed] });
    log.epic.debug({ url: mapImageUrl }, '[map] Map image sent');
  } catch (error) {
    log.epic.error({ error }, '[map] Error sending map image');
    await interaction.editReply({
      content: await translateForUser(userId, 'map.image.error', undefined, locale),
      embeds: [],
    });
  }
}

const command: Command = {
  data: new SlashCommandBuilder()
    .setName('map')
    .setDescription('Current Fortnite map image')
    .setNameLocalizations(buildDiscordLocalizations('map.cmd.name'))
    .setDescriptionLocalizations(buildDiscordLocalizations('map.cmd.image._1'))
    .setDMPermission(true),

  async execute(interaction: ChatInputCommandInteraction) {
    await handleImageMap(interaction);
  },
};

export default command;
