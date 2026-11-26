import { ChatInputCommandInteraction, AutocompleteInteraction } from 'discord.js';
import { log } from '#helpers/core/logger.ts';
import { createSuccessEmbed } from '#helpers/core/embedHelper.ts';
import { getEmoji } from '#helpers/core/emojis.ts';
import { translateForUser } from '#helpers/locales/index.ts';
import { generarEmbedError } from '#helpers/core/generarEmbedError.ts';
import { callCore } from '#api/glowCore.ts';
import type { ExtendedClient } from '#structures/types.ts';

/**
 * Autocomplete para feeds DM activos
 */
export async function handleDMDeactivateAutocomplete(interaction: AutocompleteInteraction): Promise<void> {
  try {
    const userId = interaction.user.id;
    
    // Obtener feeds DM activos del usuario
    const { feeds } = await callCore<{ feeds: Array<{ type: string }> }>('feeds.dm.autocomplete', {
      userId,
    });
    
    if (!feeds.length) {
      await interaction.respond([{
        name: 'No tienes feeds activos',
        value: 'no_feeds'
      }]);
      return;
    }
    
    const choices = await Promise.all(
      feeds.map(async (feed) => {
        const feedName = await translateForUser(userId, `feeds.types.${feed.type}`);
        return {
          name: feedName,
          value: feed.type
        };
      })
    );
    
    await interaction.respond(choices);
    
  } catch (error) {
    log.epic.error({ error }, 'Error en autocomplete de DM deactivate');
    await interaction.respond([{
      name: 'Error cargando feeds',
      value: 'error'
    }]).catch(() => {});
  }
}

/**
 * Handler para desactivar feed DM
 */
export async function handleDMDeactivate(interaction: ChatInputCommandInteraction): Promise<void> {
  const client = interaction.client as ExtendedClient;
  const feedType = interaction.options.getString('feed', true);
  const userId = interaction.user.id;
  
  const successEmoji = getEmoji(client, 'success');
  const errorEmoji = getEmoji(client, 'error');
  
  // Verificar valores especiales
  if (feedType === 'no_feeds' || feedType === 'error') {
    const embed = await generarEmbedError('custom', {
      descripcion: await translateForUser(userId, 'feeds.deactivate.errors.noActiveFeeds', { emoji: errorEmoji }),
      client,
      interaction
    });
    await interaction.editReply({ embeds: [embed] });
    return;
  }
  
  try {
    const result = await callCore<{ status: 'ok' | 'notFound' }>('feeds.dm.deactivate', {
      userId,
      feedType,
    });
    
    if (result.status === 'notFound') {
      const embed = await generarEmbedError('custom', {
        descripcion: await translateForUser(userId, 'feeds.deactivate.errors.feedNotFound', { emoji: errorEmoji }),
        client,
        interaction
      });
      await interaction.editReply({ embeds: [embed] });
      return;
    }
    
    // Respuesta de éxito
    const feedTypeName = await translateForUser(userId, `feeds.types.${feedType}`);
    const channel = await translateForUser(userId, 'feeds.channels.directMessagesLong');
    
    const title = await translateForUser(userId, 'feeds.deactivate.success.title', { emoji: successEmoji });
    const description = await translateForUser(userId, 'feeds.deactivate.success.description', {
      feedType: feedTypeName,
      channel
    });
    
    const embed = await createSuccessEmbed({
      title,
      description,
      footer: 'user',
      interaction
    });
    
    await interaction.editReply({ embeds: [embed] });
    
  } catch (error) {
    log.epic.error({ error }, 'Error desactivando feed DM');
    const embed = await generarEmbedError('custom', {
      descripcion: await translateForUser(userId, 'feeds.common.errors.databaseError', { emoji: errorEmoji }),
      client,
      interaction
    });
    await interaction.editReply({ embeds: [embed] });
  }
}
