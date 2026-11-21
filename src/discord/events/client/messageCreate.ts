import { 
  Events, 
  Message, 
  EmbedBuilder, 
  Colors,
  ChatInputCommandInteraction,
  CommandInteraction
} from 'discord.js';
import type { BotEvent, ExtendedClient } from '#structures/types.ts';
import { hasPrefix, BOT_CONFIG } from '#helpers/core/config/index.ts';
import { translateForUser } from '#helpers/locales/index.ts';
import { log } from '#helpers/core/logger.ts';
import { getEmoji } from '#helpers/core/emojis.ts';
import { handlePrefixSwitch } from '#helpers/commands/epic/account/prefixSwitch.ts';
import { callCore, isGlowCoreEnabled } from '#api/glowCore.ts';

/** Auto-deletes a Message after a given delay (ms). */
function autoDelete(msg: Message, delay = 15000): void {
  setTimeout(() => msg.delete().catch(() => {}), delay);
}

/**
 * Evento MessageCreate - Soporte de comandos con prefijos de texto
 * Permite ejecutar comandos usando prefijos como "g ping"
 * Los comandos con onlySlash: true solo funcionan con slash commands
 */
const event: BotEvent<'messageCreate'> = {
  name: Events.MessageCreate,
  once: false,
  
  async execute(client: ExtendedClient, message: Message) {
    // Ignorar bots
    if (message.author.bot) return;
    
    // Verificar si el mensaje tiene prefijo
    const prefixCheck = hasPrefix(message.content);
    if (!prefixCheck.hasPrefix) return;
    
    // Parsear comando y argumentos
    const args = prefixCheck.command.split(/\s+/);
    const commandName = args[0].toLowerCase();
    
    if (!commandName) return;
    
    // ============================================
    // COMANDOS ESPECIALES CON PREFIJO
    // ============================================
    
    // gs [número|nombre] - Switch cuenta principal sin interfaz
    if (commandName === 's' && args.length > 1) {
      const accountIdentifier = args.slice(1).join(' ');
      await handlePrefixSwitch(message, accountIdentifier);
      return;
    }
    
    // gk - Kick con force true
    if (commandName === 'k') {
      await handlePrefixKick(message, 'normal');
      return;
    }
    
    // gkc - Kick collect
    if (commandName === 'kc') {
      await handlePrefixKick(message, 'collect');
      return;
    }
    
    // gkca - Kick collect all
    if (commandName === 'kca') {
      await handlePrefixKick(message, 'collectall');
      return;
    }
    
    // ============================================
    // COMANDOS NORMALES CON PREFIJO
    // ============================================
    
    // Buscar comando
    const command = client.commands.get(commandName);
    if (!command) return;
    
    const errorEmoji = getEmoji(client, 'error');
    
    // Verificar si el comando solo permite slash
    if (command.onlyslash) {
      const errorMsg = await translateForUser(
        message.author.id,
        'errors.only_slash_command',
        { command: commandName }
      );
      
      const errorEmbed = new EmbedBuilder()
        .setColor(Colors.Red)
        .setTitle(`${errorEmoji} Slash Command Only`)
        .setDescription(errorMsg);
      
      const onlySlashReply = await message.reply({
        embeds: [errorEmbed],
        allowedMentions: { repliedUser: false },
      }).catch(() => null);
      if (onlySlashReply) autoDelete(onlySlashReply, 15000);
      
      log.commands.debug(
        { 
          user: message.author.id, 
          command: commandName, 
          prefix: prefixCheck.prefix 
        }, 
        'Comando de texto bloqueado (onlyslash)'
      );
      
      return;
    }
    
    // El comando permite prefix, ejecutarlo
    try {
      log.commands.debug(
        { 
          user: message.author.id, 
          command: commandName, 
          prefix: prefixCheck.prefix,
          guild: message.guild?.id || 'DM'
        }, 
        'Comando ejecutado con prefix'
      );
      
      // Variable para rastrear el estado de la respuesta
      let messageReplied = false;
      let messageDeferred = false;
      let isEphemeral = false;
      let lastReply: Message | null = null;

      // ─── Subcommand routing ──────────────────────────────────────────
      let resolvedSubcommand: string | null = null;
      const cmdJson = command.data.toJSON() as any;
      const flatSubcmds: any[] = (cmdJson.options ?? []).filter((o: any) => o.type === 1);

      if (flatSubcmds.length > 0) {
        const inputSubcmd = (args[1] ?? '').toLowerCase() || null;

        const matched = inputSubcmd
          ? flatSubcmds.find(o => {
              if (o.name.toLowerCase() === inputSubcmd) return true;
              const locs: Record<string, string> = o.name_localizations ?? {};
              return Object.values(locs).some(v => v.toLowerCase() === inputSubcmd);
            })
          : null;

        if (!inputSubcmd || !matched) {
          const subcmdList = flatSubcmds
            .map(o => {
              const locs: Record<string, string> = o.name_localizations ?? {};
              const aliases = Object.values(locs);
              const allNames = [o.name, ...aliases.filter(a => a !== o.name)].map(n => `\`${n}\``).join(' / ');
              return `> ${allNames} — ${o.description}`;
            })
            .join('\n');

          const repl: Record<string, string> = { command: commandName, list: subcmdList };
          if (inputSubcmd) repl.input = inputSubcmd;

          const titleKey = inputSubcmd ? 'prefix.invalid_subcommand.title' : 'prefix.no_subcommand.title';
          const descKey = inputSubcmd ? 'prefix.invalid_subcommand.description' : 'prefix.no_subcommand.description';

          const subcmdTitle = await translateForUser(message.author.id, titleKey);
          const subcmdDesc = await translateForUser(message.author.id, descKey, repl);

          const subcmdReply = await message.reply({
            embeds: [
              new EmbedBuilder()
                .setColor(inputSubcmd ? Colors.Red : Colors.Blue)
                .setTitle(inputSubcmd ? `${errorEmoji} ${subcmdTitle}` : subcmdTitle)
                .setDescription(subcmdDesc),
            ],
            allowedMentions: { repliedUser: false },
          }).catch(() => null);
          if (subcmdReply) autoDelete(subcmdReply, 15000);
          return;
        }

        resolvedSubcommand = matched.name;
      }
      // ────────────────────────────────────────────────────────────────
      
      // Crear un objeto similar a interaction para compatibilidad
      const mockInteraction = {
        user: message.author,
        member: message.member,
        guild: message.guild,
        channel: message.channel,
        client: message.client,
        id: message.id,
        channelId: message.channelId,
        guildId: message.guildId,
        applicationId: client.user?.id || '',
        createdTimestamp: message.createdTimestamp,
        
        // Getters para compatibilidad
        get replied() { return messageReplied; },
        get deferred() { return messageDeferred; },
        
        // Métodos de respuesta
        reply: async (options: any) => {
          const { ephemeral, ...sendOptions } = options;
          const reply = await message.reply(sendOptions);
          messageReplied = true;
          lastReply = reply;
          if (ephemeral) autoDelete(reply, 15000);
          return reply;
        },
        
        editReply: async (options: any) => {
          if (lastReply) {
            const edited = await lastReply.edit(options);
            if (isEphemeral) autoDelete(edited, 15000);
            return edited;
          } else {
            const reply = await message.reply(options);
            messageReplied = true;
            lastReply = reply;
            if (isEphemeral) autoDelete(reply, 15000);
            return reply;
          }
        },
        
        deferReply: async (options?: any) => {
          isEphemeral = options?.ephemeral ?? false;
          // Para comandos de prefix, enviar un mensaje temporal de "procesando"
          const processingEmoji = getEmoji(client, 'loading') || '⏳';
          const reply = await message.reply({
            content: `${processingEmoji} Processing...`,
            allowedMentions: { repliedUser: false }
          });
          messageDeferred = true;
          lastReply = reply;
          return reply;
        },
        
        followUp: async (options: any) => {
          if (message.channel && 'send' in message.channel) {
            return await message.channel.send(options);
          }
          return null;
        },
        
        fetchReply: async () => {
          return lastReply;
        },
        
        // Opciones vacías para comandos simples
        options: {
          getString: (name: string, required?: boolean) => null,
          getSubcommand: (_required?: boolean) => resolvedSubcommand,
          getSubcommandGroup: () => null,
          getInteger: (name: string, required?: boolean) => null,
          getBoolean: (name: string, required?: boolean) => null,
          getUser: (name: string, required?: boolean) => null,
          getChannel: (name: string, required?: boolean) => null,
          getRole: (name: string, required?: boolean) => null,
          getMentionable: (name: string, required?: boolean) => null,
          getNumber: (name: string, required?: boolean) => null,
          getAttachment: (name: string, required?: boolean) => null,
          getFocused: () => '',
          data: []
        },
        
        // Métodos adicionales para compatibilidad
        isRepliable: () => true,
        inGuild: () => message.inGuild(),
        inCachedGuild: () => message.inGuild(),
        toString: () => `MockInteraction(${message.id})`
      } as any;
      
      // Ejecutar el comando
      if (command.execute) {
        await command.execute(mockInteraction);
      }
      
    } catch (error) {
      log.commands.error(
        { error, command: commandName, user: message.author.id }, 
        'Error ejecutando comando con prefix'
      );
      
      const errorMsg = await translateForUser(
        message.author.id,
        'errors.command_error'
      );
      
      const errorEmbed = new EmbedBuilder()
        .setColor(Colors.Red)
        .setTitle(`${errorEmoji} Error`)
        .setDescription(errorMsg);
      
      const catchErrReply = await message.reply({
        embeds: [errorEmbed],
        allowedMentions: { repliedUser: false },
      }).catch(() => null);
      if (catchErrReply) autoDelete(catchErrReply, 15000);
    }
  },
};

/**
 * Prefix kick (gk / gkc / gkca) — runs in Glow Core; the core replies to the message itself.
 */
async function handlePrefixKick(message: Message, type: 'normal' | 'collect' | 'collectall') {
  if (!isGlowCoreEnabled()) return;
  try {
    await callCore('kick.prefix', { channelId: message.channelId, messageId: message.id, guildId: message.guildId, type });
  } catch (error) {
    log.commands.error({ err: error, type }, 'Error en comando kick con prefijo');
    const errorEmoji = getEmoji(message.client, 'error');
    const errorMsg = await translateForUser(message.author.id, 'errors.command_error');
    const kickErrReply = await message.reply({
      content: `${errorEmoji} ${errorMsg}`,
      allowedMentions: { repliedUser: false },
    }).catch(() => null);
    if (kickErrReply) autoDelete(kickErrReply, 15000);
  }
}

export default event;

