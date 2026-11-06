/** Prefix kick (gk / gkc / gkca): runs the kick handlers on a text message instead of a slash interaction. */
import type { Message } from 'discord.js';
import { translateForUser } from '#helpers/locales/index.ts';
import { log } from '#helpers/core/logger.ts';
import { getEmoji } from '#helpers/core/emojis.ts';
import { handleKick } from './kick.ts';
import { handleKickCollect } from './kickCollect.ts';
import { handleKickCollectAll } from './kickCollectAll.ts';

function autoDelete(msg: Message, delay = 15000): void {
  setTimeout(() => { msg.delete().catch(() => {}); }, delay);
}

/**
 * Helper para ejecutar comandos kick con prefijo
 */
export async function runPrefixKick(message: Message, type: 'normal' | 'collect' | 'collectall') {
  const mockInteraction = {
    user: message.author,
    member: message.member,
    guild: message.guild,
    channel: message.channel,
    client: message.client,
    id: message.id,
    channelId: message.channelId,
    guildId: message.guildId,
    
    replied: false,
    deferred: false,
    
    reply: async (options: any) => {
      return await message.reply({
        ...options,
        allowedMentions: { repliedUser: false }
      });
    },
    
    editReply: async (options: any) => {
      return await message.reply({
        ...options,
        allowedMentions: { repliedUser: false }
      });
    },
    
    deferReply: async () => {
      const processingEmoji = getEmoji(message.client, 'loading') || '⏳';
      return await message.reply({
        content: `${processingEmoji} Procesando...`,
        allowedMentions: { repliedUser: false }
      });
    },
    
    options: {
      getBoolean: (name: string) => {
        if (name === 'force' && type === 'normal') return true;
        return false;
      },
      getSubcommand: () => null
    }
  } as any;
  
  try {
    if (type === 'normal') {
      await handleKick(mockInteraction);
    } else if (type === 'collect') {
      await handleKickCollect(mockInteraction);
    } else if (type === 'collectall') {
      await handleKickCollectAll(mockInteraction);
    }
  } catch (error) {
    log.commands.error({ error, type }, 'Error en comando kick con prefijo');
    
    const errorEmoji = getEmoji(message.client, 'error');
    const errorMsg = await translateForUser(
      message.author.id,
      'errors.command_error'
    );
    
    const kickErrReply = await message.reply({
      content: `${errorEmoji} ${errorMsg}`,
      allowedMentions: { repliedUser: false }
    }).catch(() => null);
    if (kickErrReply) autoDelete(kickErrReply, 15000);
  }
}
