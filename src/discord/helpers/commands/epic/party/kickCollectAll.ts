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
import type { KickMembersResult, RewardsMap } from './types.ts';

const logger = log.commands;


export async function handleKickCollectAll(interaction: ChatInputCommandInteraction): Promise<void> {
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

    const userLocale = await UsuarioInfo.findOne({ id: userId });
    const userLanguage = (userLocale as any)?.idioma || 'es';

    logger.info({ accountId: account.accountId }, '[kickCollectAll] Getting current party');

    let partyId: string | undefined;
    try {
      const currentPartyId = await callCore<string | null>('party.id', {
        accountId: account.accountId,
        accessToken: account.accessToken,
        displayName: account.displayName,
      });

      partyId = currentPartyId ?? undefined;
    } catch (error: any) {
      logger.error({ error: error?.response?.data || error }, '[kickCollectAll] Error getting party');
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

    const kickResult = await callCoreWithTimeout<KickMembersResult>('party.kickMembersSafe', 5 * 60_000, {
      accountId: account.accountId,
      accessToken: account.accessToken,
      displayName: account.displayName,
    });
    const isLeader = kickResult.isLeader;
    const kickedMembers = kickResult.kickedCount;

    const recompensas = await callCoreWithTimeout<RewardsMap>('party.claimRewards', 10 * 60_000, {
      accountId: account.accountId,
      accessToken: account.accessToken,
      displayName: account.displayName,
      language: userLanguage,
    });

    try {
      await callCore('party.leave', {
        accountId: account.accountId,
        accessToken: account.accessToken,
        displayName: account.displayName,
      });

      const author = await getEpicAuthor(userId);
      const hasRewards = Object.keys(recompensas).length > 0;
      const extraFields: Array<{ name: string; value: string; inline?: boolean }> = [];

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

        extraFields.push({
          name: await translateForUser(userId, 'party.kick.collect.fields.rewards', undefined, interaction.locale),
          value: recompensasTexto,
          inline: false,
        });
      }

      if (isLeader && kickedMembers > 0) {
        extraFields.push({
          name: await translateForUser(userId, 'party.kick.collectall.fields.membersKicked', undefined, interaction.locale),
          value: await translateForUser(userId, 'party.kick.collectall.fields.kickedCount', { count: kickedMembers }, interaction.locale),
          inline: false,
        });
      } else if (!isLeader) {
        extraFields.push({
          name: await translateForUser(userId, 'party.kick.collectall.fields.membersKicked', undefined, interaction.locale),
          value: await translateForUser(userId, 'party.kick.collectall.fields.notLeader', undefined, interaction.locale),
          inline: false,
        });
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
        fields: extraFields.length > 0 ? extraFields : undefined,
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

      logger.error({ error: error?.response?.data || error }, '[kickCollectAll] Error leaving party');
      await replyWithEpicEmbed(interaction, userId, {
        style: 'error',
        title: await translateEpic(client, userId, 'party.kick.collect.embed.kickError.title', 'error'),
        description: await translateForUser(userId, 'party.kick.collect.embed.kickError.description', undefined, interaction.locale),
      });
    }
  } catch (error: any) {
    logger.error({ error }, '[kickCollectAll] Unexpected error');
    await replyWithEpicEmbed(interaction, userId, {
      style: 'error',
      description: epicEmojiLine(client, 'error', await translateForUser(userId, 'kick.errors.unexpected', undefined, interaction.locale)),
    });
  }
}
