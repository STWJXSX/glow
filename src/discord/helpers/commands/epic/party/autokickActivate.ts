import { ChatInputCommandInteraction } from 'discord.js';
import { log } from '#helpers/core/logger.ts';
import { getEmoji } from '#helpers/core/emojis.ts';
import { translateForUser } from '#helpers/locales/index.ts';
import {
  buildEpicReplyPayload,
  getEpicAuthor,
  replyEpicCredentialError,
  replyEpicCustomError,
  translateEpic,
} from '../epicEmbedHelper.ts';
import AutoKick, { resolveKickMode } from '#models/AutoKick.ts';
import UsuarioInfo from '#models/UsuarioInfo.ts';
import { callCore } from '#api/glowCore.ts';

/**
 * Handler para activar AutoKick
 * Activa el sistema AutoKick para la cuenta principal del usuario
 * 
 * Configuraciones por defecto:
 * - collectRewards: true
 * - embedRewards: true
 * - autoLeave: true
 * - transferMaterials: false
 * - kickPartyMembers: false
 * - autoReinvite: false
 */
export async function handleAutokickActivate(
  interaction: ChatInputCommandInteraction
): Promise<void> {
  const client = interaction.client;
  const userId = interaction.user.id;

  await interaction.deferReply();

  try {
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

    // Buscar o crear entrada de AutoKick
    let autoKickEntry = await AutoKick.findOne({ discordId: userId });
    if (!autoKickEntry) {
      autoKickEntry = new AutoKick({ discordId: userId });
    }

    const accountData = autoKickEntry.accounts.get(mainAccount.accountId);

    // Verificar si ya está activo
    if (accountData && accountData.isActive === true) {
      const authorData = await getEpicAuthor(userId);
      const title = await translateForUser(
        userId,
        'party.autokick.activar.embed.alreadyActive.title',
        { emoji: emojiWarning }
      );
      const description = await translateForUser(
        userId,
        'party.autokick.activar.embed.alreadyActive.description',
        { displayName: mainAccount.displayName }
      );
      const fieldActivated = await translateForUser(
        userId,
        'party.autokick.activar.embed.fields.activated'
      );
      const fieldLastActivity = await translateForUser(
        userId,
        'party.autokick.activar.embed.fields.lastActivity'
      );
      const fieldCurrentState = await translateForUser(
        userId,
        'party.autokick.activar.embed.fields.currentState'
      );
      const fieldMonitoring = await translateForUser(
        userId,
        'party.autokick.activar.embed.fields.monitoring'
      );

      const payload = await buildEpicReplyPayload(userId, {
        style: 'info',
        title: await translateEpic(client, userId, 'party.autokick.activar.embed.alreadyActive.title', 'warning'),
        description: await translateForUser(userId, 'party.autokick.activar.embed.alreadyActive.description', {
          displayName: mainAccount.displayName,
        }),
        fields: [
          { name: fieldActivated, value: `> <t:${Math.floor(accountData.createdAt.getTime() / 1000)}:R>`, inline: true },
          { name: fieldLastActivity, value: `> <t:${Math.floor(accountData.lastActivity.getTime() / 1000)}:R>`, inline: true },
          { name: fieldCurrentState, value: `> ${fieldMonitoring}`, inline: false },
        ],
        author: authorData,
      }, interaction);

      await interaction.editReply(payload);
      return;
    }

    // Crear cuenta con configuraciones por defecto
    const updatedAccountData = {
      isActive: true,
      createdAt: accountData?.createdAt || new Date(),
      lastActivity: new Date(),
      displayName: accountData?.displayName || mainAccount.displayName,
      // Configuraciones existentes (preservar si existen)
      transferMaterials: accountData?.transferMaterials || false,
      kickPartyMembers: accountData?.kickPartyMembers || false,
      // Nuevas configuraciones por defecto
      collectRewards: accountData?.collectRewards !== undefined ? accountData.collectRewards : true,
      embedRewards: accountData?.embedRewards !== undefined ? accountData.embedRewards : true,
      autoLeave: resolveKickMode(accountData) !== 'never',
      kickMode: resolveKickMode(accountData),
      autoReinvite: accountData?.autoReinvite || false,
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

    if (verificationData?.isActive !== true) {
      log.epic.error({ userId }, 'Error: El valor no se guardó correctamente en la DB');
      await AutoKick.updateOne(
        { discordId: userId },
        {
          $set: {
            [`accounts.${mainAccount.accountId}.isActive`]: true,
            [`accounts.${mainAccount.accountId}.lastActivity`]: new Date(),
            [`accounts.${mainAccount.accountId}.collectRewards`]: true,
            [`accounts.${mainAccount.accountId}.embedRewards`]: true,
            [`accounts.${mainAccount.accountId}.autoLeave`]: updatedAccountData.autoLeave,
            [`accounts.${mainAccount.accountId}.kickMode`]: updatedAccountData.kickMode,
          },
        }
      );
    }

    // Responder al usuario
    try {
      const authorData = await getEpicAuthor(userId);

      // Mostrar configuraciones por defecto activadas
      const emoji53 = getEmoji(client, 'emoji_53');
      const defaultFeatures = [];
      if (updatedAccountData.collectRewards) {
        defaultFeatures.push(`${emoji53} Collect rewards`);
      }
      if (updatedAccountData.embedRewards) {
        defaultFeatures.push(`${emoji53} Rewards embed`);
      }
      if (updatedAccountData.kickMode !== 'never') {
        defaultFeatures.push(`${emoji53} Mission kick (${updatedAccountData.kickMode === 'always' ? 'always' : 'only without party mates'})`);
      }
      if (updatedAccountData.transferMaterials) {
        defaultFeatures.push(`${emoji53} Transfer materials`);
      }
      // "Expulsar Miembros" retirado
      // if (updatedAccountData.kickPartyMembers) {
      //   defaultFeatures.push(`${emoji53} Kick members`);
      // }
      if (updatedAccountData.autoReinvite) {
        defaultFeatures.push(`${emoji53} Auto-reinvite`);
      }

      const title = await translateForUser(userId, 'party.autokick.activar.embed.title');
      const description = await translateForUser(
        userId,
        'party.autokick.activar.embed.description',
        { emoji: emojiSuccess, displayName: mainAccount.displayName }
      );
      const fieldCurrentState = await translateForUser(
        userId,
        'party.autokick.activar.embed.fields.currentState'
      );
      const fieldConnected = await translateForUser(
        userId,
        'party.autokick.activar.embed.fields.connected'
      );
      const fieldActiveFeatures = await translateForUser(
        userId,
        'party.autokick.activar.embed.fields.activeFeatures'
      );
      const fieldNoFeatures = await translateForUser(
        userId,
        'party.autokick.activar.embed.fields.noFeatures'
      );
      const fieldCustomize = await translateForUser(
        userId,
        'party.autokick.activar.embed.fields.customize'
      );
      const fieldCustomizeText = await translateForUser(
        userId,
        'party.autokick.activar.embed.fields.customizeText'
      );

      const payload = await buildEpicReplyPayload(userId, {
        style: 'success',
        title: await translateForUser(userId, 'party.autokick.activar.embed.title'),
        description: await translateEpic(client, userId, 'party.autokick.activar.embed.description', 'success', {
          displayName: mainAccount.displayName,
        }),
        fields: [
          { name: fieldCurrentState, value: `> ${fieldConnected}`, inline: false },
          { name: fieldActiveFeatures, value: defaultFeatures.length > 0 ? defaultFeatures.join('\n') : `> ${fieldNoFeatures}`, inline: false },
          { name: fieldCustomize, value: `> ${fieldCustomizeText}`, inline: false },
        ],
        author: authorData,
      }, interaction);

      await interaction.editReply(payload);
    } catch (replyError) {
      log.epic.error({ userId, error: replyError }, 'Error enviando respuesta de AutoKick activar');

      try {
        await interaction.editReply({
          content: `AutoKick activado para tu cuenta **${mainAccount.displayName}**. Usa \`/autokick configure\` para personalizar las características.`,
        });
      } catch (fallbackError) {
        log.epic.error({ userId, error: fallbackError }, 'Error en respuesta de fallback');
      }
    }

    // Reconectar XMPP de AutoKick
    try {
      await callCore('automation.autoKick.reconnect', userId, mainAccount.accountId);
      log.epic.info({ userId, accountId: mainAccount.accountId }, 'AutoKick XMPP reconectado');
    } catch (error) {
      log.epic.warn({ error }, 'Error reconectando AutoKick XMPP');
    }
  } catch (error) {
    log.epic.error({ userId, error }, 'Error activando AutoKick');

    try {
      await replyEpicCustomError(interaction, userId, 'epic.errors.unexpected');
    } catch (errorReplyError) {
      log.epic.error({ error: errorReplyError }, 'Error enviando respuesta de error');
    }
  }
}
