/**
 * ACCOUNT DEVICE SUBCOMMAND
 */

import { ChatInputCommandInteraction } from 'discord.js';
import { getMainAccountAuthor } from '#helpers/epic/account/avatarHandler.ts';
import { createGenericErrorEmbed } from '#helpers/core/embedHelper.ts';
import { translateForUser } from '#helpers/locales/index.ts';
import { log } from '#helpers/core/logger.ts';
import UsuarioInfo from '#models/UsuarioInfo.ts';
import { accountSection, replyAccountCredentialError, replyWithAccountEmbed } from './accountEmbedHelper.ts';

export async function handleDeviceSubcommand(interaction: ChatInputCommandInteraction): Promise<void> {
  const userId = interaction.user.id;

  try {
    const user = await UsuarioInfo.findOne({ id: userId });

    if (!user || !user.deviceAuths || user.deviceAuths.length === 0) {
      await replyAccountCredentialError(interaction, userId, 'noCuenta');
      return;
    }

    const mainAccount = user.deviceAuths.find((acc: any) => acc.cuentaMain);

    if (!mainAccount) {
      await replyAccountCredentialError(interaction, userId, 'noMain');
      return;
    }

    const authorData = await getMainAccountAuthor(userId).catch(() => null);

    await replyWithAccountEmbed(interaction, userId, {
      style: 'info',
      title: await translateForUser(userId, 'account.device.title'),
      description: await translateForUser(userId, 'account.device.description'),
      fields: [
        {
          name: accountSection(await translateForUser(userId, 'account.device.fields.accountId')),
          value: `\`\`\`${mainAccount.accountId}\`\`\``,
          inline: false,
        },
        {
          name: accountSection(await translateForUser(userId, 'account.device.fields.deviceId')),
          value: `\`\`\`${mainAccount.deviceId}\`\`\``,
          inline: false,
        },
        {
          name: accountSection(await translateForUser(userId, 'account.device.fields.secret')),
          value: `\`\`\`${mainAccount.secret}\`\`\``,
          inline: false,
        },
      ],
      footerText: await translateForUser(userId, 'account.device.footer'),
      author: authorData,
    });

    log.epic.debug({ userId }, 'Device Auth mostrado');
  } catch (err) {
    log.epic.error({ error: err }, 'Error en device subcommand');
    const embed = await createGenericErrorEmbed(
      { message: await translateForUser(userId, 'account.errors.unexpected') },
      interaction,
    );
    await interaction.editReply({ embeds: [embed] });
  }
}
