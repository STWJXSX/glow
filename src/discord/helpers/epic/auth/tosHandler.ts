import { EmbedBuilder, ButtonBuilder, ButtonStyle, ActionRowBuilder, Colors } from 'discord.js';
import { log } from '#helpers/core/logger.ts';
import UsuarioInfo from '#models/UsuarioInfo.ts';
import { getTranslations } from '#helpers/locales/index.ts';
import { EmojiHelper } from '#helpers/core/emojis.ts';
import type { ChatInputCommandInteraction } from 'discord.js';

const TOS_URL = 'https://drive.google.com/file/d/1jGCV_duxccWJo9n9dCt_eGf0iJ-CtFgz/view?usp=sharing';

/**
 * Verifica si el usuario ha aceptado los TOS
 */
export async function checkTOSAccepted(discordId: string): Promise<boolean> {
  try {
    const user = await UsuarioInfo.findOne({ id: discordId });
    return user?.aceptarTOS === true;
  } catch (error) {
    log.epic.error({ error, discordId }, 'Error verificando TOS');
    return false;
  }
}

/**
 * Crea embed de términos de servicio
 */
export async function createTOSEmbed(
  interaction: ChatInputCommandInteraction
): Promise<EmbedBuilder> {
  const trans = await getTranslations(interaction);
  const emoji = new EmojiHelper(interaction.client);
  
  return new EmbedBuilder()
    .setColor(Colors.Yellow)
    .setTitle(trans.tosHandler?.embed1?.title?.toString() || 'Terms of Service')
    .setDescription(
      trans.tosHandler?.embed1?.description?.({ emoji: emoji.warning, tosUrl: TOS_URL }) ||
      `${emoji.warning} Please read and accept our Terms of Service before continuing.`
    )
    .setFooter({ 
      text: trans.tosHandler?.embed1?.footer?.toString() || 'Your data is protected'
    });
}

/**
 * Crea botones de TOS
 */
export async function createTOSButtons(
  interaction: ChatInputCommandInteraction
): Promise<ActionRowBuilder<ButtonBuilder>> {
  const trans = await getTranslations(interaction);
  const emoji = new EmojiHelper(interaction.client);
  
  const acceptButton = new ButtonBuilder()
    .setCustomId('tos_accept')
    .setLabel(trans.tosHandler?.embed1?.acceptButton?.toString() || 'Accept')
    .setStyle(ButtonStyle.Success)
    .setEmoji(emoji.success);

  const cancelButton = new ButtonBuilder()
    .setCustomId('tos_cancel')
    .setLabel(trans.tosHandler?.embed1?.cancelButton?.toString() || 'Cancel')
    .setStyle(ButtonStyle.Danger)
    .setEmoji(emoji.error);

  return new ActionRowBuilder<ButtonBuilder>().addComponents(acceptButton, cancelButton);
}

/**
 * Maneja la aceptación de TOS
 */
export async function handleTOSAcceptance(
  discordId: string
): Promise<{ success: boolean; user?: any; error?: string }> {
  try {
    log.epic.info({ discordId }, 'Procesando aceptación de TOS');
    
    // Buscar o crear usuario
    let user = await UsuarioInfo.findOne({ id: discordId });
    
    if (!user) {
      log.epic.info({ discordId }, 'Creando nuevo usuario');
      user = new UsuarioInfo({ 
        id: discordId, 
        aceptarTOS: false, 
        deviceAuths: [] 
      });
    }
    
    // Actualizar TOS
    user.aceptarTOS = true;
    await user.save();
    
    log.epic.info({ discordId }, 'Usuario aceptó TOS correctamente');
    return { success: true, user };
    
  } catch (error) {
    log.epic.error({ error, discordId }, 'Error guardando aceptación de TOS');
    return { 
      success: false, 
      error: error instanceof Error ? error.message : 'Unknown error'
    };
  }
}

/**
 * Crea embed de cancelación
 */
export async function createCancelEmbed(
  interaction: ChatInputCommandInteraction
): Promise<EmbedBuilder> {
  const trans = await getTranslations(interaction);
  const emoji = new EmojiHelper(interaction.client);
  
  return new EmbedBuilder()
    .setColor(Colors.Orange)
    .setTitle(
      trans.tosHandler?.responses?.cancelled?.title?.({ emoji: emoji.warning }) ||
      `${emoji.warning} Cancelled`
    )
    .setDescription(
      trans.tosHandler?.responses?.cancelled?.description?.toString() ||
      'You must accept the Terms of Service to use this command.'
    )
    .setFooter({ 
      text: trans.tosHandler?.responses?.cancelled?.footer?.toString() || 
      'Use /login again when ready'
    });
}

/**
 * Crea embed de timeout
 */
export async function createTimeoutEmbed(
  interaction: ChatInputCommandInteraction
): Promise<EmbedBuilder> {
  const trans = await getTranslations(interaction);
  const emoji = new EmojiHelper(interaction.client);
  
  return new EmbedBuilder()
    .setColor(Colors.Orange)
    .setTitle(
      trans.tosHandler?.responses?.timeout?.title?.({ emoji: emoji.error }) ||
      `${emoji.error} Timeout`
    )
    .setDescription(
      trans.tosHandler?.responses?.timeout?.description?.toString() ||
      'You took too long to respond. Please try again.'
    )
    .setFooter({ 
      text: trans.tosHandler?.responses?.timeout?.footer?.toString() ||
      'Use /login again to continue'
    });
}

export { TOS_URL };
