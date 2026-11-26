/**
 * COMANDO /TAXI — friend requests from all mission taxi bots to your logged-in Epic accounts.
 */

import { SlashCommandBuilder, ChatInputCommandInteraction } from 'discord.js';
import { log } from '#helpers/core/logger.ts';
import { generarEmbedError } from '#helpers/core/generarEmbedError.ts';
import { createSuccessEmbed, createInfoEmbed } from '#helpers/core/embedHelper.ts';
import { getEmoji } from '#helpers/core/emojis.ts';
import { translateForUser, buildDiscordLocalizations } from '#helpers/locales/index.ts';
import type { Command } from '#structures/types.ts';
import UsuarioInfo from '#models/UsuarioInfo.ts';
import { syncTaxiFriendRequests } from '#helpers/epic/stw/taxiFriendSync.ts';

const command: Command = {
  data: new SlashCommandBuilder()
    .setName('taxi')
    .setDescription('Mission taxi bots — add all taxis as friends on your Epic accounts')
    .setNameLocalizations(buildDiscordLocalizations('taxi.cmd.name'))
    .setDescriptionLocalizations(buildDiscordLocalizations('taxi.cmd._1'))
    .addSubcommand((sub) =>
      sub
        .setName('friendall')
        .setDescription('Add all taxi bots as friends on your logged-in Epic accounts')
        .setNameLocalizations(buildDiscordLocalizations('taxi.cmd.friendall.name'))
        .setDescriptionLocalizations(buildDiscordLocalizations('taxi.cmd.friendall._1')),
    ),

  async execute(interaction: ChatInputCommandInteraction) {
    try {
      await handleFriendAll(interaction);
    } catch (error) {
      log.commands.error({ error }, 'Error ejecutando comando taxi');

      const embed = await generarEmbedError('custom', {
        descripcion: await translateForUser(
          interaction.user.id,
          'taxi.command.executeError',
          undefined,
          interaction.locale,
        ),
        client: interaction.client,
        interaction,
      });

      if (interaction.deferred || interaction.replied) {
        await interaction.editReply({ embeds: [embed] });
      } else {
        await interaction.reply({ embeds: [embed], ephemeral: true });
      }
    }
  },
};

async function handleFriendAll(interaction: ChatInputCommandInteraction) {
  const userId = interaction.user.id;
  const locale = interaction.locale;
  const t = (key: string, replacements?: Record<string, string | number>) =>
    translateForUser(userId, key, replacements, locale);

  const userInfo = await UsuarioInfo.findOne({ id: userId });
  if (!userInfo?.deviceAuths?.length) {
    const embed = await generarEmbedError('custom', {
      descripcion: await t('taxi.command.registerFirst'),
      client: interaction.client,
      interaction,
    });
    await interaction.editReply({ embeds: [embed] });
    return;
  }

  const syncResult = await syncTaxiFriendRequests(userId);

  const fields: Array<{ name: string; value: string; inline: boolean }> = [
    {
      name: await t('taxi.command.friendallFieldAccounts'),
      value: `${syncResult.accountCount}`,
      inline: true,
    },
    {
      name: await t('taxi.command.friendallFieldTaxis'),
      value: `${syncResult.taxiCount}`,
      inline: true,
    },
    {
      name: await t('taxi.command.friendallFieldSent'),
      value: `${syncResult.sent.length}`,
      inline: true,
    },
    {
      name: await t('taxi.command.friendallFieldAlready'),
      value: `${syncResult.alreadyFriends}`,
      inline: true,
    },
    {
      name: await t('taxi.command.friendallFieldPending'),
      value: `${syncResult.pending}`,
      inline: true,
    },
    {
      name: await t('taxi.command.friendallFieldFailed'),
      value: `${syncResult.errors.length}`,
      inline: true,
    },
  ];

  if (syncResult.skippedNoAuth.length > 0) {
    fields.push({
      name: await t('taxi.command.friendallMissingAuthTitle'),
      value: await t('taxi.command.friendallMissingAuthDesc', {
        accounts: syncResult.skippedNoAuth.map((name) => `**${name}**`).join(', '),
      }),
      inline: false,
    });
  }

  const sentPreview = syncResult.sent
    .slice(0, 10)
    .map((entry) => `• **${entry.accountName}** → ${entry.taxiName}`)
    .join('\n');

  const errorPreview = syncResult.errors
    .slice(0, 5)
    .map((entry) => `• **${entry.accountName}** → ${entry.taxiName}: ${entry.message}`)
    .join('\n');

  let description = await t('taxi.command.friendallDesc', {
    sent: syncResult.sent.length,
    already: syncResult.alreadyFriends,
    pending: syncResult.pending,
    failed: syncResult.errors.length,
  });

  if (sentPreview) {
    description += `\n\n${await t('taxi.command.friendallSentPreview')}\n${sentPreview}`;
    if (syncResult.sent.length > 10) {
      description += `\n${await t('taxi.command.friendallMore', { count: syncResult.sent.length - 10 })}`;
    }
  }

  if (errorPreview) {
    description += `\n\n${await t('taxi.command.friendallErrorsPreview')}\n${errorPreview}`;
  }

  const successEmoji = getEmoji(interaction.client, 'success');
  const style =
    syncResult.sent.length > 0 || syncResult.alreadyFriends > 0 || syncResult.pending > 0
      ? 'success'
      : 'info';

  const embed =
    style === 'success'
      ? await createSuccessEmbed({
          title: `${successEmoji} ${await t('taxi.command.friendallTitle')}`,
          description,
          fields,
          footer: 'user',
          timestamp: true,
          interaction,
        })
      : await createInfoEmbed({
          title: `${successEmoji} ${await t('taxi.command.friendallTitle')}`,
          description,
          fields,
          footer: 'user',
          timestamp: true,
          interaction,
        });

  await interaction.editReply({ embeds: [embed] });
}

export default command;
