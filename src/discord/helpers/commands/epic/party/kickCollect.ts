import { ChatInputCommandInteraction } from 'discord.js';
import UsuarioInfo from '#models/UsuarioInfo.ts';
import { translateForUser } from '#helpers/locales/index.ts';
import { log } from '#helpers/core/logger.ts';
import { callCore, callCoreWithTimeout } from '#api/glowCore.ts';
import {
  buildEpicReplyPayload,
  epicEmojiLine,
  getEpicAuthor,
  replyEpicCustomError,
  replyWithEpicEmbed,
  translateEpic,
} from '../epicEmbedHelper.ts';
import { getUserLanguage } from '#helpers/locales/index.ts';
import type { MissionKickResult, RewardsMap } from './types.ts';
import { replyMissionKickFailure } from './missionKickReply.ts';

const logger = log.commands;

export async function handleKickCollect(interaction: ChatInputCommandInteraction): Promise<void> {
  const userId = interaction.user.id;
  const client = interaction.client;

  try {
    const userDb = await UsuarioInfo.findOne({ id: userId });
    if (!userDb) {
      await replyEpicCustomError(interaction, userId, 'kick.errors.unexpected');
      return;
    }

    const mainAccount = userDb.deviceAuths.find((acc) => acc.cuentaMain);
    if (!mainAccount) {
      await replyEpicCustomError(interaction, userId, 'kick.errors.unexpected');
      return;
    }

    const account = mainAccount;

    const userLanguage = await getUserLanguage(userId, interaction.locale);

    logger.info({ accountId: account.accountId }, '[kickCollect] Getting current party');

    let partyId: string | undefined;
    try {
      const currentPartyId = await callCore<string | null>('party.id', {
        accountId: account.accountId,
        accessToken: account.accessToken,
        displayName: account.displayName,
      });

      partyId = currentPartyId ?? undefined;
    } catch (error: any) {
      logger.error({ error: error?.response?.data || error }, '[kickCollect] Error getting party');
      await replyWithEpicEmbed(interaction, userId, {
        style: 'warning',
        title: await translateEpic(client, userId, 'party.kick.collect.embed.connectionError.title', 'warning'),
        description: await translateForUser(userId, 'party.kick.collect.embed.connectionError.description', undefined, interaction.locale),
      });
      return;
    }

    if (!partyId) {
      await replyWithEpicEmbed(interaction, userId, {
        style: 'warning',
        title: await translateEpic(client, userId, 'party.kick.collect.embed.noParty.title', 'warning'),
        description: await translateForUser(userId, 'party.kick.collect.embed.noParty.description', {
          displayName: account.displayName,
        }, interaction.locale),
      });
      return;
    }

    logger.info({ accountId: account.accountId }, '[kickCollect] Processing rewards');

    const recompensas = await callCoreWithTimeout<RewardsMap>('party.claimRewards', 10 * 60_000, {
      accountId: account.accountId,
      accessToken: account.accessToken,
      displayName: account.displayName,
      language: userLanguage,
    });

    logger.info({ partyId, accountId: account.accountId }, '[kickCollect] Mission kick');

    try {
      const kick = await callCoreWithTimeout<MissionKickResult>('party.kick', 10 * 60_000, {
        accountId: account.accountId,
        accessToken: account.accessToken,
        displayName: account.displayName,
      });
      if (!kick.ok) {
        logger.warn({ accountId: account.accountId, reason: kick.reason, steps: kick.steps }, '[kickCollect] Mission kick failed');
        await replyMissionKickFailure(interaction, userId, kick);
        return;
      }

      const author = await getEpicAuthor(userId);
      const hasRewards = Object.keys(recompensas).length > 0;

      let fields: Array<{ name: string; value: string; inline?: boolean }> | undefined;
      if (hasRewards) {
        const recompensasFormateadas = Object.entries(recompensas)
          .sort(([, a], [, b]) => b.cantidad - a.cantidad)
          .map(([, data]) => `${data.emoji}x${data.cantidad}`);

        let recompensasTexto = recompensasFormateadas.join(' ');
        if (recompensasTexto.length > 1000) {
          const textoCorto = recompensasTexto.substring(0, 980);
          const ultimoEspacio = textoCorto.lastIndexOf(' ');
          recompensasTexto = `${textoCorto.substring(0, ultimoEspacio)} ...`;
        }

        fields = [{
          name: await translateForUser(userId, 'party.kick.collect.fields.rewards', undefined, interaction.locale),
          value: recompensasTexto,
          inline: false,
        }];
      }

      const payload = await buildEpicReplyPayload(userId, {
        style: 'success',
        title: await translateEpic(
          client,
          userId,
          hasRewards ? 'party.kick.collect.embed.successWithRewards.title' : 'party.kick.collect.embed.noRewards.title',
          hasRewards ? 'success' : 'info',
        ),
        description: await translateForUser(
          userId,
          hasRewards ? 'party.kick.collect.embed.successWithRewards.description' : 'party.kick.collect.embed.noRewards.description',
          { displayName: account.displayName },
          interaction.locale,
        ),
        fields,
        author,
      }, interaction);

      await interaction.editReply(payload);
    } catch (error: any) {
      if (error.response?.status === 404) {
        await replyWithEpicEmbed(interaction, userId, {
          style: 'warning',
          title: await translateEpic(client, userId, 'party.kick.collect.embed.notFound.title', 'warning'),
          description: await translateForUser(userId, 'party.kick.collect.embed.notFound.description', undefined, interaction.locale),
        });
        return;
      }

      logger.error({ error: error?.response?.data || error }, '[kickCollect] Error leaving party');
      await replyWithEpicEmbed(interaction, userId, {
        style: 'error',
        title: await translateEpic(client, userId, 'party.kick.collect.embed.kickError.title', 'error'),
        description: await translateForUser(userId, 'party.kick.collect.embed.kickError.description', undefined, interaction.locale),
      });
    }
  } catch (error: any) {
    logger.error({ error }, '[kickCollect] Unexpected error');
    await replyWithEpicEmbed(interaction, userId, {
      style: 'error',
      description: epicEmojiLine(client, 'error', await translateForUser(userId, 'kick.errors.unexpected', undefined, interaction.locale)),
    });
  }
}
