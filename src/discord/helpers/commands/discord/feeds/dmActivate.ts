import { ChatInputCommandInteraction } from 'discord.js';
import { log } from '#helpers/core/logger.ts';
import { createSuccessEmbed } from '#helpers/core/embedHelper.ts';
import { getEmoji } from '#helpers/core/emojis.ts';
import { translateForUser } from '#helpers/locales/index.ts';
import { generarEmbedError } from '#helpers/core/generarEmbedError.ts';
import { callCore } from '#api/glowCore.ts';
import type { ExtendedClient } from '#structures/types.ts';
import type { FeedType } from '#commands/bot/feeds.ts';

export async function handleDMActivate(interaction: ChatInputCommandInteraction): Promise<void> {
  const client = interaction.client as ExtendedClient;
  const feedType = interaction.options.getString('feed', true) as FeedType;
  const userId = interaction.user.id;
  
  const successEmoji = getEmoji(client, 'success');
  const errorEmoji = getEmoji(client, 'error');
  
  try {
    const result = await callCore<{ status: 'ok' | 'already' }>('feeds.dm.activate', {
      userId,
      feedType,
    });
    
    // Verificar si ya está activo
    if (result.status === 'already') {
      const feedTypeName = await translateForUser(userId, `feeds.types.${feedType}`);
      const channel = await translateForUser(userId, 'feeds.channels.directMessages');
      
      const embed = await generarEmbedError('custom', {
        descripcion: await translateForUser(userId, 'feeds.activate.errors.alreadyActive', {
          emoji: errorEmoji,
          feedType: feedTypeName,
          channel
        }),
        client,
        interaction
      });
      
      await interaction.editReply({ embeds: [embed] });
      return;
    }
    
    // Intentar enviar DM de confirmación
    try {
      const feedTypeName = await translateForUser(userId, `feeds.types.${feedType}`);
      const dmNotification = await translateForUser(userId, 'feeds.dm.activate.success.dmNotification', {
        emoji: successEmoji,
        feedType: feedTypeName
      });
      
      const dmEmbed = await createSuccessEmbed({
        description: dmNotification,
        interaction
      });
      
      await interaction.user.send({ embeds: [dmEmbed] });
    } catch (dmError) {
      log.epic.info({ userId }, 'No se pudo enviar DM de confirmación');
    }
    
    // Respuesta de éxito
    const feedTypeName = await translateForUser(userId, `feeds.types.${feedType}`);
    const channel = await translateForUser(userId, 'feeds.channels.directMessagesLong');
    
    const title = await translateForUser(userId, 'feeds.activate.success.title', { emoji: successEmoji });
    const description = await translateForUser(userId, 'feeds.activate.success.description', {
      feedType: feedTypeName,
      channel
    });
    
    const embed = await createSuccessEmbed({
      title,
      description,
      footer: 'user',
      interaction
    });
    
    const activatedAtLabel = await translateForUser(userId, 'feeds.activate.success.fields.activatedAt');
    embed.addFields({
      name: activatedAtLabel,
      value: `<t:${Math.floor(Date.now() / 1000)}:F>`,
      inline: true
    });
    
    // Footer personalizado para DMs
    const dmFooter = await translateForUser(userId, 'feeds.dm.activate.footer');
    if (dmFooter !== 'feeds.dm.activate.footer') {
      embed.setFooter({
        text: dmFooter,
        iconURL: interaction.user.displayAvatarURL()
      });
    }
    
    await interaction.editReply({ embeds: [embed] });
    
  } catch (error) {
    log.epic.error({ error }, 'Error activando feed DM');
    const embed = await generarEmbedError('custom', {
      descripcion: await translateForUser(userId, 'feeds.common.errors.databaseError', { emoji: errorEmoji }),
      client,
      interaction
    });
    await interaction.editReply({ embeds: [embed] });
  }
}
