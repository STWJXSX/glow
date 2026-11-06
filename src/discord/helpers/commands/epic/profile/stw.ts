/**
 * PERFIL STW (Save the World)
 * Muestra estadísticas de Save the World de cualquier jugador
 */

import { ChatInputCommandInteraction } from 'discord.js';
import axios from 'axios';

import { getEmoji } from '#helpers/core/emojis.ts';
import { getTranslations } from '#helpers/locales/index.ts';
import { composeMCP } from '#helpers/epic/utils/mcp.ts';
import { Endpoints } from '#helpers/core/endpoints.ts';
import { log } from '#helpers/core/logger.ts';
import { refreshDeviceAuthJson } from '#helpers/epic/auth/tokenRefresh.ts';
import { searchPlayersByPrefix, searchPlayersByDisplayName } from '#helpers/epic/social/searchPlayers.ts';
import UsuarioInfo from '#models/UsuarioInfo.ts';
import {
  epicQuote,
  epicSection,
  getEpicAuthor,
  replyEpicApiError,
  replyEpicCredentialError,
  replyWithEpicEmbed,
} from '../epicEmbedHelper.ts';
import type { AuthorData } from '#helpers/epic/account/avatarHandler.ts';
import { getAccountThumbnailUrl } from '#helpers/epic/account/avatarHandler.ts';
import { formatAthenaDatetime } from './xpProfileHelpers.ts';
import { formatMskWeaponRow } from './mskProfileEmojis.ts';
import { buildStwProfileData, isStwPrivateProfileError } from './stwProfileHelpers.ts';

function line(label: string, value: string): string {
  return `**${label}:** ${value}`;
}

function formatStat(value: number | null): string {
  return (value ?? 0).toLocaleString();
}

function formatResearchStat(value: number | null): string {
  return String(value ?? 0);
}

async function getAccountIdFromDisplayName(
  displayName: string,
  accessToken: string,
): Promise<{ id: string; displayName: string } | null> {
  try {
    const response = await axios.get(
      `${Endpoints.ACCOUNT_DISPLAYNAME}/${encodeURIComponent(displayName)}`,
      {
        headers: {
          Authorization: `bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        timeout: 5000,
      },
    );
    return response.data;
  } catch (error: unknown) {
    const status = (error as { response?: { status?: number } })?.response?.status;
    if (status === 404) return null;
    throw error;
  }
}

async function getAuthAccount(userId: string): Promise<{
  accountId: string;
  accessToken: string;
  displayName?: string;
} | null> {
  const userDb = await UsuarioInfo.findOne({ id: userId });
  const main = userDb?.deviceAuths?.find((acc: { cuentaMain?: boolean }) => acc.cuentaMain);

  if (main?.accessToken && main.accountId) {
    try {
      await axios.get(Endpoints.OAUTH_TOKEN_VERIFY, {
        headers: { Authorization: `bearer ${main.accessToken}` },
        timeout: 3000,
      });
      return {
        accountId: main.accountId,
        accessToken: main.accessToken,
        displayName: main.displayName,
      };
    } catch {
      // try deviceAuth fallback
    }
  }

  const deviceAuthData = await refreshDeviceAuthJson();
  if (!deviceAuthData?.accessToken || !deviceAuthData.accountId) return null;

  return {
    accountId: deviceAuthData.accountId,
    accessToken: deviceAuthData.accessToken,
    displayName: deviceAuthData.displayName,
  };
}

async function resolveAccountIdInput(
  inputValue: string,
  accessToken: string,
): Promise<{ accountId: string; displayName: string } | null> {
  if (!/^[a-f0-9]{32}$/i.test(inputValue)) return null;

  const accountId = inputValue.toLowerCase();
  try {
    const response = await axios.get(`${Endpoints.ACCOUNT_PUBLIC}/${accountId}`, {
      headers: { Authorization: `bearer ${accessToken}` },
      timeout: 5000,
    });
    if (response.data?.id) {
      return {
        accountId: response.data.id,
        displayName: response.data.displayName || accountId,
      };
    }
  } catch {
    // fall through — still use the ID for QueryPublicProfile
  }

  return { accountId, displayName: accountId };
}

async function resolveTargetPlayer(
  inputValue: string | null,
  mainAccount: { accountId: string; accessToken: string; displayName?: string },
  trans: Awaited<ReturnType<typeof getTranslations>>,
  interaction: ChatInputCommandInteraction,
): Promise<{ accountId: string; displayName: string; isSelf: boolean } | 'error'> {
  if (!inputValue) {
    return {
      accountId: mainAccount.accountId,
      displayName: mainAccount.displayName || trans.profile.stw.labels.yourAccount(),
      isSelf: true,
    };
  }

  const fromAccountId = await resolveAccountIdInput(inputValue, mainAccount.accessToken);
  if (fromAccountId) {
    return {
      accountId: fromAccountId.accountId,
      displayName: fromAccountId.displayName,
      isSelf: fromAccountId.accountId === mainAccount.accountId,
    };
  }

  const searchResults = await searchPlayersByPrefix(
    mainAccount.accessToken,
    inputValue,
    mainAccount.accountId,
    'epic',
  );

  let found = searchResults.find((p) => p.displayName.toLowerCase() === inputValue.toLowerCase());
  if (!found && searchResults.length > 0) found = searchResults[0];

  if (!found) {
    const exactResult = await searchPlayersByDisplayName(mainAccount.accessToken, inputValue);
    found = exactResult[0];
  }

  let targetAccountId = found?.accountId ?? null;
  let targetDisplayName = found?.displayName ?? null;

  if (!targetAccountId) {
    const accountData = await getAccountIdFromDisplayName(inputValue, mainAccount.accessToken);
    if (accountData) {
      targetAccountId = accountData.id;
      targetDisplayName = accountData.displayName;
    }
  }

  if (!targetAccountId || !targetDisplayName) {
    await replyWithEpicEmbed(interaction, interaction.user.id, {
      style: 'error',
      description: trans.profile.stw.errors.playerNotFound({ player: inputValue }),
      footerKey: 'brand',
    });
    return 'error';
  }

  return {
    accountId: targetAccountId,
    displayName: targetDisplayName,
    isSelf: targetAccountId === mainAccount.accountId,
  };
}

async function resolveAuthor(
  interaction: ChatInputCommandInteraction,
  isSelf: boolean,
): Promise<AuthorData | null> {
  if (!isSelf) return null;
  return getEpicAuthor(interaction.user.id);
}

export async function handleSTW(interaction: ChatInputCommandInteraction): Promise<void> {
  const trans = await getTranslations(interaction);
  const client = interaction.client;
  const userId = interaction.user.id;

  const emojiSuccess = getEmoji(client, 'success');
  const emojiError = getEmoji(client, 'error');
  const emojiRayo = getEmoji(client, 'rayo');
  const emojiTec = getEmoji(client, 'tec');
  const emojiFor = getEmoji(client, 'for');
  const emojiRes = getEmoji(client, 'res');
  const emojiAta = getEmoji(client, 'ata');

  const unknown = trans.profile.stw.labels.unknown();
  const neverPlayed = trans.profile.stw.labels.neverPlayed();

  const mainAccount = await getAuthAccount(userId);
  if (!mainAccount) {
    await replyEpicCredentialError(interaction, userId, 'noMain');
    return;
  }

  const rawPlayer = interaction.options.getString('player');
  const inputValue = rawPlayer?.trim() ? rawPlayer.trim() : null;
  const specialValues = [
    'no_account', 'invalid_token', 'no_results', 'token_expired',
    'rate_limited', 'search_error', 'bot_auth_error', 'bot_token_expired',
    'no_search_permissions',
  ];

  if (inputValue && specialValues.includes(inputValue)) {
    await replyWithEpicEmbed(interaction, userId, {
      style: 'error',
      description: trans.profile.stw.errors.autocomplete[inputValue](),
      footerKey: 'brand',
    });
    return;
  }

  const target = await resolveTargetPlayer(inputValue, mainAccount, trans, interaction);
  if (target === 'error') return;

  try {
    const campaign = await composeMCP({
      operation: target.isSelf ? 'QueryProfile' : 'QueryPublicProfile',
      route: target.isSelf ? 'client' : 'public',
      profile: 'campaign',
      accountId: target.accountId,
      accessToken: mainAccount.accessToken,
      logError: !target.isSelf,
    });

    const profile = campaign.profileChanges?.[0]?.profile;
    if (!profile || typeof profile !== 'object') {
      throw new Error('Empty campaign profile');
    }

    const data = await buildStwProfileData({
      campaignProfile: profile as Record<string, unknown>,
      accountId: target.accountId,
      accessToken: mainAccount.accessToken,
      isSelf: target.isSelf,
    });

    const overviewLines = [
      line(trans.profile.stw.labels.power(), `${emojiRayo} ${formatStat(data.powerLevel)}`),
      line(trans.profile.stw.labels.commanderLevel(), formatStat(data.commanderLevel)),
      line(trans.profile.stw.labels.pastCommanderLevel(), formatStat(data.pastCommanderLevel)),
      line(trans.profile.stw.labels.loginDays(), formatStat(data.loginDays)),
    ];

    if (data.founderEdition) {
      const founderEmoji = data.isFounder ? emojiSuccess : emojiError;
      overviewLines.push(line(
        trans.profile.stw.labels.founder(),
        `${founderEmoji} ${data.founderEdition}`,
      ));
    }

    const researchLines = [
      `- ${emojiTec} ${trans.profile.stw.labels.technology()}: **${formatResearchStat(data.research.technology)}**`,
      `- ${emojiFor} ${trans.profile.stw.labels.fortitude()}: **${formatResearchStat(data.research.fortitude)}**`,
      `- ${emojiRes} ${trans.profile.stw.labels.resistance()}: **${formatResearchStat(data.research.resistance)}**`,
      `- ${emojiAta} ${trans.profile.stw.labels.offense()}: **${formatResearchStat(data.research.offense)}**`,
    ].join('\n');

    const collectionLines = [
      line(
        trans.profile.stw.labels.collectionBookLevel(),
        formatStat(data.collectionBookLevel),
      ),
    ];
    if (data.collectionBookSpent != null) {
      collectionLines.push(line(
        trans.profile.stw.labels.collectionBookSpent(),
        data.collectionBookSpent.toLocaleString(),
      ));
    }

    const mskLine = formatMskWeaponRow(client, data.mskWeapons);

    const activityLines = [
      line(
        trans.profile.stw.labels.matchesPlayed(),
        formatStat(data.matchesPlayed),
      ),
      line(
        trans.profile.stw.labels.profileCreated(),
        formatAthenaDatetime(data.profileCreated, neverPlayed, unknown),
      ),
      line(
        trans.profile.stw.labels.profileRevision(),
        formatStat(data.profileRevision),
      ),
    ].join('\n');

    const sections = [
      epicSection(trans.profile.stw.sections.overview()),
      epicQuote(overviewLines.join('\n')),
      epicSection(trans.profile.stw.sections.research()),
      epicQuote(researchLines),
      epicSection(trans.profile.stw.sections.collectionBook()),
      epicQuote(collectionLines.join('\n')),
      epicSection(trans.profile.stw.sections.msk()),
      epicQuote(mskLine),
      epicSection(trans.profile.stw.sections.activity()),
      epicQuote(activityLines),
    ];

    const title = `__${target.displayName}__`;

    const [author, thumbnail] = await Promise.all([
      resolveAuthor(interaction, target.isSelf),
      getAccountThumbnailUrl(target.accountId, mainAccount.accessToken),
    ]);

    await replyWithEpicEmbed(
      interaction,
      userId,
      {
        title,
        description: sections.join('\n'),
        author,
        thumbnail,
        footerKey: 'brand',
      },
      { files: [] },
    );
  } catch (err: unknown) {
    const errorCode = (err as { errorCode?: string; response?: { data?: { errorCode?: string; errorMessage?: string } } })
      ?.errorCode
      ?? (err as { response?: { data?: { errorCode?: string; errorMessage?: string } } })?.response?.data?.errorCode;
    const errorMessage = (err as { message?: string; response?: { data?: { errorMessage?: string } } })?.message
      ?? (err as { response?: { data?: { errorMessage?: string } } })?.response?.data?.errorMessage;

    if (isStwPrivateProfileError(errorCode, errorMessage)) {
      await replyWithEpicEmbed(interaction, userId, {
        style: 'error',
        description: trans.profile.stw.errors.privateProfile({
          emoji: emojiError,
          player: target.displayName,
        }),
        footerKey: 'brand',
      });
      return;
    }

    log.epic.error({ err, accountId: target.accountId }, '[PROFILE STW] Query failed');
    await replyEpicApiError(interaction, userId, err);
  }
}
