/**
 * Invite Subcommand Handler
 * Invita a un jugador a tu party de Fortnite
 */

import { ChatInputCommandInteraction, AutocompleteInteraction } from 'discord.js';
import { log } from '#helpers/core/logger.ts';
import { translateForUser } from '#helpers/locales/index.ts';
import { searchPlayersAutocomplete } from '#helpers/epic/social/searchPlayers.ts';
import UsuarioInfo from '#models/UsuarioInfo.ts';
import { callCore } from '#api/glowCore.ts';
import type { InviteResult, ResolvePlayerResult } from './types.ts';
import {
  buildEpicReplyPayload,
  getEpicAuthor,
  replyEpicApiError,
  replyEpicCredentialError,
  replyEpicCustomError,
  replyWithEpicEmbed,
  translateEpic,
} from '../epicEmbedHelper.ts';

export async function handleInviteSubcommand(
  interaction: ChatInputCommandInteraction | AutocompleteInteraction,
  isAutocomplete: boolean = false,
): Promise<void> {
  if (isAutocomplete && interaction.isAutocomplete()) {
    try {
      await searchPlayersAutocomplete(interaction, 'user');
    } catch (error) {
      log.epic.error({ error }, 'Error in invite autocomplete');
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
      'no_search_permissions', 'limited_search', 'error_search',
    ];

    if (errorValues.includes(inputValue)) {
      await replyEpicCustomError(interaction, userId, `invite.errors.${inputValue}`);
      return;
    }

    const resolved = await callCore<ResolvePlayerResult>('party.resolvePlayer', {
      accessToken: mainAccount.accessToken,
      inputValue,
      timeoutMs: 5000,
    });

    if (!resolved.ok) {
      await replyEpicCustomError(interaction, userId, 'invite.errors.userNotFound', { inputValue });
      return;
    }

    const targetAccountId = resolved.accountId;
    const targetDisplayName = resolved.displayName;

    if (targetAccountId === mainAccount.accountId) {
      await replyWithEpicEmbed(interaction, userId, {
        style: 'warning',
        title: await translateEpic(client, userId, 'invite.errors.selfInvite', 'warning'),
        author,
      });
      return;
    }

    const inviteResult = await callCore<InviteResult>('party.invite', {
      accountId: mainAccount.accountId,
      accessToken: mainAccount.accessToken,
      displayName: mainAccount.displayName,
      targetAccountId,
    });

    if (!inviteResult.ok && inviteResult.reason === 'alreadyInParty') {
      await replyWithEpicEmbed(interaction, userId, {
        style: 'warning',
        title: await translateEpic(client, userId, 'invite.errors.alreadyInParty.title', 'warning'),
        description: await translateForUser(userId, 'invite.errors.alreadyInParty.description', {
          displayName: targetDisplayName,
        }, interaction.locale),
        author,
      });
      return;
    }

    if (!inviteResult.ok && inviteResult.reason === 'partyFull') {
      await replyWithEpicEmbed(interaction, userId, {
        style: 'warning',
        title: await translateEpic(client, userId, 'invite.errors.partyFull.title', 'warning'),
        description: await translateForUser(userId, 'invite.errors.partyFull.description', {
          current: String(inviteResult.size ?? 0),
          max: String(inviteResult.maxSize ?? 16),
        }, interaction.locale),
        author,
      });
      return;
    }

    await replyWithEpicEmbed(interaction, userId, {
      style: 'success',
      title: await translateEpic(client, userId, 'invite.success.title', 'success'),
      description: await translateForUser(userId, 'invite.success.description', {
        displayName: targetDisplayName,
      }, interaction.locale),
      author,
    });

    log.epic.info({ userId, targetAccountId, targetDisplayName }, 'Party invitation sent');
  } catch (error: any) {
    log.epic.error({ error }, 'Error handling invite subcommand');

    if (error.message === 'Party not found') {
      await replyWithEpicEmbed(interaction, userId, {
        style: 'warning',
        title: await translateEpic(client, userId, 'invite.errors.partyNotFound.title', 'warning'),
        description: await translateForUser(userId, 'invite.errors.partyNotFound.description', undefined, interaction.locale),
      });
      return;
    }

    if (error.message === 'Party permission error') {
      await replyWithEpicEmbed(interaction, userId, {
        style: 'warning',
        title: await translateEpic(client, userId, 'invite.errors.noPermissions.title', 'warning'),
        description: await translateForUser(userId, 'invite.errors.noPermissions.description', undefined, interaction.locale),
      });
      return;
    }

    if (error.response?.status === 409) {
      await replyWithEpicEmbed(interaction, userId, {
        style: 'warning',
        title: await translateEpic(client, userId, 'invite.errors.inviteError.title', 'warning'),
        description: await translateForUser(userId, 'invite.errors.inviteError.description', undefined, interaction.locale),
      });
      return;
    }

    if (error.response?.status === 403) {
      await replyWithEpicEmbed(interaction, userId, {
        style: 'warning',
        title: await translateEpic(client, userId, 'invite.errors.inviteBlocked.title', 'warning'),
        description: await translateForUser(userId, 'invite.errors.inviteBlocked.description', undefined, interaction.locale),
      });
      return;
    }

    await replyEpicApiError(interaction, userId, error);
  }
}
