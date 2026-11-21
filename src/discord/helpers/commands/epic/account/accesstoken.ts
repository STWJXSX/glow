/**
 * ACCOUNT ACCESSTOKEN SUBCOMMAND
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

const DEFAULT_LAUNCHER_AUTH = 'Basic M2Y2OWU1NmM3NjQ5NDkyYzhjYzI5ZjFhZjA4YThhMTI6YjUxZWU5Y2IxMjIzNGY1MGE2OWVmYTY3ZWY1MzgxMmU=';

export async function handleAccessTokenSubcommand(interaction: ChatInputCommandInteraction): Promise<void> {
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

    let accessToken: string;
    try {
      const params = new URLSearchParams({
        grant_type: 'device_auth',
        account_id: mainAccount.accountId,
        device_id: mainAccount.deviceId,
        secret: mainAccount.secret,
      }).toString();

      const res = await axios.post(Endpoints.OAUTH_TOKEN_CREATE, params, {
        headers: {
          Authorization: DEFAULT_LAUNCHER_AUTH,
          'Content-Type': 'application/x-www-form-urlencoded',
        },
      });
      accessToken = res.data.access_token;
    } catch (err: unknown) {
      log.epic.error({ error: err }, 'Error generando Access Token');
      const embed = await createGenericErrorEmbed(err, interaction);
      await interaction.editReply({ embeds: [embed] });
      return;
    }

    const authorData = await getMainAccountAuthor(userId).catch(() => null);

    await replyWithAccountEmbed(interaction, userId, {
      style: 'info',
      title: await translateForUser(userId, 'account.accesstoken.title'),
      description: await translateForUser(userId, 'account.accesstoken.description', { token: accessToken }),
      footerText: await translateForUser(userId, 'account.accesstoken.footer'),
      author: authorData,
    });

    log.epic.debug({ userId }, 'Access Token generado');
  } catch (err) {
    log.epic.error({ error: err }, 'Error en accesstoken subcommand');
    const embed = await createGenericErrorEmbed(
      { message: await translateForUser(userId, 'account.errors.unexpected') },
      interaction,
    );
    await interaction.editReply({ embeds: [embed] });
  }
}
