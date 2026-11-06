import { ChatInputCommandInteraction } from 'discord.js';
import { callCore } from '#api/glowCore.ts';
import { log } from '#helpers/core/logger.ts';
import UsuarioInfo from '#models/UsuarioInfo.ts';
import { translateForUser } from '#helpers/locales/index.ts';
import {
  epicSection,
  getEpicAuthor,
  replyEpicApiError,
  replyEpicCredentialError,
  replyWithEpicEmbed,
  translateEpic,
} from '../epicEmbedHelper.ts';
import { editFakeReply, fakeSuccessDescription } from './fakeReply.ts';

export async function handleLevel(interaction: ChatInputCommandInteraction): Promise<void> {
  const userId = interaction.user.id;
  const client = interaction.client;
  const user = await UsuarioInfo.findOne({ id: userId });
  const mainAccount = user?.deviceAuths?.find((acc: any) => acc.cuentaMain);

  try {
    if (!user?.deviceAuths?.length) {
      await replyEpicCredentialError(interaction, userId, 'noCuenta');
      return;
    }
    if (!mainAccount) {
      await replyEpicCredentialError(interaction, userId, 'noMain');
      return;
    }

    const author = await getEpicAuthor(userId);
    const level = parseInt(interaction.options.getString('nivel', true), 10);

    if (Number.isNaN(level) || level < -2147483647 || level > 2147483647) {
      await replyWithEpicEmbed(interaction, userId, {
        style: 'warning',
        description: await translateForUser(userId, 'ghostequip.level.errors.invalidLevel', undefined, interaction.locale),
        author,
      });
      return;
    }

    await callCore('fake.level', {
      userId,
      accountId: mainAccount.accountId,
      accessToken: mainAccount.accessToken,
      displayName: mainAccount.displayName,
      level,
    });

    await editFakeReply(interaction, userId, {
      style: 'success',
      title: await translateForUser(userId, 'ghostequip.level.success.title', undefined, interaction.locale),
      description: await fakeSuccessDescription(userId, 'ghostequip.level.success.description', { level: String(level) }, interaction.locale),
      author,
    });
  } catch (error: any) {
    log.epic.error('[GHOST EQUIP LEVEL] Error:', error);

    if (error.message === 'Party not found') {
      await replyWithEpicEmbed(interaction, userId, {
        style: 'warning',
        title: await translateEpic(client, userId, 'ghostequip.common.errors.partyNotFound.title', 'warning'),
        description: await translateForUser(userId, 'ghostequip.common.errors.partyNotFound.descriptionAccount', {
          displayName: mainAccount?.displayName || '?',
        }, interaction.locale),
        fields: [{
          name: epicSection(await translateForUser(userId, 'ghostequip.common.errors.suggestion.title', undefined, interaction.locale)),
          value: await translateForUser(userId, 'ghostequip.common.errors.suggestion.activeParty', undefined, interaction.locale),
          inline: false,
        }],
      });
      return;
    }

    if (error.message === 'Party permission error') {
      await replyWithEpicEmbed(interaction, userId, {
        style: 'warning',
        title: await translateEpic(client, userId, 'ghostequip.common.errors.noPermissions.title', 'warning'),
        description: await translateForUser(userId, 'ghostequip.common.errors.noPermissions.description', undefined, interaction.locale),
      });
      return;
    }

    await replyEpicApiError(interaction, userId, error);
  }
}
