/**
 * CMD Subcommand Handler
 */

import axios from 'axios';
import { ChatInputCommandInteraction } from 'discord.js';
import { log } from '#helpers/core/logger.ts';
import { translateForUser } from '#helpers/locales/index.ts';
import { createGenericErrorEmbed } from '#helpers/core/embedHelper.ts';
import { getMainAccountAuthor } from '#helpers/epic/account/avatarHandler.ts';
import { endpoints } from '#helpers/core/endpoints.ts';
import UsuarioInfo from '#models/UsuarioInfo.ts';
import { replyWithAccountEmbed } from './accountEmbedHelper.ts';

const LAUNCHER_AUTH_HEADER = 'M2Y2OWU1NmM3NjQ5NDkyYzhjYzI5ZjFhZjA4YThhMTI6YjUxZWU5Y2IxMjIzNGY1MGE2OWVmYTY3ZWY1MzgxMmU=';
const FN_CLIENT_ID = '98f7e42c2e3a4f86a74eb43fbb41ed39';
const FN_CLIENT_SECRET = '0a2449a2-001a-451e-afec-3e812901c4d7';
const FN_AUTH_HEADER = Buffer.from(`${FN_CLIENT_ID}:${FN_CLIENT_SECRET}`).toString('base64');

async function getFnAccessToken(mainAccount: {
  accountId: string;
  deviceId: string;
  secret: string;
}): Promise<string | null> {
  const params = new URLSearchParams({
    grant_type: 'device_auth',
    account_id: mainAccount.accountId,
    device_id: mainAccount.deviceId,
    secret: mainAccount.secret,
    token_type: 'eg1',
  });

  try {
    const res = await axios.post(endpoints.OAUTH_TOKEN, params, {
      headers: {
        Authorization: `basic ${FN_AUTH_HEADER}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
    });
    return res.data.access_token;
  } catch (err) {
    log.epic.error({ err }, 'Error getting FN access token');
    return null;
  }
}

async function getLauncherAccessToken(mainAccount: {
  accountId: string;
  deviceId: string;
  secret: string;
}): Promise<string | null> {
  const params = new URLSearchParams({
    grant_type: 'device_auth',
    account_id: mainAccount.accountId,
    device_id: mainAccount.deviceId,
    secret: mainAccount.secret,
    token_type: 'eg1',
  });

  try {
    const res = await axios.post(endpoints.OAUTH_TOKEN, params, {
      headers: {
        Authorization: `basic ${LAUNCHER_AUTH_HEADER}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
    });
    return res.data.access_token;
  } catch (err) {
    log.epic.error({ err }, 'Error getting Launcher access token');
    return null;
  }
}

async function getExchangeCode(accessToken: string): Promise<string | null> {
  try {
    const res = await axios.get(endpoints.OAUTH_EXCHANGE, {
      headers: { Authorization: `bearer ${accessToken}` },
    });
    return res.data.code;
  } catch (err) {
    log.epic.error({ err }, 'Error getting exchange code');
    return null;
  }
}

async function getLauncherAccessTokenWithExchange(exchangeCode: string): Promise<string | null> {
  const params = new URLSearchParams({
    grant_type: 'exchange_code',
    exchange_code: exchangeCode,
    token_type: 'eg1',
  });

  try {
    const res = await axios.post(endpoints.OAUTH_TOKEN, params, {
      headers: {
        Authorization: `basic ${LAUNCHER_AUTH_HEADER}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
    });
    return res.data.access_token;
  } catch (err) {
    log.epic.error({ err }, 'Error getting Launcher token with exchange');
    return null;
  }
}

export async function handleCmdSubcommand(interaction: ChatInputCommandInteraction): Promise<void> {
  const userId = interaction.user.id;

  try {
    const user = await UsuarioInfo.findOne({ id: userId });
    if (!user) throw new Error('User not found');

    const mainAccount = user.deviceAuths.find((acc) => acc.cuentaMain);
    if (!mainAccount) throw new Error('Main account not found');

    const authorData = await getMainAccountAuthor(userId, {
      accountId: mainAccount.accountId,
      accessToken: mainAccount.accessToken,
      displayName: mainAccount.displayName,
    });

    if (!mainAccount.accountId || !mainAccount.deviceId || !mainAccount.secret) {
      const errorMsg = await translateForUser(userId, 'account.cmd.errors.incompleteCredentials');
      const embed = await createGenericErrorEmbed({ message: errorMsg }, interaction);
      await interaction.editReply({ embeds: [embed] });
      return;
    }

    let launcherAccessToken = await getLauncherAccessToken({
      accountId: mainAccount.accountId,
      deviceId: mainAccount.deviceId,
      secret: mainAccount.secret,
    });

    if (!launcherAccessToken) {
      const fnAccessToken = await getFnAccessToken({
        accountId: mainAccount.accountId,
        deviceId: mainAccount.deviceId,
        secret: mainAccount.secret,
      });

      if (!fnAccessToken) {
        const errorMsg = await translateForUser(userId, 'account.cmd.errors.noAccessToken');
        const embed = await createGenericErrorEmbed({ message: errorMsg }, interaction);
        await interaction.editReply({ embeds: [embed] });
        return;
      }

      const exchangeCode = await getExchangeCode(fnAccessToken);
      if (!exchangeCode) {
        const errorMsg = await translateForUser(userId, 'account.cmd.errors.noExchangeCode');
        const embed = await createGenericErrorEmbed({ message: errorMsg }, interaction);
        await interaction.editReply({ embeds: [embed] });
        return;
      }

      launcherAccessToken = await getLauncherAccessTokenWithExchange(exchangeCode);
      if (!launcherAccessToken) {
        const errorMsg = await translateForUser(userId, 'account.cmd.errors.noAccessToken');
        const embed = await createGenericErrorEmbed({ message: errorMsg }, interaction);
        await interaction.editReply({ embeds: [embed] });
        return;
      }
    }

    const finalExchangeCode = await getExchangeCode(launcherAccessToken);
    if (!finalExchangeCode) {
      const errorMsg = await translateForUser(userId, 'account.cmd.errors.exchangeError', {
        error: 'No exchange code from launcher',
      });
      const embed = await createGenericErrorEmbed({ message: errorMsg }, interaction);
      await interaction.editReply({ embeds: [embed] });
      return;
    }

    const cmdCommand = `start /d "C:\\Program Files\\Epic Games\\Fortnite\\FortniteGame\\Binaries\\Win64" FortniteLauncher.exe -AUTH_LOGIN=unused -AUTH_PASSWORD=${finalExchangeCode} -AUTH_TYPE=exchangecode -epicapp=Fortnite -epicenv=Prod -EpicPortal -epicuserid=${mainAccount.accountId}`;

    await replyWithAccountEmbed(interaction, userId, {
      style: 'success',
      title: await translateForUser(userId, 'account.cmd.embed.title'),
      description: await translateForUser(userId, 'account.cmd.embed.description', { cmd: cmdCommand }),
      footerText: await translateForUser(userId, 'account.cmd.embed.footer'),
      author: authorData,
    });

    log.epic.info({ userId, displayName: mainAccount.displayName }, 'CMD command generated');
  } catch (error: unknown) {
    log.epic.error({ error }, 'Error handling CMD subcommand');
    const embed = await createGenericErrorEmbed(error, interaction);
    await interaction.editReply({ embeds: [embed] });
  }
}
