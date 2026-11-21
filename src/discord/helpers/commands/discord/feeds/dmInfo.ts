import { ChatInputCommandInteraction } from 'discord.js';
import { log } from '#helpers/core/logger.ts';
import { createSuccessEmbed, createInfoEmbed } from '#helpers/core/embedHelper.ts';
import { getEmoji } from '#helpers/core/emojis.ts';
import { translateForUser } from '#helpers/locales/index.ts';
import { generarEmbedError } from '#helpers/core/generarEmbedError.ts';
import { callCore } from '#api/glowCore.ts';
import type { ExtendedClient } from '#structures/types.ts';

interface DmFeed {
  type: string;
  activatedAt: string | null;
}

export async function handleDMInfo(interaction: ChatInputCommandInteraction): Promise<void> {
  const client = interaction.client as ExtendedClient;
  const userId = interaction.user.id;
  
  const successEmoji = getEmoji(client, 'success');
  const errorEmoji = getEmoji(client, 'error');
  
  try {
    // Obtener configuración de feeds DM
    const { feeds } = await callCore<{ feeds: DmFeed[] }>('feeds.dm.info', { userId });
    
    if (!feeds.length) {
      const title = await translateForUser(userId, 'feeds.info.embed.title', { emoji: successEmoji });
      const description = await translateForUser(userId, 'feeds.dm.info.embed.noFeeds');
      
      const embed = await createInfoEmbed({
        title,
        description,
        footer: 'user',
        interaction
      });
      
      await interaction.editReply({ embeds: [embed] });
      return;
    }
    
    // Construir lista de feeds
    let feedsList = '';
    
    for (const feed of feeds) {
      const feedTypeName = await translateForUser(userId, `feeds.types.${feed.type}`);
      const activatedDate = feed.activatedAt
        ? `<t:${Math.floor(new Date(feed.activatedAt).getTime() / 1000)}:F>`
        : '?';
      
      // Intentar usar formato de traducción para DMs si existe
      const feedFormat = await translateForUser(userId, 'feeds.dm.info.embed.feedFormat', {
        feedType: feedTypeName,
        date: activatedDate
      });
      
      // Si la clave no existe, usar formato alternativo
      if (feedFormat === 'feeds.dm.info.embed.feedFormat') {
        feedsList += `**${feedTypeName}** en DMs\n> Activado el: ${activatedDate}\n\n`;
      } else {
        feedsList += feedFormat + '\n\n';
      }
    }
    
    const title = await translateForUser(userId, 'feeds.info.embed.title', { emoji: successEmoji });
    const footer = await translateForUser(userId, 'feeds.info.embed.footer', { count: feeds.length.toString() });
    
    const embed = await createInfoEmbed({
      title,
      description: feedsList.trim(),
      footer: {
        text: footer,
        iconURL: interaction.user.displayAvatarURL()
      },
      interaction
    });
    
    await interaction.editReply({ embeds: [embed] });
    
  } catch (error) {
    log.epic.error({ error }, 'Error obteniendo info de feeds DM');
    const embed = await generarEmbedError('custom', {
      descripcion: await translateForUser(userId, 'feeds.common.errors.databaseError', { emoji: errorEmoji }),
      client,
      interaction
    });
    await interaction.editReply({ embeds: [embed] });
  }
}
