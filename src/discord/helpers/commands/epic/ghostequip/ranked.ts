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

export const RANK_TIER_INDICES = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18] as const;

/** @deprecated Use ghostequip.ranked.tiers.* i18n keys instead */
export const RANK_TIERS: { label: string; labelEs: string; tierIndex: number }[] = RANK_TIER_INDICES.map((tierIndex) => ({
  tierIndex,
  label: String(tierIndex),
  labelEs: String(tierIndex),
}));

export async function handleRanked(interaction: ChatInputCommandInteraction): Promise<void> {
  const userId = interaction.user.id;
  const client = interaction.client;

  try {
    const tierIndex = parseInt(interaction.options.getString('rango', true), 10);

    if (Number.isNaN(tierIndex) || tierIndex < 0 || tierIndex > 18) {
      await replyWithEpicEmbed(interaction, userId, {
        style: 'warning',
        description: await translateForUser(userId, 'ghostequip.ranked.errors.invalidRank', undefined, interaction.locale),
      });
      return;
    }

    const rankName = await translateForUser(
      userId,
      `ghostequip.ranked.tiers.${tierIndex}`,
      undefined,
      interaction.locale,
    );

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

    await callCore('ghostequip.ranked', {
      userId,
      accountId: mainAccount.accountId,
      accessToken: mainAccount.accessToken,
      displayName: mainAccount.displayName,
      tierIndex,
      progression: 0,
    });

    const author = await getEpicAuthor(userId);
    const payload = await buildEpicReplyPayload(userId, {
      style: 'success',
      title: await translateForUser(userId, 'ghostequip.ranked.success.title', undefined, interaction.locale),
      description: await ghostequipSuccessDescription(userId, 'ghostequip.ranked.success.description', { rankName }, interaction.locale),
      author,
    }, interaction);

    await interaction.editReply(payload);
  } catch (error: any) {
    log.epic.error('[GHOST EQUIP RANKED] Error:', error);

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
