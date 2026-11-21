/**
 * Panel Subcommand Handler
 */

import axios from 'axios';
import { ActionRowBuilder, ButtonBuilder, ButtonStyle, ChatInputCommandInteraction } from 'discord.js';
import { log } from '#helpers/core/logger.ts';
import { translateForUser } from '#helpers/locales/index.ts';
import { createGenericErrorEmbed } from '#helpers/core/embedHelper.ts';
import { getMainAccountAuthor } from '#helpers/epic/account/avatarHandler.ts';
import { endpoints } from '#helpers/core/endpoints.ts';
import UsuarioInfo from '#models/UsuarioInfo.ts';
import { replyWithAccountEmbed } from './accountEmbedHelper.ts';

export async function handlePanelSubcommand(interaction: ChatInputCommandInteraction): Promise<void> {
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

    let exchangeCode: string;
    try {
      const res = await axios.get(endpoints.OAUTH_EXCHANGE, {
        headers: { Authorization: `bearer ${mainAccount.accessToken}` },
      });
      exchangeCode = res.data.code;
    } catch (err: unknown) {
      log.epic.error({ err }, 'Error getting exchange code for panel');
      const embed = await createGenericErrorEmbed(err, interaction);
      await interaction.editReply({ embeds: [embed] });
      return;
    }

    const panelUrl = `https://epicgames.com/id/exchange?exchangeCode=${exchangeCode}`;
    const buttonLabel = await translateForUser(userId, 'account.panel.button');
    const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder().setLabel(buttonLabel).setStyle(ButtonStyle.Link).setURL(panelUrl),
    );

    await replyWithAccountEmbed(interaction, userId, {
      style: 'info',
      title: await translateForUser(userId, 'account.panel.title'),
      description: await translateForUser(userId, 'account.panel.description'),
      footerKey: 'security',
      author: authorData,
    }, { components: [row] });

    log.epic.info({ userId, displayName: mainAccount.displayName }, 'Panel access link generated');
  } catch (error: unknown) {
    log.epic.error({ error }, 'Error handling panel subcommand');
    const embed = await createGenericErrorEmbed(error, interaction);
    await interaction.editReply({ embeds: [embed] });
  }
}
