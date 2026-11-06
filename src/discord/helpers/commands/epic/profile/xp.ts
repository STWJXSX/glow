/**
 * PERFIL XP
 * Muestra progreso de XP y niveles de pases en Fortnite
 */

import { ChatInputCommandInteraction } from 'discord.js';
import { getEmoji, getEmojiCdnUrl } from '#helpers/core/emojis.ts';
import { getTranslations } from '#helpers/locales/index.ts';
import { composeMCP } from '#helpers/epic/utils/mcp.ts';
import {
  epicQuote,
  epicSection,
  getEpicAuthor,
  replyEpicApiError,
  replyEpicCredentialError,
  replyWithEpicEmbed,
} from '../epicEmbedHelper.ts';
import UsuarioInfo from '#models/UsuarioInfo.ts';
import {
  fetchStwWeeklyXp,
  formatAthenaDatetime,
  formatLevelValue,
  formatXpProgress,
  resolvePassLevels,
  resolveSeasonXpInfo,
  resolveWeeklyXp,
  resolveXpBoosts,
  type AthenaItem,
} from './xpProfileHelpers.ts';

function line(label: string, value: string): string {
  return `**${label}:** ${value}`;
}

export async function handleXP(interaction: ChatInputCommandInteraction): Promise<void> {
  const trans = await getTranslations(interaction);
  const client = interaction.client;
  const userId = interaction.user.id;
  const emojiXP = getEmoji(client, 'xp');
  const notAvailable = trans.profile.xp.labels.notAvailable();
  const unknown = trans.profile.xp.labels.unknown();

  const user = await UsuarioInfo.findOne({ id: userId });
  const mainAccount = user?.deviceAuths?.find((acc: { cuentaMain?: boolean }) => acc.cuentaMain);

  if (!mainAccount) {
    await replyEpicCredentialError(interaction, userId, 'noMain');
    return;
  }

  try {
    const athena = await composeMCP({
      operation: 'QueryProfile',
      profile: 'athena',
      accountId: mainAccount.accountId,
      accessToken: mainAccount.accessToken,
    });

    const profile = athena.profileChanges?.[0]?.profile;
    const attrs = (profile?.stats?.attributes ?? {}) as Record<string, unknown>;
    const items = (profile?.items ?? {}) as Record<string, AthenaItem>;

    const passLevels = resolvePassLevels(attrs, items);
    const stwWeekly = await fetchStwWeeklyXp(
      composeMCP,
      mainAccount.accountId,
      mainAccount.accessToken,
    );
    const weeklyXp = resolveWeeklyXp(attrs, stwWeekly);
    const seasonInfo = resolveSeasonXpInfo(attrs);
    const boosts = resolveXpBoosts(attrs, items);
    const accountLevel = typeof attrs.accountLevel === 'number' ? attrs.accountLevel : null;

    const passLines = [
      line(trans.profile.xp.labels.legoPass(), formatLevelValue(passLevels.lego, notAvailable)),
      line(trans.profile.xp.labels.musicalPass(), formatLevelValue(passLevels.musical, notAvailable)),
      line(trans.profile.xp.labels.originsPass(), formatLevelValue(passLevels.origins, notAvailable)),
      line(trans.profile.xp.labels.battlePass(), formatLevelValue(passLevels.battle, notAvailable)),
    ].join('\n');

    const weeklyLines = [
      line(trans.profile.xp.labels.reloadModes(), formatXpProgress(weeklyXp.reload, weeklyXp.reloadMax, emojiXP)),
      line(trans.profile.xp.labels.creative(), formatXpProgress(weeklyXp.creative, weeklyXp.creativeMax, emojiXP)),
      line(
        trans.profile.xp.labels.stw(),
        weeklyXp.stw === null
          ? notAvailable
          : formatXpProgress(weeklyXp.stw, weeklyXp.stwMax, emojiXP),
      ),
      line(
        trans.profile.xp.labels.lastStwXpTransfer(),
        formatAthenaDatetime(attrs.last_stw_accolade_transfer_datetime, notAvailable, unknown),
      ),
    ].join('\n');

    const seasonLines = [
      line(trans.profile.xp.labels.bookLevel(), String(seasonInfo.bookLevel)),
      line(trans.profile.xp.labels.bookXp(), seasonInfo.bookXpRemaining.toLocaleString()),
    ].join('\n');

    const boostLines: string[] = [];
    boostLines.push(
      line(trans.profile.xp.labels.restedXpConsumed(), boosts.restedXpConsumed.toLocaleString()),
    );
    if (boosts.restedXp > 0 || boosts.restedMultiplier > 0) {
      const restedValue =
        boosts.restedMultiplier > 0
          ? `${boosts.restedXp.toLocaleString()} (x${boosts.restedMultiplier})`
          : boosts.restedXp.toLocaleString();
      boostLines.push(line(trans.profile.xp.labels.restedXp(), restedValue));
    }
    if (boosts.personalBoost > 0) {
      boostLines.push(line(trans.profile.xp.labels.personalBoost(), String(boosts.personalBoost)));
    }
    if (boosts.friendBoost > 0) {
      boostLines.push(line(trans.profile.xp.labels.friendBoost(), String(boosts.friendBoost)));
    }
    if (boosts.comboBoost > 0) {
      boostLines.push(line(trans.profile.xp.labels.comboBoost(), String(boosts.comboBoost)));
    }

    const sections = [
      epicSection(trans.profile.xp.sections.passes()),
      epicQuote(passLines),
      epicSection(trans.profile.xp.sections.weeklyXp()),
      epicQuote(weeklyLines),
    ];

    if (seasonInfo.seasonNum > 0) {
      sections.push(
        epicSection(trans.profile.xp.sections.season({ season: seasonInfo.seasonNum })),
        epicQuote(seasonLines),
      );
    }

    if (boostLines.length > 0) {
      sections.push(epicSection(trans.profile.xp.sections.boosts()), epicQuote(boostLines.join('\n')));
    }

    sections.push(
      epicSection(trans.profile.xp.sections.account()),
      epicQuote(
        line(
          trans.profile.xp.labels.accountLevel(),
          accountLevel === null ? notAvailable : accountLevel.toLocaleString(),
        ),
      ),
    );

    const author = await getEpicAuthor(userId);
    const xpThumbnail = getEmojiCdnUrl('xp', 128) ?? undefined;

    await replyWithEpicEmbed(
      interaction,
      userId,
      {
        title: trans.profile.xp.title(),
        description: sections.join('\n'),
        author,
        thumbnail: xpThumbnail,
        footerKey: 'brand',
      },
      { files: [] },
    );
  } catch (err) {
    await replyEpicApiError(interaction, userId, err);
  }
}
