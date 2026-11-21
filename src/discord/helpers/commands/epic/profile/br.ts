/**
 * PERFIL BR (Battle Royale)
 * Muestra estadísticas generales de Battle Royale
 */

import { ChatInputCommandInteraction, EmbedBuilder } from 'discord.js';
import { getEmoji } from '#helpers/core/emojis.ts';
import { getTranslations } from '#helpers/locales/index.ts';
import { composeMCP } from '#helpers/epic/utils/mcp.ts';
import { getMainAccountAuthor } from '#helpers/epic/account/avatarHandler.ts';
import UsuarioInfo from '#models/UsuarioInfo.ts';

export async function handleBR(interaction: ChatInputCommandInteraction): Promise<void> {
  const trans = await getTranslations(interaction);
  const client = interaction.client;

  const emojiSuccess = getEmoji(client, 'success');
  const emojiError = getEmoji(client, 'error');

  // Obtener cuenta principal
  const user = await UsuarioInfo.findOne({ id: interaction.user.id });
  const mainAccount = user?.deviceAuths?.find((acc: any) => acc.cuentaMain);

  if (!mainAccount) {
    const embed = new EmbedBuilder()
      .setColor(0xcf0d10)
      .setDescription(trans.profile.br.errors.statsNotAvailable({ emoji: emojiError }));
    await interaction.editReply({ embeds: [embed] });
    return;
  }

  const authorData = await getMainAccountAuthor(interaction.user.id);

  let stats: any = {};
  let profile: any = {};
  let items: any = {};

  try {
    const mcpData = await composeMCP({
      operation: 'QueryProfile',
      profile: 'athena',
      accountId: mainAccount.accountId,
      accessToken: mainAccount.accessToken
    });

    profile = mcpData.profileChanges?.[0]?.profile || {};
    stats = profile?.stats?.attributes || {};
    items = profile?.items || {};
  } catch (err) {
    const embed = new EmbedBuilder()
      .setColor(0xcf0d10)
      .setDescription(trans.profile.br.errors.statsNotAvailable({ emoji: emojiError }));
    await interaction.editReply({ embeds: [embed] });
    return;
  }

  // Extraer estadísticas
  const lifetimeWins = stats.lifetime_wins ?? 0;
  const accountLevel = stats.accountLevel ?? trans.profile.br.labels.notAvailable();
  const seasonNum = stats.season_num ?? trans.profile.br.labels.notAvailable();
  const createdAt = profile.created
    ? `<t:${Math.floor(new Date(profile.created).getTime() / 1000)}:F>`
    : trans.profile.br.labels.unknown();

  // Coronas
  let totalCrowns = 0;
  let seasonCrowns = 0;
  let maxSeason = 0;

  if (Array.isArray(stats.past_seasons)) {
    for (const season of stats.past_seasons) {
      if (typeof season.numRoyalRoyales === 'number') {
        totalCrowns += season.numRoyalRoyales;
      }
      if (typeof season.seasonNumber === 'number' && season.seasonNumber > maxSeason) {
        maxSeason = season.seasonNumber;
      }
    }
    const lastSeason = stats.past_seasons.find((s: any) => s.seasonNumber === maxSeason);
    if (lastSeason && typeof lastSeason.numRoyalRoyales === 'number') {
      seasonCrowns = lastSeason.numRoyalRoyales;
    }
  }

  const lastMatch = stats.last_match_end_datetime
    ? `<t:${Math.floor(new Date(stats.last_match_end_datetime).getTime() / 1000)}:R>`
    : trans.profile.br.labels.unknown();

  // Funciones para detectar pases
  function tienePaseLego(items: any): boolean {
    const regex = /^AthenaSeason:s\d+pass_seasonasset$/i;
    return Object.values(items).some(
      (item: any) =>
        typeof item.templateId === 'string' &&
        regex.test(item.templateId) &&
        item.attributes &&
        item.attributes.purchased === true
    );
  }

  function tienePaseMusical(items: any): boolean {
    return Object.values(items).some(
      (item: any) =>
        typeof item.templateId === 'string' &&
        item.templateId.includes('AthenaSeason:sparks_season') &&
        item.attributes &&
        item.attributes.purchased === true
    );
  }

  function tienePaseOrigenes(items: any): boolean {
    return Object.values(items).some(
      (item: any) =>
        typeof item.templateId === 'string' &&
        item.templateId.includes('AthenaSeason:figmentpass') &&
        item.attributes &&
        item.attributes.purchased === true
    );
  }

  function tienePaseBatalla(items: any): boolean {
    return Object.values(items).some(
      (item: any) =>
        typeof item.templateId === 'string' &&
        item.templateId.includes('AthenaSeason:athenaseason') &&
        item.attributes &&
        item.attributes.purchased === true
    );
  }

  const tieneLego = tienePaseLego(items);
  const tieneMusical = tienePaseMusical(items);
  const tieneOrigenes = tienePaseOrigenes(items);
  const tieneBatalla = tienePaseBatalla(items);

  const embed = new EmbedBuilder()
    .setColor(0xFF6B35)
    .setAuthor(authorData || { name: 'BR Profile' })
    .setTitle(trans.profile.br.embed.title())
    .setDescription(
      trans.profile.br.embed.description({
        lifetimeWins: lifetimeWins,
        accountLevel: accountLevel,
        seasonNum: seasonNum,
        totalCrowns: totalCrowns,
        seasonCrowns: seasonCrowns,
        lastMatch: lastMatch,
        legoPass: tieneLego ? emojiSuccess : emojiError,
        musicalPass: tieneMusical ? emojiSuccess : emojiError,
        originsPass: tieneOrigenes ? emojiSuccess : emojiError,
        battlePass: tieneBatalla ? emojiSuccess : emojiError,
        createdAt: createdAt
      })
    )
    .setFooter({
      text: interaction.user.username,
      iconURL: interaction.user.displayAvatarURL()
    });

  await interaction.editReply({ embeds: [embed] });
}
