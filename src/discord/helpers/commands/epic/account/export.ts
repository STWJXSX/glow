/**
 * ACCOUNT EXPORT SUBCOMMAND
 */

import { AttachmentBuilder, ChatInputCommandInteraction } from 'discord.js';
import { createGenericErrorEmbed } from '#helpers/core/embedHelper.ts';
import { log } from '#helpers/core/logger.ts';
import { translateForUser } from '#helpers/locales/index.ts';
import UsuarioInfo from '#models/UsuarioInfo.ts';
import { replyAccountCredentialError, replyWithAccountEmbed } from './accountEmbedHelper.ts';

export async function handleExportSubcommand(interaction: ChatInputCommandInteraction): Promise<void> {
  const userId = interaction.user.id;

  try {
    const user = await UsuarioInfo.findOne({ id: userId });

    if (!user || !user.deviceAuths || user.deviceAuths.length === 0) {
      await replyAccountCredentialError(interaction, userId, 'noCuenta');
      return;
    }

    const exportData = {
      tosAccepted: user.aceptarTOS ?? false,
      accounts: user.deviceAuths.map((acc) => ({
        accountId: acc.accountId,
        displayName: acc.displayName,
        deviceId: acc.deviceId,
        secret: acc.secret,
        isMain: acc.cuentaMain,
        addedAt: Date.now(),
      })),
    };

    const json = JSON.stringify(exportData, null, 2);
    const buffer = Buffer.from(json, 'utf-8');
    const attachment = new AttachmentBuilder(buffer, { name: 'glow-accounts-export.json' });
    const count = exportData.accounts.length;

    await replyWithAccountEmbed(
      interaction,
      userId,
      {
        style: 'success',
        title: await translateForUser(userId, 'account.export.title'),
        description: await translateForUser(userId, 'account.export.description', { count }),
        footerKey: 'sensitive',
      },
      { files: [attachment] },
    );
  } catch (error) {
    log.epic.error({ error }, 'Error en account export');
    const embed = await createGenericErrorEmbed(
      { message: await translateForUser(userId, 'account.errors.unexpected', undefined, interaction.locale) },
      interaction,
    );
    await interaction.editReply({ embeds: [embed] });
  }
}
