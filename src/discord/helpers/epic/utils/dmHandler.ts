/**
 * DM Handler - Envía mensajes directos a usuarios después de operaciones
 */

import { EmbedBuilder, Colors, User, type ChatInputCommandInteraction, type ButtonInteraction, type ModalSubmitInteraction } from 'discord.js';
import { log } from '#helpers/core/logger.ts';
import { getTranslations } from '#helpers/locales/index.ts';
import { EmojiHelper } from '#helpers/core/emojis.ts';

interface AccountData {
  displayName: string;
  accountId: string;
  deviceId: string;
  secret: string;
  accessToken?: string;
  expiresAt?: string;
  refreshToken?: string;
  refreshExpiresAt?: string;
  cuentaMain?: boolean;
}

/**
 * Envía DM de registro exitoso
 */
export async function sendRegistrationSuccessDM(
  user: User,
  accountData: AccountData,
  interaction: ChatInputCommandInteraction | ButtonInteraction | ModalSubmitInteraction
): Promise<{ success: boolean; error?: string }> {
  try {
    log.epic.info({ userId: user.id }, '[DM-HANDLER] Enviando DM de registro exitoso');
    
    const trans = await getTranslations(interaction);
    const emoji = new EmojiHelper(interaction.client);
    
    const embed = new EmbedBuilder()
      .setColor(Colors.Green)
      .setTitle(
        trans.dmHandler?.registration?.title?.({ emoji: emoji.success }) ||
        `${emoji.success} Registered!`
      )
      .setDescription(
        trans.dmHandler?.registration?.description?.toString() ||
        '### **Registered account information:**'
      )
      .addFields([
        {
          name: `**${accountData.displayName}**`,
          value: `[ID] \`${accountData.accountId}\``,
          inline: false
        },
        {
          name: trans.dmHandler?.registration?.credentials?.toString() || '__Credentials__',
          value: trans.dmHandler?.registration?.credentialInfo?.({
            deviceId: accountData.deviceId,
            secret: accountData.secret,
            timestamp: Math.floor(Date.now() / 1000)
          }) || `**Device ID:** \`${accountData.deviceId}\`\n**Secret:** ||\`${accountData.secret}\`||\n**Registered:** <t:${Math.floor(Date.now() / 1000)}:F>`,
          inline: false
        },
        {
          name: trans.dmHandler?.registration?.infoTitle?.({ emoji: emoji.warning }) ||
            `${emoji.warning} Information`,
          value: trans.dmHandler?.registration?.infoText?.toString() ||
            '> `1` **Never share this information** with anyone\n> `2` **Only you** should have access to this data\n> `3` **POP** stores this information securely\n> `4` **We don\'t send** your data to third parties',
          inline: false
        }
      ]);

    await user.send({ embeds: [embed] });
    log.epic.info({ userId: user.id }, '[DM-HANDLER] [OK] DM enviado exitosamente');
    
    return { success: true };
  } catch (error) {
    log.epic.error({ error, userId: user.id }, '[DM-HANDLER] [ERROR] Error enviando DM');
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    };
  }
}

/**
 * Envía DM de actualización de credenciales
 */
export async function sendCredentialUpdateDM(
  user: User,
  accountData: AccountData,
  interaction: ChatInputCommandInteraction | ButtonInteraction | ModalSubmitInteraction
): Promise<{ success: boolean; error?: string }> {
  try {
    log.epic.info({ userId: user.id }, '[DM-HANDLER] Enviando DM de actualización de credenciales');
    
    const trans = await getTranslations(interaction);
    const emoji = new EmojiHelper(interaction.client);
    
    const embed = new EmbedBuilder()
      .setColor(Colors.Yellow)
      .setTitle(
        trans.dmHandler?.update?.title?.({ emoji: emoji.warning }) ||
        `${emoji.warning} Credentials Updated`
      )
      .setDescription(
        trans.dmHandler?.update?.description?.toString() ||
        '**Your account credentials have been refreshed.**\n\n**Updated account:**'
      )
      .addFields([
        {
          name: `**${accountData.displayName}**`,
          value: `[ID] \`${accountData.accountId}\``,
          inline: false
        },
        {
          name: trans.dmHandler?.update?.updateInfo?.toString() || '__Update__',
          value: trans.dmHandler?.update?.updateDetails?.({
            timestamp: Math.floor(Date.now() / 1000)
          }) || `**Date:** <t:${Math.floor(Date.now() / 1000)}:F>\n**Reason:** Credential refresh, already in POP.`,
          inline: false
        }
      ]);

    await user.send({ embeds: [embed] });
    log.epic.info({ userId: user.id }, '[DM-HANDLER] [OK] DM de actualización enviado');
    
    return { success: true };
  } catch (error) {
    log.epic.error({ error, userId: user.id }, '[DM-HANDLER] [ERROR] Error enviando DM de actualización');
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    };
  }
}
