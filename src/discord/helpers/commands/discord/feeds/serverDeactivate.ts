import { ChatInputCommandInteraction, AutocompleteInteraction } from 'discord.js';
import { log } from '#helpers/core/logger.ts';
import { createSuccessEmbed } from '#helpers/core/embedHelper.ts';
import { getEmoji } from '#helpers/core/emojis.ts';
import { translateForUser } from '#helpers/locales/index.ts';
import { generarEmbedError } from '#helpers/core/generarEmbedError.ts';
import { callCore } from '#api/glowCore.ts';
import type { ExtendedClient } from '#structures/types.ts';

/**
 * Autocomplete para feeds de servidor activos
 */
export async function handleServerDeactivateAutocomplete(interaction: AutocompleteInteraction): Promise<void> {
  try {
    if (!interaction.inGuild()) {
      await interaction.respond([]);
      return;
    }
    
    // Obtener feeds activos del servidor
    const { feeds } = await callCore<{ feeds: Array<{ type: string; channelId: string }> }>(
      'feeds.server.autocomplete',
      { guildId: interaction.guildId },
    );
    
    if (!feeds.length) {
      await interaction.respond([{
        name: 'No hay feeds activos',
        value: 'no_feeds'
      }]);
      return;
    }
    
    const userId = interaction.user.id;
    const choices: Array<{ name: string; value: string }> = [];
    
    for (const feed of feeds) {
      const channel = interaction.guild?.channels.cache.get(feed.channelId);
      const feedName = await translateForUser(userId, `feeds.types.${feed.type}`);
      const channelName = channel ? `#${channel.name}` : 'canal-eliminado';
      
      choices.push({
        name: `${feedName} en ${channelName}`,
        value: `${feed.type}_${feed.channelId}`
      });
    }
    
    await interaction.respond(choices.slice(0, 25));
    
  } catch (error) {
    log.epic.error({ error }, 'Error en autocomplete de server deactivate');
    await interaction.respond([{
      name: 'Error cargando feeds',
      value: 'error'
    }]).catch(() => {});
  }
}

/**
 * Handler para desactivar feed de servidor
 */
export async function handleServerDeactivate(interaction: ChatInputCommandInteraction): Promise<void> {
  const client = interaction.client as ExtendedClient;
  const feedValue = interaction.options.getString('feed', true);
  const userId = interaction.user.id;
  
  const successEmoji = getEmoji(client, 'success');
  const errorEmoji = getEmoji(client, 'error');
  
  // Verificar valores especiales
  if (feedValue === 'no_feeds' || feedValue === 'error') {
    const embed = await generarEmbedError('custom', {
      descripcion: await translateForUser(userId, 'feeds.deactivate.errors.noActiveFeeds', { emoji: errorEmoji }),
      client,
      interaction
    });
    await interaction.editReply({ embeds: [embed] });
    return;
  }
  
  // Parsear valor: "tipo_canalId"
  const [feedType, channelId] = feedValue.split('_');
  
  try {
    const result = await callCore<{ status: 'ok' | 'notFound' }>('feeds.server.deactivate', {
      guildId: interaction.guildId!,
      channelId,
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
    const channel = interaction.guild?.channels.cache.get(channelId);
    const channelMention = channel ? channel.toString() : '#canal-eliminado';
    const feedTypeName = await translateForUser(userId, `feeds.types.${feedType}`);
    
    const title = await translateForUser(userId, 'feeds.deactivate.success.title', { emoji: successEmoji });
    const description = await translateForUser(userId, 'feeds.deactivate.success.description', {
      feedType: feedTypeName,
      channel: channelMention
    });
    
    const embed = await createSuccessEmbed({
      title,
      description,
      footer: 'user',
      interaction
    });
    
    await interaction.editReply({ embeds: [embed] });
    
  } catch (error) {
    log.epic.error({ error }, 'Error desactivando feed del servidor');
    const embed = await generarEmbedError('custom', {
      descripcion: await translateForUser(userId, 'feeds.common.errors.databaseError', { emoji: errorEmoji }),
      client,
      interaction
    });
    await interaction.editReply({ embeds: [embed] });
  }
}
