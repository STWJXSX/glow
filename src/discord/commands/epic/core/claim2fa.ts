/**
 * COMANDO /2FA
 * Reclama el premio por activar 2FA en Fortnite
 */

import { SlashCommandBuilder, ChatInputCommandInteraction } from 'discord.js';
import { log } from '#helpers/core/logger.ts';
import { buildDiscordLocalizations, translateForUser } from '#helpers/locales/index.ts';
import { getEmoji } from '#helpers/core/emojis.ts';
import UsuarioInfo from '#models/UsuarioInfo.ts';
import type { IUsuarioInfo } from '#models/UsuarioInfo.ts';
import { composeMCP } from '#helpers/epic/utils/mcp.ts';
import { guardBulkMode, addBulkOptionToCommand } from '#helpers/core/client/bulkAccess.ts';
import { prepareBulkAccounts, buildBulkAuthErrorField, buildBulkAccountLabel } from '#helpers/epic/social/bulkHelper.ts';
import { sendBulkPaginated, type BulkEmbedField } from '#helpers/core/bulkPaginator.ts';
import type { Command } from '#structures/types.ts';
import {
  replyWithEpicEmbed,
  replyEpicCredentialError,
  replyEpicApiError,
  getEpicAuthor,
  translateEpic,
  epicEmojiLine,
} from '#helpers/commands/epic/epicEmbedHelper.ts';

async function handleBulkClaim2fa(
  interaction: ChatInputCommandInteraction,
  user: IUsuarioInfo,
): Promise<void> {
  const userId = interaction.user.id;
  const client = interaction.client;
  const locale = interaction.locale;
  const emojiEpic = getEmoji(client, 'epic');

  const [claimedLabel, alreadyLabel, failedLabel] = await Promise.all([
    translateForUser(userId, 'claim2fa.embed.description', undefined, locale),
    translateForUser(userId, 'skip.bulk.alreadySkipped', undefined, locale),
    translateForUser(userId, 'skip.bulk.failed', undefined, locale),
  ]);

  const readyAccounts = await prepareBulkAccounts(interaction, user);

  const settled = await Promise.allSettled(
    readyAccounts.map(async ({ account, ok, error: authErr }) => {
      if (!ok) {
        return { account, authError: true as const, error: authErr };
      }

      try {
        await composeMCP({
          profile: 'common_core',
          operation: 'ClaimMfaEnabled',
          accountId: account.accountId,
          accessToken: account.accessToken,
        });
        return { displayName: account.displayName, isMain: account.cuentaMain, ok: true as const, msg: '' };
      } catch (err: any) {
        const code: string = err?.data?.errorCode ?? err?.errorCode ?? '';
        const msg = code.includes('already')
          ? alreadyLabel
          : (err?.data?.errorMessage ?? err?.message ?? failedLabel);
        return { displayName: account.displayName, isMain: account.cuentaMain, ok: false as const, msg };
      }
    }),
  );

  const fields: BulkEmbedField[] = [];
  let ok = 0;
  let fail = 0;

  for (const r of settled) {
    if (r.status === 'rejected') { fail++; continue; }
    const v = r.value;
    if ('authError' in v && v.authError) {
      fail++;
      fields.push(await buildBulkAuthErrorField(client, userId, v.account, v.error, locale));
      continue;
    }
    const label = buildBulkAccountLabel(client, v.displayName, v.isMain);
    if (v.ok) {
      ok++;
      fields.push({ name: label, value: epicEmojiLine(client, 'success', claimedLabel), inline: true });
    } else {
      fail++;
      fields.push({ name: label, value: epicEmojiLine(client, 'error', v.msg), inline: true });
    }
  }

  const title = await translateForUser(userId, 'claim2fa.bulk.title', {
    count: String(readyAccounts.length),
  }, locale);
  const summary = await translateForUser(userId, 'claim2fa.bulk.summary', { ok: String(ok), fail: String(fail) }, locale);

  await sendBulkPaginated(interaction, title, summary, fields, 'success');
}

const command: Command = {
  data: addBulkOptionToCommand(
    new SlashCommandBuilder()
      .setName('2fa')
      .setDescription('Claim the reward for activating 2FA')
      .setNameLocalizations(buildDiscordLocalizations('claim2fa.cmd.name'))
      .setDescriptionLocalizations(buildDiscordLocalizations('claim2fa.cmd.description'))
      .setDMPermission(true),
    'claim2fa.cmd.subcommands.claim.options.bulk.description',
  ) as SlashCommandBuilder,

  auth: true,
  nodefer: false,
  cooldown: 5,

  async execute(interaction: ChatInputCommandInteraction) {
    const userId = interaction.user.id;
    const client = interaction.client;
    const locale = interaction.locale;

    const bulk = interaction.options.getBoolean('bulk') ?? false;
    if (bulk) {
      if (!await guardBulkMode(interaction)) return;
      const user = await UsuarioInfo.findOne({ id: userId });
      if (!user) {
        await replyEpicCredentialError(interaction, userId, 'noCuenta');
        return;
      }
      return handleBulkClaim2fa(interaction, user);
    }

    try {
      const user = await UsuarioInfo.findOne({ id: userId });
      if (!user) {
        await replyEpicCredentialError(interaction, userId, 'noCuenta');
        return;
      }

      const mainAccount = user.deviceAuths.find((acc) => acc.cuentaMain);
      if (!mainAccount) {
        await replyEpicCredentialError(interaction, userId, 'noMain');
        return;
      }

      const authorData = await getEpicAuthor(userId, {
        accountId: mainAccount.accountId,
        accessToken: mainAccount.accessToken,
        displayName: mainAccount.displayName,
      });

      await composeMCP({
        profile: 'common_core',
        operation: 'ClaimMfaEnabled',
        accountId: mainAccount.accountId,
        accessToken: mainAccount.accessToken,
      });

      log.epic.info(`2FA reward claimed for ${mainAccount.displayName}`);

      await replyWithEpicEmbed(interaction, userId, {
        style: 'success',
        description: await translateEpic(client, userId, 'claim2fa.embed.description', 'success', undefined, locale),
        author: authorData,
        footerKey: 'brand',
      });
    } catch (error: unknown) {
      log.epic.error({ error }, 'Error claiming 2FA reward');
      await replyEpicApiError(interaction, userId, error);
    }
  },
};

export default command;
