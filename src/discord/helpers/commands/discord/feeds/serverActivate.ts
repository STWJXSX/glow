import { ChatInputCommandInteraction } from 'discord.js';
import { log } from '#helpers/core/logger.ts';
import { createSuccessEmbed } from '#helpers/core/embedHelper.ts';
import { getEmoji } from '#helpers/core/emojis.ts';
import { translateForUser } from '#helpers/locales/index.ts';
import { generarEmbedError } from '#helpers/core/generarEmbedError.ts';
import { callCore } from '#api/glowCore.ts';
import type { ExtendedClient } from '#structures/types.ts';
import type { FeedType } from '#commands/bot/feeds.ts';

export async function handleServerActivate(interaction: ChatInputCommandInteraction): Promise<void> {
  const client = interaction.client as ExtendedClient;
  const channel = interaction.options.getChannel('channel') || interaction.channel;
  const feedType = interaction.options.getString('feed', true) as FeedType;
  const role = interaction.options.getRole('role');
  const userId = interaction.user.id;
  
  const successEmoji = getEmoji(client, 'success');
  const errorEmoji = getEmoji(client, 'error');
  
  if (!channel || !('guild' in channel)) {
    const embed = await generarEmbedError('custom', {
      descripcion: await translateForUser(userId, 'feeds.activate.errors.channelNotFound', { emoji: errorEmoji }),
      client,
      interaction
    });
    await interaction.editReply({ embeds: [embed] });
    return;
  }
  
  // Verificar permisos en el canal
  const permissions = channel.permissionsFor(client.user!);
  if (!permissions || !permissions.has(['SendMessages', 'EmbedLinks'])) {
    const embed = await generarEmbedError('custom', {
      descripcion: await translateForUser(userId, 'feeds.activate.errors.noPermissions', {
        emoji: errorEmoji,
        channel: channel.toString()
      }),
      client,
      interaction
    });
    await interaction.editReply({ embeds: [embed] });
    return;
  }
  
  try {
    const result = await callCore<{ status: 'ok' | 'already' }>('feeds.server.activate', {
      guildId: interaction.guildId!,
      channelId: channel.id,
      feedType,
      userId,
      roleId: role?.id,
    });

    // Verificar si ya está activo
    if (result.status === 'already') {
      const feedTypeName = await translateForUser(userId, `feeds.types.${feedType}`);
      const embed = await generarEmbedError('custom', {
        descripcion: await translateForUser(userId, 'feeds.activate.errors.alreadyActive', {
          emoji: errorEmoji,
          feedType: feedTypeName,
          channel: channel.toString()
        }),
        client,
        interaction
      });
      await interaction.editReply({ embeds: [embed] });
      return;
    }
    
    // Respuesta de éxito
    const feedTypeName = await translateForUser(userId, `feeds.types.${feedType}`);
    const title = await translateForUser(userId, 'feeds.activate.success.title', { emoji: successEmoji });
    const description = await translateForUser(userId, 'feeds.activate.success.description', {
      feedType: feedTypeName,
      channel: channel.toString()
    });
    
    const embed = await createSuccessEmbed({
      title,
      description,
      footer: 'user',
      interaction
    });
    
    const activatedByLabel = await translateForUser(userId, 'feeds.activate.success.fields.activatedBy');
    const activatedAtLabel = await translateForUser(userId, 'feeds.activate.success.fields.activatedAt');
    
    embed.addFields(
      { name: activatedByLabel, value: interaction.user.toString(), inline: true },
      { name: activatedAtLabel, value: `<t:${Math.floor(Date.now() / 1000)}:F>`, inline: true }
    );
    
    if (role) {
      embed.addFields({ name: '@', value: role.toString(), inline: true });
    }
    
    await interaction.editReply({ embeds: [embed] });
    
  } catch (error) {
    log.epic.error({ error }, 'Error activando feed del servidor');
    const embed = await generarEmbedError('custom', {
      descripcion: await translateForUser(userId, 'feeds.common.errors.databaseError', { emoji: errorEmoji }),
      client,
      interaction
    });
    await interaction.editReply({ embeds: [embed] });
  }
}
