/**
 * DISABLED — subcommand commented out in ghostequip.ts (Aug 2026).
 * Platform icon comes from the live connection (urn:epic:conn:platform_s), not party PlatformData_j.
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

export const PLATFORM_CHOICES = [
  { value: 'WIN' },
  { value: 'PSN' },
  { value: 'XBL' },
  { value: 'SWT' },
  { value: 'AND' },
  { value: 'IOS' },
] as const;

export async function handlePlatform(interaction: ChatInputCommandInteraction): Promise<void> {
  const userId = interaction.user.id;
  const client = interaction.client;

  try {
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

    const platform = interaction.options.getString('plataforma', true);
    const platformLabel = await translateForUser(
      userId,
      `status.platforms.${platform}`,
      undefined,
      interaction.locale,
    );

    await callCore('ghostequip.platform', {
      userId,
      accountId: mainAccount.accountId,
      accessToken: mainAccount.accessToken,
      displayName: mainAccount.displayName,
      platform,
    });

    const author = await getEpicAuthor(userId);
    const payload = await buildEpicReplyPayload(userId, {
      style: 'success',
      title: await translateForUser(userId, 'ghostequip.platform.success.title', undefined, interaction.locale),
      description: await ghostequipSuccessDescription(
        userId,
        'ghostequip.platform.success.description',
        { platform: platformLabel },
        interaction.locale,
      ),
      author,
    }, interaction);

    await interaction.editReply(payload);
  } catch (error: any) {
    log.epic.error({ error, userId }, '[GHOST EQUIP PLATFORM] Error');

    if (error.message === 'noCuenta' || error.message === 'noMain') {
      await replyEpicCredentialError(interaction, userId, error.message);
      return;
    }

    if (error.message === 'Party not found') {
      await replyWithEpicEmbed(interaction, userId, {
        style: 'warning',
        title: await translateEpic(client, userId, 'ghostequip.common.errors.partyNotFound.title', 'warning'),
        description: await translateForUser(
          userId,
          'ghostequip.common.errors.partyNotFound.descriptionAccount',
          { displayName: '?' },
          interaction.locale,
        ),
        fields: [{
          name: epicSection(await translateForUser(userId, 'ghostequip.common.errors.suggestion.title', undefined, interaction.locale)),
          value: await translateForUser(userId, 'ghostequip.common.errors.suggestion.activeParty', undefined, interaction.locale),
          inline: false,
        }],
      });
      return;
    }

    await replyEpicApiError(interaction, userId, error);
  }
}
