import { ChatInputCommandInteraction, AutocompleteInteraction } from 'discord.js';
import { log } from '#helpers/core/logger.ts';
import { translateForUser } from '#helpers/locales/index.ts';
import UsuarioInfo from '#models/UsuarioInfo.ts';
import { callCore } from '#api/glowCore.ts';
import type { PromoteChoicesResult, PromoteResult } from './types.ts';
import {
  getEpicAuthor,
  replyEpicApiError,
  replyEpicCredentialError,
  replyEpicCustomError,
  replyWithEpicEmbed,
  translateEpic,
} from '../epicEmbedHelper.ts';

export async function handlePromoteSubcommand(
  interaction: ChatInputCommandInteraction | AutocompleteInteraction,
  isAutocomplete: boolean = false,
): Promise<void> {
  if (isAutocomplete && interaction.isAutocomplete()) {
    try {
      const user = await UsuarioInfo.findOne({ id: interaction.user.id });

      if (!user?.deviceAuths || user.deviceAuths.length === 0) {
        const errorMsg = await translateForUser(interaction.user.id, 'promote.errors.autocompleteLoad');
        return await interaction.respond([{ name: errorMsg, value: 'error' }]);
      }

      const mainAccount = user.deviceAuths.find((acc) => acc.cuentaMain);
      if (!mainAccount) {
        const errorMsg = await translateForUser(interaction.user.id, 'promote.errors.autocompleteLoad');
        return await interaction.respond([{ name: errorMsg, value: 'error' }]);
      }

      const result = await callCore<PromoteChoicesResult>('party.promoteChoices', {
        accountId: mainAccount.accountId,
        accessToken: mainAccount.accessToken,
        displayName: mainAccount.displayName,
        query: interaction.options.getFocused(true).value,
      });

      if (!result.ok) {
        const errorMsg = await translateForUser(interaction.user.id, 'promote.errors.autocompleteLoad');
        return await interaction.respond([{ name: errorMsg, value: 'error' }]);
      }

      await interaction.respond(result.choices);
    } catch (error) {
      log.epic.error({ error }, 'Error in promote autocomplete');
      await interaction.respond([{
        name: await translateForUser(interaction.user.id, 'promote.errors.autocompleteError', undefined, interaction.locale),
        value: 'error',
      }]);
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

    const memberId = interaction.options.getString('member', true);

    if (memberId === 'error') {
      await replyWithEpicEmbed(interaction, userId, {
        style: 'warning',
        title: await translateEpic(client, userId, 'promote.errors.noParty', 'warning'),
        description: await translateForUser(userId, 'promote.errors.autocompleteLoad', undefined, interaction.locale),
        author,
      });
      return;
    }

    const promoteResult = await callCore<PromoteResult>('party.promoteMember', {
      accountId: mainAccount.accountId,
      accessToken: mainAccount.accessToken,
      displayName: mainAccount.displayName,
      memberId,
    });

    if (!promoteResult.ok) {
      if (promoteResult.reason === 'notLeader') {
        await replyWithEpicEmbed(interaction, userId, {
          style: 'warning',
          title: await translateEpic(client, userId, 'promote.errors.notLeader', 'warning'),
          description: await translateForUser(userId, 'promote.errors.notLeaderDesc', undefined, interaction.locale),
          author,
        });
        return;
      }

      await replyWithEpicEmbed(interaction, userId, {
        style: 'warning',
        title: await translateEpic(client, userId, 'promote.errors.memberNotFound', 'warning'),
        description: await translateForUser(userId, 'promote.errors.memberNotFoundDesc', {
          memberName: memberId,
        }, interaction.locale),
        author,
      });
      return;
    }

    const memberDisplayName = promoteResult.memberDisplayName;

    await replyWithEpicEmbed(interaction, userId, {
      style: 'success',
      title: await translateEpic(client, userId, 'promote.success.title', 'success'),
      description: await translateForUser(userId, 'promote.success.description', {
        memberName: memberDisplayName,
      }, interaction.locale),
      author,
    });

    log.epic.info({ userId, memberId, memberDisplayName }, 'Member promoted to leader');
  } catch (error: any) {
    log.epic.error({ error }, 'Error handling promote subcommand');

    if (error.message === 'Party not found') {
      await replyWithEpicEmbed(interaction, userId, {
        style: 'warning',
        title: await translateEpic(client, userId, 'promote.errors.noParty', 'warning'),
        description: await translateForUser(userId, 'promote.errors.noPartyDesc', undefined, interaction.locale),
      });
      return;
    }

    if (error.message === 'Party permission error') {
      await replyWithEpicEmbed(interaction, userId, {
        style: 'warning',
        title: await translateEpic(client, userId, 'promote.errors.notLeader', 'warning'),
        description: await translateForUser(userId, 'promote.errors.notLeaderDesc', undefined, interaction.locale),
      });
      return;
    }

    await replyEpicApiError(interaction, userId, error);
  }
}
