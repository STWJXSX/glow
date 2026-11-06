import { ChatInputCommandInteraction } from 'discord.js';
import { log } from '../logger.ts';
import { translateForUser } from '#helpers/locales/index.ts';
import { createInfoEmbed } from '../embedHelper.ts';

/**
 * Resultado de la verificación de servidor requerido
 */
export interface ServerVerificationResult {
  allowed: boolean;
  reason?: string;
}

/**
 * Verifica si el usuario está en el servidor de soporte requerido
 * Usa fetch con force: true para obtener datos reales de la API de Discord
 * 
 * @param interaction - Interacción del comando
 * @param commandName - Nombre del comando (para logs)
 * @returns Resultado de la verificación
 */
export async function checkServerRequirement(
  interaction: ChatInputCommandInteraction,
  commandName: string
): Promise<ServerVerificationResult> {
  const userId = interaction.user.id;
  const supportServerId = process.env.SUPPORT_SERVER;
  const serverInvite = process.env.SUPPORT_SERVER_INVITE;
  
  // BLOQUEAR si no está configurado el servidor
  if (!supportServerId) {
    log.commands.error({ command: commandName }, 'SUPPORT_SERVER no está configurado en .env pero el comando requiere inServer');
    
    const title = await translateForUser(userId, 'errors.server_required.title');
    const description = await translateForUser(userId, 'errors.server_required.description');
    const buttonText = await translateForUser(userId, 'errors.server_required.button');
    
    const serverEmbed = await createInfoEmbed({
      title,
      description: `${description}\n\n[${buttonText}](${serverInvite})`,
      image: 'https://cdn.discordapp.com/attachments/1412177976908578825/1463175284005011650/iSGUTwu.png?ex=6970dfac&is=696f8e2c&hm=4271b91bdd354b2889c3f008902fc9a1f3e4bd3c12ea31ae648cbebdac518668&',
      footer: 'user',
      interaction,
    });
    
    await interaction.reply({
      embeds: [serverEmbed],
      ephemeral: true,
    }).catch(() => {});
    
    return { allowed: false, reason: 'server_not_configured' };
  }
  
  // Verificar si el bot está en el servidor de soporte
  const supportGuild = interaction.client.guilds.cache.get(supportServerId);
  
  // BLOQUEAR si el bot no está en el servidor
  if (!supportGuild) {
    log.commands.error({ supportServerId, command: commandName }, 'El bot no está en el servidor de soporte configurado');
    
    const title = await translateForUser(userId, 'errors.server_required.title');
    const description = await translateForUser(userId, 'errors.server_required.description');
    const buttonText = await translateForUser(userId, 'errors.server_required.button');
    
    const serverEmbed = await createInfoEmbed({
      title,
      description: `${description}\n\n[${buttonText}](${serverInvite})`,
      image: 'https://cdn.discordapp.com/attachments/1412177976908578825/1463175284005011650/iSGUTwu.png?ex=6970dfac&is=696f8e2c&hm=4271b91bdd354b2889c3f008902fc9a1f3e4bd3c12ea31ae648cbebdac518668&',
      footer: 'user',
      interaction,
    });
    
    await interaction.reply({
      embeds: [serverEmbed],
      ephemeral: true,
    }).catch(() => {});
    
    return { allowed: false, reason: 'bot_not_in_server' };
  }
  
  // Verificar membresía del usuario con API request de Discord
  let isInSupportServer = false;
  
  try {
    // Forzar fetch desde API de Discord (no usar caché)
    const member = await supportGuild.members.fetch({ user: userId, force: true }).catch(() => null);
    isInSupportServer = member !== null;
    
    log.commands.debug({ 
      userId, 
      supportServerId, 
      memberFound: isInSupportServer,
      command: commandName 
    }, 'Verificación de membresía en servidor de soporte');
    
  } catch (error) {
    log.commands.error({ 
      userId, 
      supportServerId, 
      error,
      command: commandName 
    }, 'Error al verificar membresía en servidor de soporte');
    
    // Si hay error en la verificación, BLOQUEAR por seguridad
    isInSupportServer = false;
  }
  
  // BLOQUEAR si el usuario NO está en el servidor
  if (!isInSupportServer) {
    const title = await translateForUser(userId, 'errors.server_required.title');
    const description = await translateForUser(userId, 'errors.server_required.description');
    const buttonText = await translateForUser(userId, 'errors.server_required.button');
    
    const serverEmbed = await createInfoEmbed({
      title,
      description: `${description}\n\n[${buttonText}](${serverInvite})`,
      image: 'https://cdn.discordapp.com/attachments/1412177976908578825/1463175284005011650/iSGUTwu.png?ex=6970dfac&is=696f8e2c&hm=4271b91bdd354b2889c3f008902fc9a1f3e4bd3c12ea31ae648cbebdac518668&',
      footer: 'user',
      interaction,
    });
    
    await interaction.reply({
      embeds: [serverEmbed],
      ephemeral: true,
    }).catch(() => {});
    
    return { allowed: false, reason: 'user_not_in_server' };
  }
  
  // Usuario verificado correctamente
  return { allowed: true };
}
