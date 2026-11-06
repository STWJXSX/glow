/**
 * CloudGaming Subcommand Handler
 * Arregla el grupo bugueado por invitaciones (unbug party)
 */

import { ChatInputCommandInteraction } from 'discord.js';
import { log } from '#helpers/core/logger.ts';
import { translateForUser } from '#helpers/locales/index.ts';
import { getEmoji } from '#helpers/core/emojis.ts';
import UsuarioInfo from '#models/UsuarioInfo.ts';
import { callCore } from '#api/glowCore.ts';
import type { PrivacyToggleResult } from './types.ts';
import {
  buildEpicReplyPayload,
  getEpicAuthor,
  replyEpicApiError,
  replyEpicCredentialError,
  replyWithEpicEmbed,
  translateEpic,
} from '../epicEmbedHelper.ts';

export async function handleCloudGamingSubcommand(interaction: ChatInputCommandInteraction): Promise<void> {
  const userId = interaction.user.id;
  const client = interaction.client;

  try {
    const user = await UsuarioInfo.findOne({ id: userId });
    if (!user) {
      await replyEpicCredentialError(interaction, userId, 'noCuenta');
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

    const toggleResult = await callCore<PrivacyToggleResult>('party.privacy.toggle', {
      accountId: mainAccount.accountId,
      accessToken: mainAccount.accessToken,
      displayName: mainAccount.displayName,
    });

    if (!toggleResult.ok) {
      if (toggleResult.reason === 'noParty') {
        throw new Error('Party not found');
      }

      await replyWithEpicEmbed(interaction, userId, {
        style: 'warning',
        title: await translateEpic(client, userId, 'togglePrivacy.errors.notLeader', 'warning'),
        description: await translateForUser(userId, 'togglePrivacy.errors.notLeaderDesc', undefined, interaction.locale),
        author,
      });
      return;
    }

    const currentPrivacy = toggleResult.wasPrivate;
    const newPrivacyType = currentPrivacy ? 'Public' : 'Private';
    const privacyEmoji = currentPrivacy ? getEmoji(client, 'active') : getEmoji(client, 'inactive');

    const newPrivacySettings = {
      partyType: newPrivacyType,
      inviteRestriction: currentPrivacy ? 'Anyone' : 'Leader',
      onlyLeaderFriendsCanJoin: !currentPrivacy,
    };

    const privacyText = currentPrivacy
      ? await translateForUser(userId, 'togglePrivacy.privacy.public', undefined, interaction.locale)
      : await translateForUser(userId, 'togglePrivacy.privacy.private', undefined, interaction.locale);

    const currentSettingsLabel = await translateForUser(userId, 'togglePrivacy.fields.currentSettings', undefined, interaction.locale);
    const yesText = await translateForUser(userId, 'togglePrivacy.fields.yes', undefined, interaction.locale);
    const noText = await translateForUser(userId, 'togglePrivacy.fields.no', undefined, interaction.locale);

    const settingsValue = await translateForUser(userId, 'togglePrivacy.fields.settingsValue', {
      partyType: newPrivacyType,
      invitePermission: newPrivacySettings.inviteRestriction,
      acceptingMembers: !currentPrivacy ? yesText : noText,
    }, interaction.locale);

    const payload = await buildEpicReplyPayload(userId, {
      style: 'success',
      title: await translateEpic(client, userId, 'togglePrivacy.success.title', 'success'),
      description: await translateForUser(userId, 'togglePrivacy.success.description', {
        privacyType: privacyText,
        emoji: privacyEmoji,
      }, interaction.locale),
      fields: [{ name: currentSettingsLabel, value: settingsValue, inline: false }],
      author,
      timestamp: true,
    }, interaction);

    await interaction.editReply(payload);

    log.epic.info({ userId, newPrivacyType }, 'CloudGaming: Party privacy toggled');

    setTimeout(async () => {
      try {
        const originalPrivacySettings = {
          partyType: currentPrivacy ? 'Private' : 'Public',
          inviteRestriction: currentPrivacy ? 'Leader' : 'Anyone',
          onlyLeaderFriendsCanJoin: currentPrivacy,
        };

        await callCore('party.privacy.set', {
          accountId: mainAccount.accountId,
          accessToken: mainAccount.accessToken,
          displayName: mainAccount.displayName,
          privacy: originalPrivacySettings,
        });

        const revertedText = currentPrivacy
          ? await translateForUser(userId, 'togglePrivacy.privacy.private', undefined, interaction.locale)
          : await translateForUser(userId, 'togglePrivacy.privacy.public', undefined, interaction.locale);
        const revertedEmoji = currentPrivacy ? getEmoji(client, 'inactive') : getEmoji(client, 'active');

        const revertedSettingsValue = await translateForUser(userId, 'togglePrivacy.fields.settingsValue', {
          partyType: currentPrivacy ? 'Private' : 'Public',
          invitePermission: originalPrivacySettings.inviteRestriction,
          acceptingMembers: currentPrivacy ? yesText : noText,
        }, interaction.locale);

        const revertedPayload = await buildEpicReplyPayload(userId, {
          style: 'success',
          title: await translateEpic(client, userId, 'togglePrivacy.success.reverted.title', 'success'),
          description: await translateForUser(userId, 'togglePrivacy.success.reverted.description', {
            privacyType: revertedText,
            emoji: revertedEmoji,
          }, interaction.locale),
          fields: [{ name: currentSettingsLabel, value: revertedSettingsValue, inline: false }],
          author,
          timestamp: true,
        }, interaction);

        await interaction.editReply(revertedPayload);
        log.epic.info({ userId }, 'CloudGaming: Party privacy reverted to original');
      } catch (revertError) {
        log.epic.error({ revertError }, 'CloudGaming: Error reverting party privacy');
      }
    }, 5000);
  } catch (error: any) {
    log.epic.error({ error }, 'Error handling cloudgaming subcommand');

    if (error.message === 'Party not found') {
      await replyWithEpicEmbed(interaction, userId, {
        style: 'warning',
        title: await translateEpic(client, userId, 'togglePrivacy.errors.noParty', 'warning'),
        description: await translateForUser(userId, 'togglePrivacy.errors.noPartyDesc', undefined, interaction.locale),
      });
      return;
    }

    if (error.message === 'Party permission error') {
      await replyWithEpicEmbed(interaction, userId, {
        style: 'warning',
        title: await translateEpic(client, userId, 'togglePrivacy.errors.notLeader', 'warning'),
        description: await translateForUser(userId, 'togglePrivacy.errors.notLeaderDesc', undefined, interaction.locale),
      });
      return;
    }

    await replyEpicApiError(interaction, userId, error);
  }
}
