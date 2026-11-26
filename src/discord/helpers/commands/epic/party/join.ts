/**
 * Join Subcommand Handler
 * Solicita unirte al grupo de un jugador
 */

import { ChatInputCommandInteraction, AutocompleteInteraction } from 'discord.js';
import { log } from '#helpers/core/logger.ts';
import { translateForUser } from '#helpers/locales/index.ts';
import { searchPlayersAutocomplete } from '#helpers/epic/social/searchPlayers.ts';
import UsuarioInfo from '#models/UsuarioInfo.ts';
import { callCore } from '#api/glowCore.ts';
import type { ResolvePlayerResult } from './types.ts';
import {
  getEpicAuthor,
  replyEpicApiError,
  replyEpicCredentialError,
  replyEpicCustomError,
  replyWithEpicEmbed,
  translateEpic,
} from '../epicEmbedHelper.ts';

export async function handleJoinSubcommand(
  interaction: ChatInputCommandInteraction | AutocompleteInteraction,
  isAutocomplete: boolean = false,
): Promise<void> {
  if (isAutocomplete && interaction.isAutocomplete()) {
    try {
      await searchPlayersAutocomplete(interaction, 'user');
    } catch (error) {
      log.epic.error({ error }, 'Error in join autocomplete');
      await interaction.respond([]);
    }
    return;
  }

  if (!interaction.isChatInputCommand()) return;

  const userId = interaction.user.id;
  const client = interaction.client;

  try {
    const user = await UsuarioInfo.findOne({ id: userId });
    if (!user) {
      await replyEpicCustomError(interaction, userId, 'epic.errors.unexpected');
      return;
    }

    const mainAccount = user.deviceAuths.find((acc) => acc.cuentaMain);
    if (!mainAccount) {
      await replyEpicCredentialError(interaction, userId, 'noMain');
      return;
    }

    const author = await getEpicAuthor(userId, {
      accountId: mainAccount.accountId,
      accessToken: mainAccount.accessToken,
      displayName: mainAccount.displayName,
    });

    const inputValue = interaction.options.getString('user', true);

    const errorValues = [
      'no_account', 'invalid_token', 'no_results', 'token_expired',
      'rate_limited', 'search_error', 'bot_auth_error', 'bot_token_expired',
      'no_search_permissions', 'limited_search',
    ];

    if (errorValues.includes(inputValue)) {
      await replyEpicCustomError(interaction, userId, `unirse.errors.${inputValue}`);
      return;
    }

    const resolved = await callCore<ResolvePlayerResult>('party.resolvePlayer', {
      accessToken: mainAccount.accessToken,
      inputValue,
    });

    if (!resolved.ok) {
      await replyEpicCustomError(interaction, userId, 'unirse.errors.userNotFound', { inputValue });
      return;
    }

    const targetAccountId = resolved.accountId;
    const targetDisplayName = resolved.displayName;

    if (targetAccountId === mainAccount.accountId) {
      await replyWithEpicEmbed(interaction, userId, {
        style: 'warning',
        title: await translateEpic(client, userId, 'unirse.errors.selfJoin', 'warning'),
        author,
      });
      return;
    }

    log.epic.info({
      accountId: mainAccount.accountId,
      displayName: mainAccount.displayName,
      targetAccountId,
      userId,
    }, 'Iniciando proceso de join a party');

    await replyWithEpicEmbed(interaction, userId, {
      style: 'info',
      title: await translateEpic(client, userId, 'unirse.waiting.title', 'loading'),
      description: await translateForUser(userId, 'unirse.waiting.description', {
        displayName: targetDisplayName,
      }, interaction.locale),
      author,
    });

    try {
      await callCore('party.requestJoin', {
        accountId: mainAccount.accountId,
        accessToken: mainAccount.accessToken,
        displayName: mainAccount.displayName,
        targetAccountId,
      });
      log.epic.info({ userId, targetAccountId, targetDisplayName }, 'Request to join sent successfully');

      await replyWithEpicEmbed(interaction, userId, {
        style: 'success',
        title: await translateEpic(client, userId, 'unirse.success.title', 'success'),
        description: await translateForUser(userId, 'unirse.waiting.description', {
          displayName: targetDisplayName,
        }, interaction.locale),
        author,
      });
    } catch (error: any) {
      log.epic.error({ error, status: error.response?.status, message: error.message }, 'Error sending join request');

      if (error.response?.status === 404
        && error.response?.data?.errorCode === 'errors.com.epicgames.social.party.user_has_no_party') {
        await replyWithEpicEmbed(interaction, userId, {
          style: 'warning',
          title: await translateEpic(client, userId, 'unirse.errors.noParty.title', 'warning'),
          description: await translateForUser(userId, 'unirse.errors.noParty.description', {
            displayName: targetDisplayName,
          }, interaction.locale),
          author,
        });
        return;
      }

      if (error.response?.status === 404
        && error.response?.data?.errorCode === 'errors.com.epicgames.social.party.party_not_found') {
        await replyWithEpicEmbed(interaction, userId, {
          style: 'warning',
          title: await translateEpic(client, userId, 'unirse.errors.partyNotFound.title', 'warning'),
          description: await translateForUser(userId, 'unirse.errors.partyNotFound.description', {
            displayName: targetDisplayName,
          }, interaction.locale),
          author,
        });
        return;
      }

      if (error.response?.status === 403) {
        await replyWithEpicEmbed(interaction, userId, {
          style: 'warning',
          title: await translateEpic(client, userId, 'unirse.errors.accessDenied.title', 'warning'),
          description: await translateForUser(userId, 'unirse.errors.accessDenied.description', {
            displayName: targetDisplayName,
          }, interaction.locale),
          author,
        });
        return;
      }

      if (error.response?.status === 409) {
        await replyWithEpicEmbed(interaction, userId, {
          style: 'warning',
          title: await translateEpic(client, userId, 'unirse.errors.alreadyInParty.title', 'warning'),
          description: await translateForUser(userId, 'unirse.errors.alreadyInParty.description', undefined, interaction.locale),
          author,
        });
        return;
      }

      throw error;
    }
  } catch (error: any) {
    log.epic.error({ error }, 'Error handling join subcommand');
    await replyEpicApiError(interaction, userId, error);
  }
}
