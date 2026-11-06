/**
 * DISABLED — subcommand commented out in ghostequip.ts (Aug 2026).
 * Coronet counter is driven by the live Fortnite client, not party meta / campaign gameplay_stats.
 */
import { ChatInputCommandInteraction } from 'discord.js';
import { callCore } from '#api/glowCore.ts';
import { log } from '#helpers/core/logger.ts';
import UsuarioInfo from '#models/UsuarioInfo.ts';
import { translateForUser } from '#helpers/locales/index.ts';
import {
  buildEpicReplyPayload,
  epicSection,
  getEpicAuthor,
  replyEpicApiError,
  replyEpicCredentialError,
  replyWithEpicEmbed,
  translateEpic,
} from '../epicEmbedHelper.ts';
import { ghostequipSuccessDescription } from './embedText.ts';

export async function handleCrowns(interaction: ChatInputCommandInteraction): Promise<void> {
  const userId = interaction.user.id;
  const client = interaction.client;

  try {
    const crowns = parseInt(interaction.options.getString('cantidad', true), 10);

    if (Number.isNaN(crowns) || crowns < -2147483647 || crowns > 2147483647) {
      await replyWithEpicEmbed(interaction, userId, {
        style: 'warning',
        description: await translateForUser(userId, 'ghostequip.crowns.errors.invalidAmount', undefined, interaction.locale),
      });
      return;
    }

    const user = await UsuarioInfo.findOne({ id: userId });
    const mainAccount = user?.deviceAuths?.find((acc: any) => acc.cuentaMain);

    if (!user?.deviceAuths?.length) {
      await replyEpicCredentialError(interaction, userId, 'noCuenta');
      return;
    }
    if (!mainAccount) {
      await replyEpicCredentialError(interaction, userId, 'noMain');
      return;
    }

    try {
      await callCore('ghostequip.crowns', {
        userId,
        accountId: mainAccount.accountId,
        accessToken: mainAccount.accessToken,
        displayName: mainAccount.displayName,
        crowns,
      });
    } catch (mcpErr: any) {
      const code = mcpErr?.errorCode || mcpErr?.response?.data?.errorCode;
      if (
        code === 'errors.com.epicgames.modules.gamesubcatalog.purchase_not_allowed' ||
        code === 'errors.com.epicgames.fortnite.operation_forbidden'
      ) {
        await replyWithEpicEmbed(interaction, userId, {
          style: 'warning',
          description: await translateForUser(userId, 'modstats.errors.noAccess', undefined, interaction.locale),
        });
        return;
      }
      throw mcpErr;
    }

    const author = await getEpicAuthor(userId);
    const payload = await buildEpicReplyPayload(userId, {
      style: 'success',
      title: await translateForUser(userId, 'ghostequip.crowns.success.title', undefined, interaction.locale),
      description: await ghostequipSuccessDescription(userId, 'ghostequip.crowns.success.description', { crowns: String(crowns) }, interaction.locale),
      author,
    }, interaction);

    await interaction.editReply(payload);
  } catch (error: any) {
    log.epic.error('[GHOST EQUIP CROWNS] Error:', error);

    if (error.message === 'noCuenta' || error.message === 'noMain') {
      await replyEpicCredentialError(interaction, userId, error.message);
      return;
    }

    if (error.message === 'Party not found') {
      await replyWithEpicEmbed(interaction, userId, {
        style: 'warning',
        title: await translateEpic(client, userId, 'ghostequip.common.errors.partyNotFound.title', 'warning'),
        description: await translateForUser(userId, 'ghostequip.common.errors.partyNotFound.descriptionAccount', {
          displayName: '?',
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
