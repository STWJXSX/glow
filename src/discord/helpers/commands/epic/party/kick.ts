import { ChatInputCommandInteraction } from 'discord.js';
import UsuarioInfo from '#models/UsuarioInfo.ts';
import { translateForUser } from '#helpers/locales/index.ts';
import { log } from '#helpers/core/logger.ts';
import { refreshAccountToken } from '#helpers/epic/auth/tokenRefresh.ts';
import { callCore, callCoreWithTimeout } from '#api/glowCore.ts';
import type { MissionKickResult } from './types.ts';
import {
  buildEpicReplyPayload,
  getEpicAuthor,
  replyEpicCustomError,
  translateEpic,
} from '../epicEmbedHelper.ts';
import { replyMissionKickFailure } from './missionKickReply.ts';

const logger = log.commands;

/** /kick — saca la cuenta main de su misión STW entrando en la party de un KickBot. */
export async function handleKick(interaction: ChatInputCommandInteraction): Promise<void> {
  const userId = interaction.user.id;
  const client = interaction.client;

  try {
    const userDb = await UsuarioInfo.findOne({ id: userId });
    const mainAccount = userDb?.deviceAuths.find((acc) => acc.cuentaMain);
    if (!userDb || !mainAccount) {
      await replyEpicCustomError(interaction, userId, 'kick.errors.unexpected');
      return;
    }

    const { account } = await refreshAccountToken(userDb, mainAccount.accountId);
    if (!account) {
      await replyEpicCustomError(interaction, userId, 'kick.errors.unexpected');
      return;
    }

    logger.info({ accountId: account.accountId }, '[kick] Mission kick');
    const result = await callCoreWithTimeout<MissionKickResult>('party.kick', 10 * 60_000, {
      accountId: account.accountId,
      accessToken: account.accessToken,
      displayName: account.displayName || mainAccount.displayName,
    });

    if (!result.ok) {
      logger.warn({ accountId: account.accountId, reason: result.reason, steps: result.steps }, '[kick] Mission kick failed');
      await replyMissionKickFailure(interaction, userId, result);
      return;
    }

    const payload = await buildEpicReplyPayload(userId, {
      style: 'success',
      title: await translateEpic(client, userId, 'party.kick.normal.embed.success.title', 'success'),
      description: await translateForUser(userId, 'party.kick.normal.embed.success.description', {
        displayName: account.displayName || mainAccount.displayName,
      }, interaction.locale),
      author: await getEpicAuthor(userId),
    }, interaction);
    await interaction.editReply(payload);
  } catch (error: any) {
    logger.error({ error }, '[kick] Unexpected error');
    await replyEpicCustomError(interaction, userId, 'kick.errors.unexpected');
  }
}
