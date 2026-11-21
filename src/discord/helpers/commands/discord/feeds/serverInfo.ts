import { ChatInputCommandInteraction } from 'discord.js';
import { log } from '#helpers/core/logger.ts';
import { createSuccessEmbed, createInfoEmbed } from '#helpers/core/embedHelper.ts';
import { getEmoji } from '#helpers/core/emojis.ts';
import { translateForUser } from '#helpers/locales/index.ts';
import { generarEmbedError } from '#helpers/core/generarEmbedError.ts';
import { callCore } from '#api/glowCore.ts';
import type { ExtendedClient } from '#structures/types.ts';

interface ServerFeed {
  channelId: string;
  type: string;
  activatedBy: string | null;
  activatedAt: string | null;
  roleId: string | null;
}

export async function handleServerInfo(interaction: ChatInputCommandInteraction): Promise<void> {
  const client = interaction.client as ExtendedClient;
  const userId = interaction.user.id;
  
  const successEmoji = getEmoji(client, 'success');
  const errorEmoji = getEmoji(client, 'error');
  
  try {
    // Obtener todas las configuraciones del servidor
    const { feeds } = await callCore<{ feeds: ServerFeed[] }>('feeds.server.info', {
      guildId: interaction.guildId!,
    });
    
    if (!feeds.length) {
      const title = await translateForUser(userId, 'feeds.info.embed.title', { emoji: successEmoji });
      const description = await translateForUser(userId, 'feeds.info.embed.noFeeds');
      
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
    let totalFeeds = 0;
    
    for (const feed of feeds) {
      const channel = interaction.guild?.channels.cache.get(feed.channelId);
      const channelMention = channel ? channel.toString() : '#canal-eliminado';
      const feedTypeName = await translateForUser(userId, `feeds.types.${feed.type}`);
      const activatedUser = feed.activatedBy
        ? await client.users.fetch(feed.activatedBy).catch(() => null)
        : null;
      const userMention = activatedUser
        ? activatedUser.toString()
        : `<@${feed.activatedBy ?? 'unknown'}>`;
      const activatedDate = feed.activatedAt
        ? `<t:${Math.floor(new Date(feed.activatedAt).getTime() / 1000)}:F>`
        : '?';
      
      const feedFormat = await translateForUser(userId, 'feeds.info.embed.feedFormat', {
        feedType: feedTypeName,
        channel: channelMention,
        user: userMention,
        date: activatedDate
      });
      
      feedsList += feedFormat;
      
      // Añadir rol si existe
      if (feed.roleId) {
        feedsList += `\n**@:** <@&${feed.roleId}>`;
      }
      
      feedsList += '\n\n';
      totalFeeds++;
    }
    
    const title = await translateForUser(userId, 'feeds.info.embed.title', { emoji: successEmoji });
    const footer = await translateForUser(userId, 'feeds.info.embed.footer', { count: totalFeeds.toString() });
    
    const embed = await createInfoEmbed({
      title,
      description: feedsList.trim(),
      footer: {
        text: footer,
        iconURL: interaction.user.displayAvatarURL()
      },
      interaction
    });
    
    if (interaction.guild?.iconURL()) {
      embed.setThumbnail(interaction.guild.iconURL()!);
    }
    
    await interaction.editReply({ embeds: [embed] });
    
  } catch (error) {
    log.epic.error({ error }, 'Error obteniendo info de feeds del servidor');
    const embed = await generarEmbedError('custom', {
      descripcion: await translateForUser(userId, 'feeds.common.errors.databaseError', { emoji: errorEmoji }),
      client,
      interaction
    });
    await interaction.editReply({ embeds: [embed] });
  }
}
