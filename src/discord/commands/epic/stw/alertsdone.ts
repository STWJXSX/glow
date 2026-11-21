/**
 * COMANDO /ALERTS-DONE
 * Shows which mission alerts the user has already completed today.
 */

import {
  SlashCommandBuilder,
  ChatInputCommandInteraction,
  type EmbedBuilder,
} from 'discord.js';
import type { Command } from '#structures/types.ts';
import type { IUsuarioInfo } from '#models/UsuarioInfo.ts';
import { log } from '#helpers/core/logger.ts';
import { getEmoji } from '#helpers/core/emojis.ts';
import { buildDiscordLocalizations, translateForUser } from '#helpers/locales/index.ts';
import UsuarioInfo from '#models/UsuarioInfo.ts';
import { guardBulkMode, addBulkOptionToCommand } from '#helpers/core/client/bulkAccess.ts';
import {
  prepareBulkAccounts,
  buildBulkAuthErrorField,
  buildBulkAccountLabel,
} from '#helpers/epic/social/bulkHelper.ts';
import {
  sendBulkPaginated,
  buildBulkFieldsFromText,
  type BulkEmbedField,
} from '#helpers/core/bulkPaginator.ts';
import {
  getClaimData,
  buildAlertIdMap,
  fetchAlertZones,
  resolveCompletedAlerts,
  formatCompletedAlertLine,
} from '#helpers/epic/stw/alerts/alertsDoneData.ts';
import {
  buildEpicEmbed,
  replyEpicCredentialError,
  replyEpicCustomError,
  replyEpicApiError,
  getEpicAuthor,
  epicSection,
} from '#helpers/commands/epic/epicEmbedHelper.ts';

const logger = log.commands;

async function handleBulkAlertsDone(
  interaction: ChatInputCommandInteraction,
  user: IUsuarioInfo,
): Promise<void> {
  const userId = interaction.user.id;
  const client = interaction.client;
  const locale = interaction.locale;
  const emojiSuccess = getEmoji(client, 'success');
  const noneLabel = await translateForUser(userId, 'alertsdone.noneCompleted', undefined, locale);

  const readyAccounts = await prepareBulkAccounts(interaction, user);
  const okAccounts = readyAccounts.filter((a) => a.ok);
  if (!okAccounts.length) {
    await replyEpicCredentialError(interaction, userId, 'noCuenta');
    return;
  }

  const zones = await fetchAlertZones(okAccounts[0].account.accessToken);
  if (!zones.length) {
    await replyEpicCustomError(interaction, userId, 'alertsdone.noMissions');
    return;
  }

  const alertMap = await buildAlertIdMap(okAccounts[0].account.accessToken, zones);

  const settled = await Promise.allSettled(
    readyAccounts.map(async ({ account, ok, error: authErr }) => {
      if (!ok) return { account, authError: true as const, error: authErr };
      const claimData = await getClaimData(account.accountId, account.accessToken);
      const { completed, unknownCount } = resolveCompletedAlerts(claimData, alertMap);
      return { account, completed, unknownCount, total: claimData.length };
    }),
  );

  const allFields: BulkEmbedField[] = [];
  let grandDone = 0;

  for (const r of settled) {
    if (r.status === 'rejected') continue;
    const v = r.value;
    if ('authError' in v && v.authError) {
      allFields.push(await buildBulkAuthErrorField(client, userId, v.account, v.error, locale));
      continue;
    }

    const label = buildBulkAccountLabel(client, v.account.displayName, v.account.cuentaMain);
    grandDone += v.completed.length;

    if (v.completed.length === 0) {
      allFields.push({ name: label, value: noneLabel, inline: false });
      continue;
    }

    const lines = v.completed.map(({ mission }) => formatCompletedAlertLine(mission, emojiSuccess));
    if (v.unknownCount > 0) {
      const moreLine = await translateForUser(userId, 'alertsdone.bulk.moreUnknown', {
        count: String(v.unknownCount),
      }, locale);
      lines.push(moreLine);
    }

    allFields.push(...buildBulkFieldsFromText(label, lines.join('\n'), false));
  }

  const title = await translateForUser(userId, 'alertsdone.bulk.title', {
    count: String(readyAccounts.length),
  }, locale);
  const summary = await translateForUser(userId, 'alertsdone.bulk.summary', {
    done: String(grandDone),
  }, locale);

  await sendBulkPaginated(interaction, title, summary, allFields, 'info');
}

const command: Command = {
  data: addBulkOptionToCommand(
    new SlashCommandBuilder()
      .setName('alerts-done')
      .setDescription('View which mission alerts you have already completed today')
      .setNameLocalizations(buildDiscordLocalizations('alertsdone.cmd.name'))
      .setDescriptionLocalizations(buildDiscordLocalizations('alertsdone.cmd._1'))
      .setDMPermission(true),
    'alertsdone.bulk.optionDescription',
  ) as SlashCommandBuilder,

  auth: true,
  cooldown: 10,

  async execute(interaction: ChatInputCommandInteraction) {
    const userId = interaction.user.id;
    const client = interaction.client;
    const locale = interaction.locale;
    const bulk = interaction.options.getBoolean('bulk') ?? false;

    if (bulk) {
      if (!await guardBulkMode(interaction)) return;
      const userDb = await UsuarioInfo.findOne({ id: userId });
      if (!userDb) {
        await replyEpicCredentialError(interaction, userId, 'noCuenta');
        return;
      }
      return handleBulkAlertsDone(interaction, userDb);
    }

    try {
      const userDb = await UsuarioInfo.findOne({ id: userId });
      if (!userDb) {
        await replyEpicCredentialError(interaction, userId, 'noCuenta');
        return;
      }

      const mainAccount = userDb.deviceAuths.find((acc: any) => acc.cuentaMain);
      if (!mainAccount) {
        await replyEpicCredentialError(interaction, userId, 'noMain');
        return;
      }

      const account = mainAccount;
      const [claimData, zones] = await Promise.all([
        getClaimData(account.accountId, account.accessToken),
        fetchAlertZones(account.accessToken),
      ]);

      if (zones.length === 0) {
        await replyEpicCustomError(interaction, userId, 'alertsdone.noMissions');
        return;
      }

      const alertMap = await buildAlertIdMap(account.accessToken, zones);
      const emojiSuccess = getEmoji(client, 'success');
      const { completed: completedMissions, unknownCount: unknownIdsCount } =
        resolveCompletedAlerts(claimData, alertMap);

      const authorData = await getEpicAuthor(userId, {
        accountId: account.accountId,
        accessToken: account.accessToken,
        displayName: mainAccount.displayName,
      });

      if (completedMissions.length === 0 && unknownIdsCount === 0) {
        const embed = await buildEpicEmbed(userId, {
          style: 'info',
          description: await translateForUser(userId, 'alertsdone.noneCompleted', undefined, locale),
          author: authorData,
          timestamp: true,
          footerKey: 'brand',
        }, interaction, locale);
        await interaction.editReply({ embeds: [embed] });
        return;
      }

      const lines: string[] = [];
      const title = await translateForUser(userId, 'alertsdone.title', undefined, locale);
      lines.push(epicSection(title));
      lines.push('');

      for (const { mission: m } of completedMissions) {
        lines.push(formatCompletedAlertLine(m, emojiSuccess));
      }

      if (unknownIdsCount > 0) {
        lines.push('', `> +${unknownIdsCount}`);
      }

      const description = lines.join('\n');
      const embeds: EmbedBuilder[] = [];
      const CHUNK = 4000;

      for (let i = 0; i < description.length; i += CHUNK) {
        const chunk = description.slice(i, i + CHUNK);
        const embed = await buildEpicEmbed(userId, {
          style: 'info',
          description: chunk,
          ...(i === 0 ? { author: authorData } : {}),
          footerKey: 'brand',
        }, interaction, locale);
        embeds.push(embed);
      }

      const totalLabel = await translateForUser(userId, 'alertsdone.footer', {
        done: String(completedMissions.length),
        total: String(claimData.length),
      }, locale);
      embeds[embeds.length - 1].setFooter({ text: totalLabel }).setTimestamp();

      await interaction.editReply({ embeds });
    } catch (err: unknown) {
      logger.error({ err }, '[ALERTS-DONE] Unexpected error');
      await replyEpicApiError(interaction, userId, err);
    }
  },
};

export default command;
