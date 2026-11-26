import { ChatInputCommandInteraction } from 'discord.js';
import { log } from '#helpers/core/logger.ts';
import { getEmoji } from '#helpers/core/emojis.ts';
import { translateForUser } from '#helpers/locales/index.ts';
import {
  buildEpicReplyPayload,
  getEpicAuthor,
  replyEpicCredentialError,
  replyEpicCustomError,
  replyWithEpicEmbed,
  translateEpic,
} from '../epicEmbedHelper.ts';
import AutoKick, { resolveKickMode } from '#models/AutoKick.ts';
import UsuarioInfo from '#models/UsuarioInfo.ts';
import { callCore } from '#api/glowCore.ts';

/**
 * Handler para desactivar AutoKick
 * Desactiva el sistema AutoKick para la cuenta principal del usuario
 * IMPORTANTE: Todas las configuraciones se preservan para cuando reactive
 */
export async function handleAutokickDeactivate(
  interaction: ChatInputCommandInteraction
): Promise<void> {
  const client = interaction.client;
  const userId = interaction.user.id;

  try {
    await interaction.deferReply();

    // Obtener emojis
    const emojiSuccess = getEmoji(client, 'success');
    const emojiError = getEmoji(client, 'error');
    const emojiWarning = getEmoji(client, 'warning');

    // Verificar que el usuario tiene cuenta principal
    const user = await UsuarioInfo.findOne({ id: userId });
    if (!user || !user.deviceAuths || user.deviceAuths.length === 0) {
      await replyEpicCredentialError(interaction, userId, 'noCuenta');
      return;
    }

    const mainAccount = user.deviceAuths.find((acc) => acc.cuentaMain);
    if (!mainAccount) {
      await replyEpicCredentialError(interaction, userId, 'noMain');
      return;
    }

    const autoKickEntry = await AutoKick.findOne({ discordId: userId });
    const accountData = autoKickEntry?.accounts?.get(mainAccount.accountId);

    // Verificar si existe y está activo
    if (!autoKickEntry || !accountData || accountData.isActive !== true) {
      const authorData = await getEpicAuthor(userId);
      const title = await translateForUser(
        userId,
        'party.autokick.desactivar.embed.notActive.title',
        { emoji: emojiWarning }
      );
      const description = await translateForUser(
        userId,
        'party.autokick.desactivar.embed.notActive.description',
        { displayName: mainAccount.displayName }
      );
      const fieldToActivate = await translateForUser(
        userId,
        'party.autokick.desactivar.embed.fields.toActivate'
      );
      const fieldToActivateText = await translateForUser(
        userId,
        'party.autokick.desactivar.embed.fields.toActivateText'
      );

      const payload = await buildEpicReplyPayload(userId, {
        style: 'info',
        title: await translateEpic(client, userId, 'party.autokick.desactivar.embed.notActive.title', 'warning'),
        description: await translateForUser(userId, 'party.autokick.desactivar.embed.notActive.description', {
          displayName: mainAccount.displayName,
        }),
        fields: [{ name: fieldToActivate, value: fieldToActivateText, inline: false }],
        author: authorData,
      }, interaction);

      await interaction.editReply(payload);
      return;
    }

    // Preservar todas las configuraciones, solo cambiar isActive
    const updatedAccountData = {
      isActive: false, // SOLO ESTO CAMBIA
      createdAt: accountData.createdAt || new Date(),
      lastActivity: new Date(),
      displayName: accountData.displayName || mainAccount.displayName,
      // Preservar configuraciones existentes
      transferMaterials: accountData.transferMaterials || false,
      kickPartyMembers: accountData.kickPartyMembers || false,
      collectRewards: accountData.collectRewards !== undefined ? accountData.collectRewards : true,
      embedRewards: accountData.embedRewards !== undefined ? accountData.embedRewards : true,
      autoLeave: resolveKickMode(accountData) !== 'never',
      kickMode: resolveKickMode(accountData),
      autoReinvite: accountData.autoReinvite || false,
    };

    // Limpiar y recrear el Map completamente
    autoKickEntry.accounts.delete(mainAccount.accountId);
    autoKickEntry.accounts.set(mainAccount.accountId, updatedAccountData);

    // Forzar que MongoDB detecte el cambio en el Map
    autoKickEntry.markModified('accounts');

    await autoKickEntry.save();

    // Verificación adicional
    const verificationEntry = await AutoKick.findOne({ discordId: userId });
    const verificationData = verificationEntry?.accounts?.get(mainAccount.accountId);

    if (verificationData?.isActive !== false) {
      log.epic.error({ userId }, 'Error: El valor no se guardó correctamente en la DB');
      await AutoKick.updateOne(
        { discordId: userId },
        {
          $set: {
            [`accounts.${mainAccount.accountId}.isActive`]: false,
            [`accounts.${mainAccount.accountId}.lastActivity`]: new Date(),
          },
        }
      );
    }

    // Responder al usuario
    try {
      const authorData = await getEpicAuthor(userId);

      // Mostrar configuraciones preservadas
      const emoji53 = getEmoji(client, 'emoji_53');
      const preservedFeatures = [];
      if (updatedAccountData.collectRewards) {
        preservedFeatures.push(`${emoji53} Collect rewards`);
      }
      if (updatedAccountData.embedRewards) {
        preservedFeatures.push(`${emoji53} Rewards embed`);
      }
      if (updatedAccountData.kickMode !== 'never') {
        preservedFeatures.push(`${emoji53} Mission kick (${updatedAccountData.kickMode === 'always' ? 'always' : 'only without party mates'})`);
      }
      if (updatedAccountData.transferMaterials) {
        preservedFeatures.push(`${emoji53} Transfer materials`);
      }
      // "Expulsar Miembros" retirado
      // if (updatedAccountData.kickPartyMembers) {
      //   preservedFeatures.push(`${emoji53} Kick members`);
      // }
      if (updatedAccountData.autoReinvite) {
        preservedFeatures.push(`${emoji53} Auto-reinvite`);
      }

      const title = await translateForUser(userId, 'party.autokick.desactivar.embed.title');
      const description = await translateForUser(
        userId,
        'party.autokick.desactivar.embed.description',
        { emoji: emojiSuccess, displayName: mainAccount.displayName }
      );
      const fieldActiveFrom = await translateForUser(
        userId,
        'party.autokick.desactivar.embed.fields.activeFrom'
      );
      const fieldLastActivity = await translateForUser(
        userId,
        'party.autokick.desactivar.embed.fields.lastActivity'
      );
      const fieldCurrentState = await translateForUser(
        userId,
        'party.autokick.desactivar.embed.fields.currentState'
      );
      const fieldDisconnected = await translateForUser(
        userId,
        'party.autokick.desactivar.embed.fields.disconnected'
      );
      const fieldPreservedSettings = await translateForUser(
        userId,
        'party.autokick.desactivar.embed.fields.preservedSettings'
      );
      const fieldNoSettings = await translateForUser(
        userId,
        'party.autokick.desactivar.embed.fields.noSettings'
      );
      const fieldNote = await translateForUser(userId, 'party.autokick.desactivar.embed.fields.note');
      const fieldNoteText = await translateForUser(
        userId,
        'party.autokick.desactivar.embed.fields.noteText'
      );

      const payload = await buildEpicReplyPayload(userId, {
        style: 'success',
        title: await translateForUser(userId, 'party.autokick.desactivar.embed.title'),
        description: await translateEpic(client, userId, 'party.autokick.desactivar.embed.description', 'success', {
          displayName: mainAccount.displayName,
        }),
        fields: [
          { name: fieldActiveFrom, value: `> <t:${Math.floor(accountData.createdAt.getTime() / 1000)}:R>`, inline: true },
          { name: fieldLastActivity, value: `> <t:${Math.floor(accountData.lastActivity.getTime() / 1000)}:R>`, inline: true },
          { name: fieldCurrentState, value: `> ${fieldDisconnected}`, inline: false },
          { name: fieldPreservedSettings, value: preservedFeatures.length > 0 ? preservedFeatures.join('\n') : `> ${fieldNoSettings}`, inline: false },
          { name: fieldNote, value: `> ${fieldNoteText}`, inline: false },
        ],
        author: authorData,
      }, interaction);

      await interaction.editReply(payload);
    } catch (replyError) {
      log.epic.error(
        { userId, error: replyError },
        'Error enviando respuesta de AutoKick desactivar'
      );

      try {
        await interaction.editReply({
          content: `AutoKick desactivado para tu cuenta **${mainAccount.displayName}**. Tus configuraciones se mantienen para cuando reactives.`,
        });
      } catch (fallbackError) {
        log.epic.error({ userId, error: fallbackError }, 'Error en respuesta de fallback');
      }
    }

    // Desconectar XMPP de AutoKick
    try {
      await callCore('automation.autoKick.disconnect', userId, mainAccount.accountId);
      log.epic.info({ userId, accountId: mainAccount.accountId }, 'AutoKick XMPP desconectado');
    } catch (error) {
      log.epic.warn({ error }, 'Error desconectando AutoKick XMPP');
    }
  } catch (error) {
    log.epic.error({ userId, error }, 'Error desactivando AutoKick');

    try {
      await replyEpicCustomError(interaction, userId, 'epic.errors.unexpected');
    } catch (errorReplyError) {
      log.epic.error({ error: errorReplyError }, 'Error enviando respuesta de error');
    }
  }
}
