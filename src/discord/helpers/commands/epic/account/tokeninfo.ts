/**
 * ACCOUNT TOKENINFO SUBCOMMAND
 */

import { ChatInputCommandInteraction } from 'discord.js';
import axios from 'axios';
import { Endpoints } from '#helpers/core/endpoints.ts';
import { createGenericErrorEmbed } from '#helpers/core/embedHelper.ts';
import { translateForUser } from '#helpers/locales/index.ts';
import { log } from '#helpers/core/logger.ts';
import { accountSection, replyWithAccountEmbed } from './accountEmbedHelper.ts';

export async function handleTokenInfoSubcommand(interaction: ChatInputCommandInteraction): Promise<void> {
  const userId = interaction.user.id;

  try {
    const token = interaction.options.getString('token', true);

    let tokenInfo: { account_id: string; client_id: string; expires_at: string };
    try {
      const res = await axios.get(Endpoints.OAUTH_TOKEN_VERIFY, {
        headers: { Authorization: `bearer ${token}` },
      });
      tokenInfo = res.data;
    } catch (err: unknown) {
      log.epic.error({ error: err }, 'Error verificando token');
      const embed = await createGenericErrorEmbed(err, interaction);
      await interaction.editReply({ embeds: [embed] });
      return;
    }

    const expiresAt = new Date(tokenInfo.expires_at);
    const isValid = expiresAt > new Date();

    const validYes = await translateForUser(userId, 'account.tokeninfo.values.yes');
    const validNo = await translateForUser(userId, 'account.tokeninfo.values.no');
    const statusLabel = accountSection(await translateForUser(userId, 'account.tokeninfo.fields.valid'));

    await replyWithAccountEmbed(interaction, userId, {
      style: isValid ? 'success' : 'error',
      title: await translateForUser(userId, 'account.tokeninfo.title'),
      fields: [
        {
          name: await translateForUser(userId, 'account.tokeninfo.fields.accountId'),
          value: `\`\`\`${tokenInfo.account_id}\`\`\``,
          inline: false,
        },
        {
          name: await translateForUser(userId, 'account.tokeninfo.fields.clientId'),
          value: `\`${tokenInfo.client_id}\``,
          inline: true,
        },
        {
          name: await translateForUser(userId, 'account.tokeninfo.fields.expiresAt'),
          value: `<t:${Math.floor(expiresAt.getTime() / 1000)}:R>`,
          inline: true,
        },
        {
          name: statusLabel,
          value: isValid ? `**${validYes}**` : `**${validNo}**`,
          inline: true,
        },
      ],
      footerKey: 'security',
    });

    log.epic.debug({ userId, valid: isValid }, 'Token info mostrado');
  } catch (err) {
    log.epic.error({ error: err }, 'Error en tokeninfo subcommand');
    const embed = await createGenericErrorEmbed(
      { message: await translateForUser(userId, 'account.errors.unexpected') },
      interaction,
    );
    await interaction.editReply({ embeds: [embed] });
  }
}
