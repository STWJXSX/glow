import { ChatInputCommandInteraction, EmbedBuilder } from 'discord.js';
import { buildGatewayEmbed } from './gatewayMessageHelper.ts';
import { getEmoji } from '../emojis.ts';
import type { ExtendedClient } from '#structures/types.ts';
import { log } from '../logger.ts';

/**
 * Envía la respuesta automática de "cargando" si el comando no usa nodefer
 * 
 * @param interaction - Interacción del comando
 * @param client - Cliente extendido de Discord
 * @param commandName - Nombre del comando (para logs)
 */
export async function sendDeferResponse(
  interaction: ChatInputCommandInteraction,
  client: ExtendedClient,
  commandName: string
): Promise<void> {
  if (interaction.deferred || interaction.replied) return;

  try {
    await interaction.deferReply();

    const loadingEmoji = getEmoji(client, 'loading');
    const loadingEmbed = new EmbedBuilder()
      .setColor(0xffc87c)
      .setDescription(`${loadingEmoji}`);

    // Not awaited: the command starts right away. Edits to the same reply are queued in
    // order by discord.js, so this can't overwrite the command's real answer.
    void interaction.editReply({ content: null, embeds: [loadingEmbed], components: [] }).catch(() => {});
  } catch (err) {
    log.commands.warn(
      { command: commandName, err },
      'Error sending loading response',
    );
  }
}

/**
 * Envía una respuesta diferida ephemeral (solo visible para el ejecutor)
 *
 * @param interaction - Interacción del comando
 * @param commandName - Nombre del comando (para logs)
 */
export async function sendDeferEphemeralResponse(
  interaction: ChatInputCommandInteraction,
  commandName: string,
  client?: ExtendedClient,
): Promise<void> {
  try {
    await interaction.deferReply({ ephemeral: true });

    if (client) {
      const loadingEmoji = getEmoji(client, 'loading');
      const loadingEmbed = new EmbedBuilder()
        .setColor(0xffc87c)
        .setDescription(`${loadingEmoji}`);

      void interaction.editReply({ content: null, embeds: [loadingEmbed], components: [] }).catch(() => {});
    }
  } catch (err) {
    log.commands.warn(
      { command: commandName, err },
      'Error sending ephemeral defer',
    );
  }
}

/**
 * Maneja el error de ejecución de un comando y responde al usuario
 *
 * @param interaction - Interacción del comando
 * @param client - Cliente extendido de Discord
 * @param commandName - Nombre del comando
 * @param error - Error que ocurrió
 */
export async function handleCommandError(
  interaction: ChatInputCommandInteraction,
  client: ExtendedClient,
  commandName: string,
  error: any
): Promise<void> {
  const userId = interaction.user.id;
  
  log.commands.error({ command: commandName, err: error }, 'Error ejecutando comando');
  
  const errorEmbed = await buildGatewayEmbed(client, userId, interaction.locale, 'error', {
    emojiKey: 'importante',
    titleKey: 'gateway.errorTitle',
    bodyKey: 'errors.command_error',
    solutionKey: 'gateway.commandError.solution',
  });

  try {
    if (interaction.deferred || interaction.replied) {
      await interaction.editReply({
        content: null,
        embeds: [errorEmbed],
        components: [],
        files: [],
      });
    } else {
      await interaction.reply({ embeds: [errorEmbed], ephemeral: true });
    }
  } catch {
    // Ignorar errores al reportar el error
  }
}
