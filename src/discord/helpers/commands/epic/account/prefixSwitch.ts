import { Message, EmbedBuilder, Colors } from 'discord.js';
import UsuarioInfo from '#models/UsuarioInfo.ts';
import { translateForUser } from '#helpers/locales/index.ts';
import { getEmoji } from '#helpers/core/emojis.ts';
import { log } from '#helpers/core/logger.ts';

/**
 * Maneja el comando gs (switch) con prefijo
 * Permite cambiar la cuenta principal usando número o nombre
 * @param message Mensaje del usuario
 * @param accountIdentifier Número (1, 2, 3...) o nombre de la cuenta
 */
export async function handlePrefixSwitch(message: Message, accountIdentifier: string): Promise<void> {
  const userId = message.author.id;
  
  try {
    // Obtener datos del usuario
    const db = await UsuarioInfo.findOne({ id: userId });
    
    if (!db || !db.deviceAuths || db.deviceAuths.length === 0) {
      const errorEmoji = getEmoji(message.client, 'warning');
      const errorMsg = await translateForUser(
        userId,
        'cambiar.embed1.noAccounts',
        { emoji: errorEmoji }
      );
      
      await message.reply({
        content: errorMsg || `${errorEmoji} No tienes cuentas registradas. Usa \`/login\` primero.`,
        allowedMentions: { repliedUser: false }
      });
      return;
    }
    
    let selectedAccount: any = null;
    
    // Intentar buscar por número (índice)
    const accountNumber = parseInt(accountIdentifier);
    if (!isNaN(accountNumber) && accountNumber > 0 && accountNumber <= db.deviceAuths.length) {
      selectedAccount = db.deviceAuths[accountNumber - 1];
    } else {
      // Buscar por nombre (case insensitive)
      const searchTerm = accountIdentifier.toLowerCase();
      selectedAccount = db.deviceAuths.find((acc: any) => 
        acc.displayName?.toLowerCase().includes(searchTerm) ||
        acc.accountId.toLowerCase().includes(searchTerm)
      );
    }
    
    if (!selectedAccount) {
      const errorEmoji = getEmoji(message.client, 'error');
      
      // Crear lista de cuentas disponibles
      const accountsList = db.deviceAuths
        .map((acc: any, idx: number) => `**${idx + 1}.** ${acc.displayName || acc.accountId}${acc.cuentaMain ? ' *(actual)*' : ''}`)
        .join('\n');
      
      const errorEmbed = new EmbedBuilder()
        .setColor(Colors.Red)
        .setDescription(`${errorEmoji} **No se encontró la cuenta "${accountIdentifier}"**\n\n**Cuentas disponibles:**\n${accountsList}\n\n**Uso:** \`gs <número>\` o \`gs <nombre>\``)
        .setTimestamp();
      
      await message.reply({
        embeds: [errorEmbed],
        allowedMentions: { repliedUser: false }
      });
      return;
    }
    
    // Verificar si ya es la cuenta principal
    if (selectedAccount.cuentaMain) {
      const infoEmoji = getEmoji(message.client, 'info');
      
      await message.reply({
        content: `${infoEmoji} **${selectedAccount.displayName}** ya es tu cuenta principal.`,
        allowedMentions: { repliedUser: false }
      });
      return;
    }
    
    // Actualizar cuenta principal
    db.deviceAuths = db.deviceAuths.map((account: any) => ({
      ...account,
      cuentaMain: account.accountId === selectedAccount.accountId
    }));
    
    await db.save();
    
    // Mensaje de éxito
    const successEmoji = getEmoji(message.client, 'success');
    const changeEmoji = getEmoji(message.client, 'change');
    
    const successEmbed = new EmbedBuilder()
      .setColor(Colors.Green)
      .setDescription(`${changeEmoji} Cuenta principal cambiada a **${selectedAccount.displayName}**`)
      .addFields({
        name: 'Account ID',
        value: `\`${selectedAccount.accountId}\``,
        inline: false
      })
      .setTimestamp();
    
    await message.reply({
      embeds: [successEmbed],
      allowedMentions: { repliedUser: false }
    });
    
    log.commands.info(
      { 
        userId, 
        accountId: selectedAccount.accountId, 
        displayName: selectedAccount.displayName 
      }, 
      'Cuenta principal cambiada via prefijo'
    );
    
  } catch (error) {
    log.commands.error({ error, userId }, 'Error en handlePrefixSwitch');
    
    const errorEmoji = getEmoji(message.client, 'error');
    const errorMsg = await translateForUser(userId, 'errors.command_error');
    
    await message.reply({
      content: `${errorEmoji} ${errorMsg}`,
      allowedMentions: { repliedUser: false }
    }).catch(() => {});
  }
}
