/**
 * COMANDO /COSMETIC
 * Busca y muestra información detallada y estética de cualquier cosmético de Fortnite
 * usando la API pública de fortnite-api.com.
 */

import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ChatInputCommandInteraction,
  AutocompleteInteraction,
  SlashCommandBuilder,
  StringSelectMenuBuilder,
} from 'discord.js';
import axios from 'axios';
import type { Command } from '#structures/types.ts';
import { buildDiscordLocalizations } from '#helpers/locales/index.ts';
import { getFortniteApiLanguageCode } from '#helpers/locales/fortniteApi.ts';
import { log } from '#helpers/core/logger.ts';
import { createEmbed, createErrorEmbed } from '#helpers/core/embedHelper.ts';
import { getEmoji } from '#helpers/core/emojis.ts';
import { fetchBrShopCosmeticMap } from '#helpers/epic/br/shop/fortniteShopApi.ts';
import { getAllBrCosmetics } from '#helpers/commands/br/reminder/reminder.ts';
import { generarEmbedError } from '#helpers/core/generarEmbedError.ts';

interface FortniteApiCosmetic {
  id: string;
  name: string;
  description?: string;
  type?: {
    value?: string;
    displayValue?: string;
    backendValue?: string;
  };
  rarity?: {
    value?: string;
    displayValue?: string;
    backendValue?: string;
  };
  series?: {
    value?: string;
    image?: string;
    colors?: string[];
    backendValue?: string;
  };
  set?: {
    value?: string;
    text?: string;
    backendValue?: string;
  };
  introduction?: {
    chapter?: string;
    season?: string;
    text?: string;
    backendValue?: number;
  };
  images?: {
    smallIcon?: string;
    icon?: string;
    featured?: string;
    lego?: {
      small?: string;
      large?: string;
      wide?: string;
    };
    bean?: {
      small?: string;
      large?: string;
    };
    other?: Record<string, string>;
  };
  variants?: Array<{
    channel?: string;
    type?: string;
    options?: Array<{
      tag?: string;
      name?: string;
      image?: string;
    }>;
  }>;
  showcaseVideo?: string;
  added?: string;
  lastAppearance?: string | number;
  dynamicPakId?: string;
  gameplayTags?: string[];
  metaTags?: string[];
  searchTags?: string[];
  unlockRequirements?: string;
  customExclusiveCallout?: string;
  builtInEmoteIds?: string[];
}

const RARITY_COLORS: Record<string, number> = {
  common: 0xbebebe,
  uncommon: 0x5bb63b,
  rare: 0x45a1f8,
  epic: 0xab48ea,
  legendary: 0xe87834,
  mythic: 0xe3be35,
  exotic: 0x47d8c4,
  transcendent: 0xf04747,
};

const SERIES_COLORS: Record<string, number> = {
  marvelseries: 0xc53030,
  dcseries: 0x264f89,
  creatorcollabseries: 0x29b6f6,
  starwarsseries: 0x1e3b6d,
  columbusseries: 0x4b40be,
  shadowseries: 0x37474f,
  lavaseries: 0xff5722,
  frozenseries: 0x80deea,
  darkseries: 0xab47bc,
  slurpseries: 0x00e5ff,
  platformseries: 0x4b40be,
};

function resolveEmbedColor(cosmetic: FortniteApiCosmetic): number {
  if (cosmetic.series) {
    if (cosmetic.series.colors && cosmetic.series.colors.length > 0) {
      const hex = cosmetic.series.colors[0].replace('#', '').slice(0, 6);
      const parsed = parseInt(hex, 16);
      if (!isNaN(parsed)) return parsed;
    }
    const seriesKey = (cosmetic.series.backendValue || cosmetic.series.value || '')
      .toLowerCase()
      .replace(/[^a-z]/g, '');
    if (SERIES_COLORS[seriesKey]) return SERIES_COLORS[seriesKey];
  }

  const rarityKey = (cosmetic.rarity?.value || '').toLowerCase();
  if (RARITY_COLORS[rarityKey]) return RARITY_COLORS[rarityKey];

  return 0xffc87c;
}

function resolveCosmeticImages(cosmetic: FortniteApiCosmetic): {
  image?: string;
  thumbnail?: string;
} {
  const featured = cosmetic.images?.featured;
  const icon = cosmetic.images?.icon;
  const smallIcon = cosmetic.images?.smallIcon;

  const isWide =
    cosmetic.type?.value?.toLowerCase() === 'loadingscreen' ||
    cosmetic.type?.backendValue?.toLowerCase().includes('loadingscreen');

  // Wide assets (loading screens) use the footer banner only.
  if (isWide) {
    return {
      image: featured || icon || smallIcon,
      thumbnail: undefined,
    };
  }

  // Thumbnail only: featured URLs are often tall/square and blow up embed height at the bottom.
  const thumbnail = icon || smallIcon || featured;
  if (thumbnail) {
    return { thumbnail };
  }

  return {};
}

function truncateLabel(str: string, maxLen = 100): string {
  if (str.length <= maxLen) return str;
  return str.slice(0, maxLen - 1) + '…';
}

async function fetchCosmeticDetails(
  query: string,
  language: string,
): Promise<FortniteApiCosmetic | null> {
  const trimmed = query.trim();
  if (!trimmed) return null;

  // 1. Intento directo por ID
  try {
    const res = await axios.get<{ status: number; data: FortniteApiCosmetic }>(
      `https://fortnite-api.com/v2/cosmetics/br/${encodeURIComponent(trimmed)}`,
      {
        params: { language },
        timeout: 10_000,
      },
    );
    if (res.data?.status === 200 && res.data.data?.id) {
      return res.data.data;
    }
  } catch (err: any) {
    if (err.response?.status !== 404) {
      log.commands.debug({ err: err.message, query: trimmed }, '[cosmetic] direct ID fetch error');
    }
  }

  // Idiomas a probar para búsqueda por texto: el idioma del usuario y 'en' como fallback
  const searchLangs = language !== 'en' ? [language, 'en'] : ['en'];

  for (const sLang of searchLangs) {
    // 2. Búsqueda por nombre exacto
    try {
      const res = await axios.get<{ status: number; data: FortniteApiCosmetic }>(
        'https://fortnite-api.com/v2/cosmetics/br/search',
        {
          params: {
            name: trimmed,
            matchMethod: 'full',
            language,
            searchLanguage: sLang,
          },
          timeout: 10_000,
        },
      );
      if (res.data?.status === 200 && res.data.data?.id) {
        return res.data.data;
      }
    } catch {
      // Continuar
    }

    // 3. Búsqueda por nombre (contains)
    try {
      const res = await axios.get<{ status: number; data: FortniteApiCosmetic }>(
        'https://fortnite-api.com/v2/cosmetics/br/search',
        {
          params: {
            name: trimmed,
            matchMethod: 'contains',
            language,
            searchLanguage: sLang,
          },
          timeout: 10_000,
        },
      );
      if (res.data?.status === 200 && res.data.data?.id) {
        return res.data.data;
      }
    } catch {
      // Continuar
    }
  }

  // 4. Búsqueda por ID (contains)
  try {
    const res = await axios.get<{ status: number; data: FortniteApiCosmetic }>(
      'https://fortnite-api.com/v2/cosmetics/br/search',
      {
        params: {
          id: trimmed,
          matchMethod: 'contains',
          language,
        },
        timeout: 10_000,
      },
    );
    if (res.data?.status === 200 && res.data.data?.id) {
      return res.data.data;
    }
  } catch {
    // No encontrado
  }

  return null;
}

async function fetchCosmeticsBySet(
  setName: string,
  language: string,
  backendValue?: string,
): Promise<FortniteApiCosmetic[]> {
  const trimmed = setName.trim();
  if (!trimmed) return [];

  const searchLangs = language !== 'en' ? [language, 'en'] : ['en'];
  const searchTerms = [trimmed];
  if (backendValue && backendValue.trim() && backendValue.trim().toLowerCase() !== trimmed.toLowerCase()) {
    searchTerms.push(backendValue.trim());
  }

  for (const term of searchTerms) {
    for (const sLang of searchLangs) {
      // Intento con parámetro 'set'
      try {
        const res = await axios.get<{ status: number; data: FortniteApiCosmetic[] }>(
          'https://fortnite-api.com/v2/cosmetics/br/search/all',
          {
            params: {
              set: term,
              language,
              searchLanguage: sLang,
            },
            timeout: 8_000,
          },
        );
        if (res.data?.status === 200 && Array.isArray(res.data.data) && res.data.data.length > 0) {
          const seen = new Set<string>();
          return res.data.data.filter((item) => {
            if (!item?.id || seen.has(item.id)) return false;
            seen.add(item.id);
            return true;
          });
        }
      } catch {
        // Continuar
      }

      // Intento con parámetro 'setText'
      try {
        const res = await axios.get<{ status: number; data: FortniteApiCosmetic[] }>(
          'https://fortnite-api.com/v2/cosmetics/br/search/all',
          {
            params: {
              setText: term,
              language,
              searchLanguage: sLang,
            },
            timeout: 8_000,
          },
        );
        if (res.data?.status === 200 && Array.isArray(res.data.data) && res.data.data.length > 0) {
          const seen = new Set<string>();
          return res.data.data.filter((item) => {
            if (!item?.id || seen.has(item.id)) return false;
            seen.add(item.id);
            return true;
          });
        }
      } catch {
        // Continuar
      }
    }
  }

  return [];
}

async function buildCosmeticView(
  cosmetic: FortniteApiCosmetic,
  shopMap: Map<string, any>,
  setItems: FortniteApiCosmetic[],
  isSpanish: boolean,
  interaction: ChatInputCommandInteraction,
) {
  const client = interaction.client;
  const { image, thumbnail } = resolveCosmeticImages(cosmetic);

  // Descripción / Cita de ambientación
  const description = cosmetic.description
    ? `> *«${cosmetic.description.replace(/\r?\n+/g, ' ').trim()}»*`
    : undefined;

  // Fila 1: Rareza, Tipo, Conjunto
  const seriesLabel = isSpanish ? 'Serie' : 'Series';
  const rarityLabel = isSpanish ? 'Rareza' : 'Rarity';
  const rarityValue = cosmetic.series?.value
    ? cosmetic.series.value
    : cosmetic.rarity?.displayValue || cosmetic.rarity?.value || (isSpanish ? 'Común' : 'Common');

  const typeLabel = isSpanish ? 'Tipo' : 'Type';
  const typeValue =
    cosmetic.type?.displayValue ||
    cosmetic.type?.value ||
    (isSpanish ? 'Cosmético' : 'Cosmetic');

  const setLabel = isSpanish ? 'Conjunto' : 'Set';
  const setValue = cosmetic.set?.value || cosmetic.set?.text || (isSpanish ? 'Sin conjunto' : 'None');

  // Fila 2: Introducción, Agregado al juego, Estado en Tienda
  const introLabel = isSpanish ? 'Introducción' : 'Introduced';
  let introValue = isSpanish ? 'Desconocida' : 'Unknown';
  if (cosmetic.introduction?.text) {
    introValue = cosmetic.introduction.text;
  } else if (cosmetic.introduction?.chapter) {
    introValue = isSpanish
      ? `Capítulo ${cosmetic.introduction.chapter}, Temp. ${cosmetic.introduction.season}`
      : `Chapter ${cosmetic.introduction.chapter}, Season ${cosmetic.introduction.season}`;
  }

  const addedLabel = isSpanish ? 'Agregado al juego' : 'Added to Game';
  let addedValue = isSpanish ? 'Desconocido' : 'Unknown';
  if (cosmetic.added) {
    const addedDate = new Date(cosmetic.added);
    if (!isNaN(addedDate.getTime())) {
      const addedTs = Math.floor(addedDate.getTime() / 1000);
      addedValue = `<t:${addedTs}:d>\n(<t:${addedTs}:R>)`;
    }
  }

  const inShopEntry = shopMap.get(cosmetic.id);
  const shopLabel = isSpanish ? 'Estado en Tienda' : 'Shop Status';
  const lastSeenLabel = isSpanish ? 'Última vez en Tienda' : 'Last Seen in Shop';
  let shopValue = isSpanish ? 'No disponible hoy' : 'Not in shop today';
  let lastSeenValue = isSpanish ? 'Nunca (Exclusivo / Pase)' : 'Never (Exclusive / Pass)';

  if (inShopEntry) {
    const vbucksEmoji = getEmoji(client, 'vbucks');
    const price = inShopEntry.finalPrice || 0;
    const vbucksPrefix = vbucksEmoji ? `${vbucksEmoji} ` : '';
    const currency = isSpanish ? 'Pavos' : 'V-Bucks';
    shopValue = `${vbucksPrefix}**${price.toLocaleString()}** ${currency}\n${isSpanish ? '¡Disponible hoy!' : 'In shop today!'}`;
    lastSeenValue = isSpanish ? 'Hoy en la tienda' : 'Today in shop';
  } else if (cosmetic.lastAppearance) {
    const lastDate = new Date(cosmetic.lastAppearance);
    if (!isNaN(lastDate.getTime())) {
      const lastTs = Math.floor(lastDate.getTime() / 1000);
      lastSeenValue = `<t:${lastTs}:d>\n(<t:${lastTs}:R>)`;
    }
  }

  // Fila 3: Compatibilidad e ID
  const compatLabel = isSpanish ? 'Compatibilidad' : 'Compatibility';
  const compatParts: string[] = [];
  if (cosmetic.images?.lego) compatParts.push('LEGO');
  if (cosmetic.images?.bean) compatParts.push('Fall Guys');
  const compatValue = compatParts.length > 0 ? compatParts.join(' · ') : (isSpanish ? 'Estándar' : 'Standard');

  const sep = ' · ';
  const fields: Array<{ name: string; value: string; inline: boolean }> = [
    {
      name: isSpanish ? 'Detalles' : 'Details',
      value: [
        `**${rarityLabel}:** ${rarityValue}${sep}**${typeLabel}:** ${typeValue}${sep}**${setLabel}:** ${setValue}`,
        `**${introLabel}:** ${introValue}${sep}**${compatLabel}:** ${compatValue}`,
      ].join('\n'),
      inline: false,
    },
    {
      name: isSpanish ? 'Tienda y fechas' : 'Shop & dates',
      value: [
        `**${shopLabel}:** ${shopValue.replace(/\n/g, ' ')}`,
        `**${lastSeenLabel}:** ${lastSeenValue.replace(/\n/g, ' ')}`,
        `**${addedLabel}:** ${addedValue.replace(/\n/g, ' ')}`,
      ].join('\n'),
      inline: false,
    },
    {
      name: 'ID',
      value: `\`${cosmetic.id}\``,
      inline: false,
    },
  ];

  // Variantes / Estilos (ancho completo)
  if (cosmetic.variants && cosmetic.variants.length > 0) {
    const totalStyles = cosmetic.variants.reduce((acc, v) => acc + (v.options?.length || 0), 0);
    const variantLines: string[] = [];
    for (const v of cosmetic.variants) {
      const channelName = v.type || v.channel || (isSpanish ? 'Estilo' : 'Style');
      const optionNames = (v.options || []).map((o) => o.name).filter(Boolean);
      if (optionNames.length > 0) {
        const sample = optionNames.slice(0, 5).join(', ');
        const more = optionNames.length > 5 ? ` (+${optionNames.length - 5} ${isSpanish ? 'más' : 'more'})` : '';
        variantLines.push(`• **${channelName}:** ${sample}${more}`);
      }
    }
    if (variantLines.length > 0) {
      fields.push({
        name: isSpanish ? `Estilos disponibles (${totalStyles})` : `Available Styles (${totalStyles})`,
        value: variantLines.join('\n'),
        inline: false,
      });
    }
  }

  // Detalles especiales (ancho completo)
  const specialDetails: string[] = [];
  if (cosmetic.builtInEmoteIds && cosmetic.builtInEmoteIds.length > 0) {
    specialDetails.push(
      `• **${isSpanish ? 'Gesto integrado' : 'Built-in Emote'}:** \`${cosmetic.builtInEmoteIds[0]}\``,
    );
  }
  if (cosmetic.unlockRequirements) {
    specialDetails.push(
      `• **${isSpanish ? 'Desbloqueo' : 'Unlock'}:** ${cosmetic.unlockRequirements}`,
    );
  }
  if (cosmetic.customExclusiveCallout) {
    specialDetails.push(
      `• **${isSpanish ? 'Exclusivo' : 'Exclusive'}:** ${cosmetic.customExclusiveCallout}`,
    );
  }
  if (specialDetails.length > 0) {
    fields.push({
      name: isSpanish ? 'Detalles especiales' : 'Special Details',
      value: specialDetails.join('\n'),
      inline: false,
    });
  }

  // Embed con estilo 'success'
  const embed = await createEmbed({
    style: 'success',
    title: cosmetic.name,
    description,
    fields,
    image,
    thumbnail,
    footer: 'developed',
    interaction,
  });

  const components: ActionRowBuilder<any>[] = [];

  // Componente 1: Select Menu para cosméticos del conjunto
  if (setItems.length > 1) {
    const setNameStr = cosmetic.set?.value || cosmetic.set?.text || (isSpanish ? 'Conjunto' : 'Set');
    const selectMenu = new StringSelectMenuBuilder()
      .setCustomId(`cosmetic_set_select:${interaction.id}`)
      .setPlaceholder(
        truncateLabel(
          isSpanish
            ? `Ver otro cosmético de ${setNameStr} (${setItems.length})...`
            : `View another item in ${setNameStr} (${setItems.length})...`,
          100,
        ),
      );

    const options = setItems.slice(0, 25).map((item) => {
      const typeStr = item.type?.displayValue || item.type?.value || 'Item';
      const rarityStr = item.rarity?.displayValue || item.rarity?.value || 'Common';
      return {
        label: truncateLabel(item.name, 100),
        value: item.id,
        description: truncateLabel(`${typeStr} · ${rarityStr}`, 100),
        default: item.id === cosmetic.id,
      };
    });

    selectMenu.addOptions(options);
    components.push(new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(selectMenu));
  }

  // Componente 2: Botón de YouTube si tiene video
  if (cosmetic.showcaseVideo) {
    const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder()
        .setLabel(isSpanish ? 'Ver muestra en YouTube' : 'Watch Showcase on YouTube')
        .setStyle(ButtonStyle.Link)
        .setURL(`https://youtu.be/${cosmetic.showcaseVideo}`),
    );
    components.push(row);
  }

  return { embed, components };
}

const command: Command = {
  data: new SlashCommandBuilder()
    .setName('cosmetic')
    .setDescription('Search and view Fortnite cosmetic information')
    .setNameLocalizations(buildDiscordLocalizations('cosmetic.cmd.name'))
    .setDescriptionLocalizations(buildDiscordLocalizations('cosmetic.cmd.description'))
    .addStringOption((opt) =>
      opt
        .setName('name')
        .setDescription('Cosmetic name or ID to search')
        .setNameLocalizations(buildDiscordLocalizations('cosmetic.cmd.options.name.name'))
        .setDescriptionLocalizations(buildDiscordLocalizations('cosmetic.cmd.options.name.description'))
        .setRequired(true)
        .setAutocomplete(true),
    )
    .setDMPermission(true),

  cooldown: 3,

  async autocomplete(interaction: AutocompleteInteraction): Promise<void> {
    try {
      const userId = interaction.user.id;
      const lang = await getFortniteApiLanguageCode(userId, interaction.locale);
      const query = (interaction.options.getFocused(true).value || '').trim().toLowerCase();

      // Búsqueda en la caché local de cosméticos si ya está cargada
      const cached = await getAllBrCosmetics(lang);

      let suggestions: Array<{ name: string; value: string }> = [];

      if (cached && cached.length > 0) {
        const matches =
          query.length === 0
            ? cached.slice(0, 25)
            : cached
                .filter(
                  (c) =>
                    c.name.toLowerCase().includes(query) || c.id.toLowerCase().includes(query),
                )
                .slice(0, 25);

        suggestions = matches.map((c) => ({
          name: truncateLabel(`${c.name} (${c.type}) • ${c.id}`),
          value: c.id,
        }));
      } else if (query.length >= 2) {
        // Fallback al endpoint de búsqueda remota si no hay caché en memoria
        const res = await axios.get<{ status: number; data: FortniteApiCosmetic[] }>(
          'https://fortnite-api.com/v2/cosmetics/br/search/all',
          {
            params: {
              name: query,
              matchMethod: 'contains',
              language: lang,
              searchLanguage: lang,
            },
            timeout: 2500,
          },
        );
        if (res.data?.status === 200 && Array.isArray(res.data.data)) {
          suggestions = res.data.data.slice(0, 25).map((c) => ({
            name: truncateLabel(`${c.name} (${c.type?.displayValue || 'Item'}) • ${c.id}`),
            value: c.id,
          }));
        }
      }

      await interaction.respond(suggestions);
    } catch (err) {
      log.commands.error({ err }, '[cosmetic] Error en autocomplete');
      await interaction.respond([]).catch(() => {});
    }
  },

  async execute(interaction: ChatInputCommandInteraction): Promise<void> {
    const userId = interaction.user.id;
    const locale = interaction.locale;
    const query = interaction.options.getString('name', true).trim();

    try {
      const apiLang = await getFortniteApiLanguageCode(userId, locale);
      const isSpanish = apiLang.startsWith('es') || locale.startsWith('es');

      // Consultar cosmético y tienda actual en paralelo para máxima velocidad
      const [cosmetic, shopMap] = await Promise.all([
        fetchCosmeticDetails(query, apiLang),
        fetchBrShopCosmeticMap(apiLang as any).catch(() => new Map()),
      ]);

      if (!cosmetic) {
        const notFoundEmbed = await createErrorEmbed({
          title: isSpanish ? 'Cosmético no encontrado' : 'Cosmetic Not Found',
          description: isSpanish
            ? `No se encontró ningún cosmético que coincida con **"${query}"**.\n\n> **Consejo:** Escribe las primeras letras del nombre y selecciona una sugerencia del autocompletado, o busca por su ID técnico (ej. \`CID_028_Athena_Commando_F\`).`
            : `No cosmetic matching **"${query}"** was found.\n\n> **Tip:** Start typing the name and select an autocomplete suggestion, or search using its exact technical ID (e.g. \`CID_028_Athena_Commando_F\`).`,
          interaction,
        });
        await interaction.editReply({ embeds: [notFoundEmbed] });
        return;
      }

      // Buscar otros cosméticos del mismo conjunto si pertenece a uno
      let setItems: FortniteApiCosmetic[] = [];
      const setName = cosmetic.set?.value || cosmetic.set?.text;
      if (setName) {
        setItems = await fetchCosmeticsBySet(setName, apiLang, cosmetic.set?.backendValue);
        // Asegurar que el actual esté en la lista si la API devolvió otros
        if (setItems.length > 0 && !setItems.some((c) => c.id === cosmetic.id)) {
          setItems.unshift(cosmetic);
        }
      }

      let currentCosmetic = cosmetic;
      const { embed, components } = await buildCosmeticView(
        currentCosmetic,
        shopMap,
        setItems,
        isSpanish,
        interaction,
      );

      await interaction.editReply({
        content: null,
        embeds: [embed],
        components,
      });

      // Si hay select menu interactivo del conjunto, escuchar interacciones
      if (setItems.length > 1) {
        try {
          const reply = await interaction.fetchReply();
          const collector = reply.createMessageComponentCollector({
            filter: (i) => i.user.id === userId && i.customId.startsWith('cosmetic_set_select:'),
            time: 120_000,
          });

          let currentComponents = components;

          collector.on('collect', async (i) => {
            if (!i.isStringSelectMenu()) return;
            const selectedId = i.values[0];
            if (selectedId === currentCosmetic.id) {
              await i.deferUpdate().catch(() => {});
              return;
            }

            // Obtener datos del nuevo cosmético seleccionado
            const newCosmetic = await fetchCosmeticDetails(selectedId, apiLang);
            if (!newCosmetic) {
              await i.deferUpdate().catch(() => {});
              return;
            }

            currentCosmetic = newCosmetic;
            const updated = await buildCosmeticView(
              currentCosmetic,
              shopMap,
              setItems,
              isSpanish,
              interaction,
            );

            currentComponents = updated.components;

            await i.update({
              embeds: [updated.embed],
              components: updated.components,
            }).catch(() => {});
          });

          collector.on('end', async () => {
            try {
              // Deshabilitar el select menu tras expirar el tiempo de recolección
              const disabledComponents = currentComponents.map((row) => {
                const json = row.toJSON() as any;
                for (const comp of json.components) {
                  comp.disabled = true;
                }
                return ActionRowBuilder.from(json);
              });
              await interaction.editReply({ components: disabledComponents as any }).catch(() => {});
            } catch {
              /* ignore */
            }
          });
        } catch (err) {
          log.commands.debug({ err }, '[cosmetic] Collector setup error');
        }
      }
    } catch (err: unknown) {
      const error = err instanceof Error ? err : new Error(String(err));
      log.commands.error({ error: error.message }, '[COSMETIC] Execute error');
      const errorEmbed = await generarEmbedError('api', {
        apiError: error,
        client: interaction.client,
        interaction,
      });
      await interaction.editReply({ embeds: [errorEmbed], components: [] });
    }
  },
};

export default command;
