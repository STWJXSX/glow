import { SlashCommandBuilder, ChatInputCommandInteraction } from 'discord.js';
import axios from 'axios';
import type { Command } from '#structures/types.ts';
import { buildDiscordLocalizations, translateForUser } from '#helpers/locales/index.ts';
import { log } from '#helpers/core/logger.ts';
import { createInfoEmbed } from '#helpers/core/embedHelper.ts';

const MAP_API_URL = 'https://fortnite-api.com/v1/map';

interface MapPoi {
  id: string;
  name: string;
}

interface MapApiPayload {
  images: {
    blank: string;
    pois: string;
  };
  pois: MapPoi[];
}

async function fetchMapFromApi(): Promise<MapApiPayload | null> {
  try {
    const { data } = await axios.get<{ status: number; data: MapApiPayload }>(MAP_API_URL, {
      timeout: 15_000,
    });

    if (data?.status !== 200 || !data.data?.pois?.length) {
      return null;
    }

    return data.data;
  } catch (error) {
    log.epic.error({ error }, '[map] Error fetching map from fortnite-api.com');
    return null;
  }
}

function sortPois(pois: MapPoi[]): MapPoi[] {
  return [...pois].sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }));
}

function buildLocationLines(pois: MapPoi[]): string[] {
  return sortPois(pois).map((poi) => `• **${poi.name}**`);
}

async function handleTextMap(interaction: ChatInputCommandInteraction) {
  const userId = interaction.user.id;
  const locale = interaction.locale;

  try {
    const mapData = await fetchMapFromApi();

    if (!mapData) {
      await interaction.editReply({
        content: await translateForUser(userId, 'map.text.noData', undefined, locale),
        embeds: [],
      });
      return;
    }

    const lines = buildLocationLines(mapData.pois);

    if (lines.length === 0) {
      await interaction.editReply({
        content: await translateForUser(userId, 'map.text.noLocations', undefined, locale),
        embeds: [],
      });
      return;
    }

    let description = lines.join('\n');
    if (description.length > 4096) {
      description = `${description.slice(0, 4090)}…`;
    }

    const embed = await createInfoEmbed({
      title: await translateForUser(userId, 'map.text.embed.title', undefined, locale),
      description,
      footer: {
        text: await translateForUser(userId, 'map.text.embed.footer', { count: lines.length }, locale),
      },
      timestamp: true,
      interaction,
    });

    await interaction.editReply({ content: null, embeds: [embed] });
  } catch (error) {
    log.epic.error({ error }, '[map] Error building text map');
    await interaction.editReply({
      content: await translateForUser(userId, 'map.text.error', undefined, locale),
      embeds: [],
    });
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
    .setDescription('Check all locations on the current map')
    .setNameLocalizations(buildDiscordLocalizations('map.cmd.name'))
    .setDescriptionLocalizations(buildDiscordLocalizations('map.cmd._1'))
    .addSubcommand((sub) =>
      sub
        .setName('text')
        .setDescription('Map locations in text format')
        .setNameLocalizations(buildDiscordLocalizations('map.cmd.text.name'))
        .setDescriptionLocalizations(buildDiscordLocalizations('map.cmd.text._1')),
    )
    .addSubcommand((sub) =>
      sub
        .setName('image')
        .setDescription('Map in image format')
        .setNameLocalizations(buildDiscordLocalizations('map.cmd.image.name'))
        .setDescriptionLocalizations(buildDiscordLocalizations('map.cmd.image._1')),
    )
    .setDMPermission(true),

  async execute(interaction: ChatInputCommandInteraction) {
    const subcommand = interaction.options.getSubcommand();

    if (subcommand === 'text') {
      await handleTextMap(interaction);
    } else if (subcommand === 'image') {
      await handleImageMap(interaction);
    }
  },
};

export default command;
