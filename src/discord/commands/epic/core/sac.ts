/**
 * COMANDO /SAC
 * Set or remove the Support-A-Creator (affiliate) code on your account.
 */

import { SlashCommandBuilder, ChatInputCommandInteraction } from 'discord.js';
import { buildDiscordLocalizations, translateForUser } from '#helpers/locales/index.ts';
import type { Command } from '#structures/types.ts';
import type { IUsuarioInfo } from '#models/UsuarioInfo.ts';
import { log } from '#helpers/core/logger.ts';
import { composeMCP } from '#helpers/epic/utils/mcp.ts';
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
  replyEpicApiError,
  getEpicAuthor,
  translateEpic,
  epicEmojiLine,
} from '#helpers/commands/epic/epicEmbedHelper.ts';

const logger = log.commands;

async function handleBulkSac(
  interaction: ChatInputCommandInteraction,
  user: IUsuarioInfo,
  affiliateName: string,
  mode: 'add' | 'remove',
): Promise<void> {
  const userId = interaction.user.id;
  const client = interaction.client;
  const locale = interaction.locale;
  const successKey = mode === 'add' ? 'sac.add.success' : 'sac.remove.success';
  const successVars = mode === 'add' ? { code: affiliateName } : undefined;
  const failedLabel = await translateForUser(userId, 'bulkMode.failed', undefined, locale);

  const readyAccounts = await prepareBulkAccounts(interaction, user);
  const settled = await Promise.allSettled(
    readyAccounts.map(async ({ account, ok, error: authErr }) => {
      if (!ok) return { account, authError: true as const, error: authErr };
      try {
        await composeMCP({
          profile: 'common_core',
          operation: 'SetAffiliateName',
          accountId: account.accountId,
          accessToken: account.accessToken,
          body: { affiliateName },
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
      const msg = await translateEpic(client, userId, successKey, 'success', successVars, locale);
      fields.push({ name: label, value: msg, inline: true });
    } else {
      fields.push({ name: label, value: epicEmojiLine(client, 'error', failedLabel), inline: true });
    }
  }

  const title = await translateForUser(userId, 'sac.bulk.title', {
    count: String(readyAccounts.length),
  }, locale);
  const summaryKey = mode === 'add' ? 'sac.bulk.summaryAdd' : 'sac.bulk.summaryRemove';
  const summaryVars = mode === 'add' ? { code: affiliateName } : undefined;
  const summary = await translateForUser(userId, summaryKey, summaryVars, locale);

  await sendBulkPaginated(interaction, title, summary, fields, 'success');
}

async function handleSacAdd(interaction: ChatInputCommandInteraction): Promise<void> {
  const userId = interaction.user.id;
  const client = interaction.client;
  const locale = interaction.locale;
  const code = interaction.options.getString('code', true).trim();
  const bulk = interaction.options.getBoolean('bulk') ?? false;

  if (bulk) {
    if (!await guardBulkMode(interaction)) return;
    const userDb = await UsuarioInfo.findOne({ id: userId });
    if (!userDb) {
      await replyEpicCredentialError(interaction, userId, 'noCuenta');
      return;
    }
    return handleBulkSac(interaction, userDb, code, 'add');
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
    await composeMCP({
      profile: 'common_core',
      operation: 'SetAffiliateName',
      accountId: mainAccount.accountId,
      accessToken: mainAccount.accessToken,
      body: { affiliateName: code },
    });

    const authorData = await getEpicAuthor(userId, {
      accountId: mainAccount.accountId,
      accessToken: mainAccount.accessToken,
      displayName: mainAccount.displayName,
    });

    await replyWithEpicEmbed(interaction, userId, {
      style: 'success',
      description: await translateEpic(client, userId, 'sac.add.success', 'success', { code }, locale),
      author: authorData,
      timestamp: true,
      footerKey: 'brand',
    });
  } catch (err: unknown) {
    logger.error({ error: err }, '[SAC] SetAffiliateName error');
    await replyEpicApiError(interaction, userId, err);
  }
}

async function handleSacRemove(interaction: ChatInputCommandInteraction): Promise<void> {
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
    return handleBulkSac(interaction, userDb, '', 'remove');
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
    await composeMCP({
      profile: 'common_core',
      operation: 'SetAffiliateName',
      accountId: mainAccount.accountId,
      accessToken: mainAccount.accessToken,
      body: { affiliateName: '' },
    });

    const authorData = await getEpicAuthor(userId, {
      accountId: mainAccount.accountId,
      accessToken: mainAccount.accessToken,
      displayName: mainAccount.displayName,
    });

    await replyWithEpicEmbed(interaction, userId, {
      style: 'success',
      description: await translateEpic(client, userId, 'sac.remove.success', 'success', undefined, locale),
      author: authorData,
      timestamp: true,
      footerKey: 'brand',
    });
  } catch (err: unknown) {
    logger.error({ error: err }, '[SAC] Remove affiliate error');
    await replyEpicApiError(interaction, userId, err);
  }
}

const command: Command = {
  data: new SlashCommandBuilder()
    .setName('sac')
    .setDescription('Manage your Support-A-Creator code')
    .setNameLocalizations(buildDiscordLocalizations('sac.cmd.name'))
    .setDescriptionLocalizations(buildDiscordLocalizations('sac.cmd.description'))
    .setDMPermission(true)
    .addSubcommand(sub =>
      addBulkOption(
        sub
          .setName('add')
          .setDescription('Set a Support-A-Creator code on your account')
          .setNameLocalizations(buildDiscordLocalizations('sac.cmd.subcommands.add.name'))
          .setDescriptionLocalizations(buildDiscordLocalizations('sac.cmd.subcommands.add.description'))
          .addStringOption(opt =>
            opt
              .setName('code')
              .setDescription('Creator code to support')
              .setNameLocalizations(buildDiscordLocalizations('sac.cmd.subcommands.add.options.code.name'))
              .setDescriptionLocalizations(buildDiscordLocalizations('sac.cmd.subcommands.add.options.code.description'))
              .setRequired(true),
          ),
        'sac.bulk.optionDescriptionAdd',
      ),
    )
    .addSubcommand(sub =>
      addBulkOption(
        sub
          .setName('remove')
          .setDescription('Remove the current Support-A-Creator code from your account')
          .setNameLocalizations(buildDiscordLocalizations('sac.cmd.subcommands.remove.name'))
          .setDescriptionLocalizations(buildDiscordLocalizations('sac.cmd.subcommands.remove.description')),
        'sac.bulk.optionDescriptionRemove',
      ),
    ) as SlashCommandBuilder,

  auth: true,
  cooldown: 5,

  async execute(interaction: ChatInputCommandInteraction) {
    const sub = interaction.options.getSubcommand();
    if (sub === 'add') {
      await handleSacAdd(interaction);
    } else if (sub === 'remove') {
      await handleSacRemove(interaction);
    }
  },
};

export default command;
