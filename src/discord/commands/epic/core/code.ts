/**
 * COMANDO /CODE
 * Subcommands:
 *   /code redeem <code> — Redeem an Epic Games / Fortnite code via Fulfillment Service.
 */

import { SlashCommandBuilder, ChatInputCommandInteraction } from 'discord.js';
import axios from 'axios';
import type { Command } from '#structures/types.ts';
import type { IUsuarioInfo } from '#models/UsuarioInfo.ts';
import { log } from '#helpers/core/logger.ts';
import { buildDiscordLocalizations, translateForUser } from '#helpers/locales/index.ts';
import UsuarioInfo from '#models/UsuarioInfo.ts';
import { guardBulkMode, addBulkOption } from '#helpers/core/client/bulkAccess.ts';
import {
  prepareBulkAccounts,
  buildBulkAuthErrorField,
  buildBulkAccountLabel,
} from '#helpers/epic/social/bulkHelper.ts';
import { sendBulkPaginated, type BulkEmbedField } from '#helpers/core/bulkPaginator.ts';
import {
  replyWithEpicEmbed,
  replyEpicCredentialError,
  replyEpicCustomError,
  replyEpicApiError,
  getEpicAuthor,
  translateEpic,
  epicSection,
  epicEmojiLine,
} from '#helpers/commands/epic/epicEmbedHelper.ts';

const logger = log.commands;
const FULFILLMENT_BASE = 'https://fulfillment-public-service-prod.ol.epicgames.com/fulfillment/api/public/accounts';

async function handleBulkRedeem(
  interaction: ChatInputCommandInteraction,
  user: IUsuarioInfo,
  rawCode: string,
  cleanCode: string,
): Promise<void> {
  const userId = interaction.user.id;
  const client = interaction.client;
  const locale = interaction.locale;
  const failedLabel = await translateForUser(userId, 'bulkMode.failed', undefined, locale);

  const readyAccounts = await prepareBulkAccounts(interaction, user);
  const settled = await Promise.allSettled(
    readyAccounts.map(async ({ account, ok, error: authErr }) => {
      if (!ok) return { account, authError: true as const, error: authErr };
      try {
        const url = `${FULFILLMENT_BASE}/${account.accountId}/codes/${encodeURIComponent(cleanCode)}`;
        await axios.post(url, {}, {
          headers: {
            Authorization: `Bearer ${account.accessToken}`,
            'Content-Type': 'application/json',
          },
          timeout: 15_000,
        });
        return { account, ok: true as const };
      } catch {
        return { account, ok: false as const };
      }
    }),
  );

  const fields: BulkEmbedField[] = [];
  for (const r of settled) {
    if (r.status === 'rejected') continue;
    const v = r.value;
    if ('authError' in v && v.authError) {
      fields.push(await buildBulkAuthErrorField(client, userId, v.account, v.error, locale));
      continue;
    }
    const label = buildBulkAccountLabel(client, v.account.displayName, v.account.cuentaMain);
    if (v.ok) {
      const msg = await translateEpic(client, userId, 'code.redeem.success', 'success', { code: rawCode }, locale);
      fields.push({ name: label, value: msg, inline: true });
    } else {
      fields.push({ name: label, value: epicEmojiLine(client, 'error', failedLabel), inline: true });
    }
  }

  const title = await translateForUser(userId, 'code.bulk.title', {
    count: String(readyAccounts.length),
  }, locale);
  const summary = await translateForUser(userId, 'code.bulk.summary', { code: rawCode }, locale);
  await sendBulkPaginated(interaction, title, summary, fields, 'success');
}

async function handleRedeem(interaction: ChatInputCommandInteraction): Promise<void> {
  const userId = interaction.user.id;
  const client = interaction.client;
  const locale = interaction.locale;
  const rawCode = interaction.options.getString('code', true).trim();
  const bulk = interaction.options.getBoolean('bulk') ?? false;

  const cleanCode = rawCode.replace(/-/g, '').trim();
  if (!cleanCode) {
    await replyEpicCustomError(interaction, userId, 'code.errors.invalidCode');
    return;
  }

  if (bulk) {
    if (!await guardBulkMode(interaction)) return;
    const userDb = await UsuarioInfo.findOne({ id: userId });
    if (!userDb) {
      await replyEpicCredentialError(interaction, userId, 'noCuenta');
      return;
    }
    return handleBulkRedeem(interaction, userDb, rawCode, cleanCode);
  }

  const userDb = await UsuarioInfo.findOne({ id: userId });
  if (!userDb) {
    await replyEpicCredentialError(interaction, userId, 'noCuenta');
    return;
  }

  const mainAccount = userDb.deviceAuths.find((a: any) => a.cuentaMain);
  if (!mainAccount) {
    await replyEpicCredentialError(interaction, userId, 'noMain');
    return;
  }

  try {
    const url = `${FULFILLMENT_BASE}/${mainAccount.accountId}/codes/${encodeURIComponent(cleanCode)}`;
    const { data } = await axios.post(url, {}, {
      headers: {
        Authorization: `Bearer ${mainAccount.accessToken}`,
        'Content-Type': 'application/json',
      },
      timeout: 15_000,
    });

    const authorData = await getEpicAuthor(userId, {
      accountId: mainAccount.accountId,
      accessToken: mainAccount.accessToken,
      displayName: mainAccount.displayName,
    });

    const [successLine, unknownItem] = await Promise.all([
      translateEpic(client, userId, 'code.redeem.success', 'success', { code: rawCode }, locale),
      translateForUser(userId, 'code.redeem.unknownItem', undefined, locale),
    ]);
    const details: string[] = [successLine];

    if (data?.offerId) {
      const offerLabel = await translateForUser(userId, 'code.redeem.offerId', undefined, locale);
      details.push(`- **${offerLabel}:** \`${data.offerId}\``);
    }

    if (Array.isArray(data?.details) && data.details.length > 0) {
      const rewardsTitle = await translateForUser(userId, 'code.redeem.detailsTitle', undefined, locale);
      details.push('', epicSection(rewardsTitle));
      for (const d of data.details) {
        const name = d.entitlementName || unknownItem;
        details.push(epicEmojiLine(client, 'success', name));
      }
    }

    await replyWithEpicEmbed(interaction, userId, {
      style: 'success',
      description: details.join('\n'),
      author: authorData,
      timestamp: true,
      footerKey: 'brand',
    });
  } catch (err: unknown) {
    logger.error({ error: err, code: rawCode }, '[CODE] redeem error');
    await replyEpicApiError(interaction, userId, err);
  }
}

const command: Command = {
  data: new SlashCommandBuilder()
    .setName('code')
    .setDescription('Manage Epic Games codes')
    .setNameLocalizations(buildDiscordLocalizations('code.cmd.name'))
    .setDescriptionLocalizations(buildDiscordLocalizations('code.cmd.description'))
    .setDMPermission(true)
    .addSubcommand(sub =>
      addBulkOption(
        sub
          .setName('redeem')
          .setDescription('Redeem an Epic Games / Fortnite code')
          .setNameLocalizations(buildDiscordLocalizations('code.cmd.subcommands.redeem.name'))
          .setDescriptionLocalizations(buildDiscordLocalizations('code.cmd.subcommands.redeem.description'))
          .addStringOption(opt =>
            opt
              .setName('code')
              .setDescription('The code to redeem')
              .setNameLocalizations(buildDiscordLocalizations('code.cmd.subcommands.redeem.options.code.name'))
              .setDescriptionLocalizations(buildDiscordLocalizations('code.cmd.subcommands.redeem.options.code.description'))
              .setRequired(true),
          ),
        'code.bulk.optionDescription',
      ),
    ) as SlashCommandBuilder,

  auth: true,
  cooldown: 5,

  async execute(interaction: ChatInputCommandInteraction) {
    const sub = interaction.options.getSubcommand();
    if (sub === 'redeem') {
      await handleRedeem(interaction);
    }
  },
};

export default command;
