/**
 * ACCOUNT EXCHANGECODE SUBCOMMAND
 */

import { ChatInputCommandInteraction } from 'discord.js';
import axios from 'axios';
import { Endpoints } from '#helpers/core/endpoints.ts';
import { getMainAccountAuthor } from '#helpers/epic/account/avatarHandler.ts';
import { createGenericErrorEmbed } from '#helpers/core/embedHelper.ts';
import { translateForUser } from '#helpers/locales/index.ts';
import { log } from '#helpers/core/logger.ts';
import UsuarioInfo from '#models/UsuarioInfo.ts';
import { replyAccountCredentialError, replyWithAccountEmbed } from './accountEmbedHelper.ts';

export async function handleExchangeCodeSubcommand(interaction: ChatInputCommandInteraction): Promise<void> {
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

    let exchangeCode: string;
    try {
      const res = await axios.get(Endpoints.OAUTH_EXCHANGE, {
        headers: { Authorization: `bearer ${mainAccount.accessToken}` },
      });
      exchangeCode = res.data.code;
    } catch (err: unknown) {
      log.epic.error({ error: err }, 'Error generando Exchange Code');
      const embed = await createGenericErrorEmbed(err, interaction);
      await interaction.editReply({ embeds: [embed] });
      return;
    }

    const authorData = await getMainAccountAuthor(userId).catch(() => null);

    await replyWithAccountEmbed(interaction, userId, {
      style: 'info',
      title: await translateForUser(userId, 'account.exchangecode.title'),
      description: await translateForUser(userId, 'account.exchangecode.description', { code: exchangeCode }),
      footerText: await translateForUser(userId, 'account.exchangecode.footer'),
      author: authorData,
    });

    log.epic.debug({ userId }, 'Exchange Code generado');
  } catch (err) {
    log.epic.error({ error: err }, 'Error en exchangecode subcommand');
    const embed = await createGenericErrorEmbed(
      { message: await translateForUser(userId, 'account.errors.unexpected') },
      interaction,
    );
    await interaction.editReply({ embeds: [embed] });
  }
}
