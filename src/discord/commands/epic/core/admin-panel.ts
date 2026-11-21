/**
 * COMANDO /admin-panel
 * Redeems Fortnite root codes via MCP ExecuteTerminalCommand (athena profile).
 */

import { SlashCommandBuilder, ChatInputCommandInteraction } from 'discord.js';
import type { Command } from '#structures/types.ts';
import type { IUsuarioInfo } from '#models/UsuarioInfo.ts';
import UsuarioInfo from '#models/UsuarioInfo.ts';
import { buildDiscordLocalizations, translateForUser } from '#helpers/locales/index.ts';
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
import { callCoreWithTimeout } from '#api/glowCore.ts';
import {
  DEFAULT_ROOT_CODES,
  type RootRedeemResult,
  type RootResultKind,
} from '#helpers/commands/epic/adminPanel/types.ts';
import {
  epicEmojiLine,
  getEpicAuthor,
  replyEpicApiError,
  replyEpicCredentialError,
  replyWithEpicEmbed,
} from '#helpers/commands/epic/epicEmbedHelper.ts';

function resultEmojiKey(kind: RootResultKind): 'success' | 'error' {
  if (kind === 'invalid' || kind === 'error') return 'error';
  return 'success';
}

function resultEmbedStyle(kind: RootResultKind): 'success' | 'error' {
  return kind === 'error' ? 'error' : 'success';
}

function bulkEmbedStyle(results: Array<{ kind: RootResultKind }>): 'success' | 'error' {
  return results.some((result) => result.kind === 'error') ? 'error' : 'success';
}

async function resultLabel(
  interaction: ChatInputCommandInteraction,
  userId: string,
  kind: RootResultKind,
): Promise<string> {
  const key = kind === 'lobbyOnly' ? 'adminPanel.result.lobbyOnly' : `adminPanel.result.${kind}`;
  return translateForUser(userId, key, undefined, interaction.locale);
}

async function formatCodeResultLine(
  interaction: ChatInputCommandInteraction,
  userId: string,
  code: string,
  kind: RootResultKind,
): Promise<string> {
  const label = await resultLabel(interaction, userId, kind);
  return epicEmojiLine(
    interaction.client,
    resultEmojiKey(kind),
    `\`${code}\` — ${label}`,
  );
}

async function handleBulkAdminPanel(
  interaction: ChatInputCommandInteraction,
  user: IUsuarioInfo,
  rawCode?: string,
): Promise<void> {
  const userId = interaction.user.id;
  const client = interaction.client;
  const locale = interaction.locale;
  const failedLabel = await translateForUser(userId, 'bulkMode.failed', undefined, locale);

  const readyAccounts = await prepareBulkAccounts(interaction, user);
  const settled = await Promise.allSettled(
    readyAccounts.map(async ({ account, ok, error: authErr }) => {
      if (!ok) {
        return { account, authError: true as const, error: authErr };
      }

      try {
        const { results } = await callCoreWithTimeout<{ results: RootRedeemResult[] }>(
          'admin-panel.redeem',
          10 * 60_000,
          {
            accountId: account.accountId,
            accessToken: account.accessToken,
            code: rawCode || undefined,
          },
        );

        if (rawCode) {
          const kind = results[0]?.kind ?? 'error';
          const line = await formatCodeResultLine(interaction, userId, rawCode, kind);
          return { account, ok: true as const, text: line };
        }

        const lines = await Promise.all(
          results.map((result) => formatCodeResultLine(interaction, userId, result.code, result.kind)),
        );
        return { account, ok: true as const, text: lines.join('\n') };
      } catch {
        return { account, ok: false as const, text: failedLabel };
      }
    }),
  );

  const fields: BulkEmbedField[] = [];
  let accountFailures = 0;

  for (const result of settled) {
    if (result.status === 'rejected') {
      accountFailures++;
      continue;
    }

    const value = result.value;
    if ('authError' in value && value.authError) {
      accountFailures++;
      fields.push(await buildBulkAuthErrorField(client, userId, value.account, value.error, locale));
      continue;
    }

    const label = buildBulkAccountLabel(client, value.account.displayName, value.account.cuentaMain);
    if (value.ok) {
      fields.push(...buildBulkFieldsFromText(label, value.text, false));
      continue;
    }

    accountFailures++;
    fields.push({
      name: label,
      value: epicEmojiLine(client, 'error', value.text),
      inline: true,
    });
  }

  const title = await translateForUser(
    userId,
    'adminPanel.bulk.title',
    { count: String(readyAccounts.length) },
    locale,
  );
  const summaryKey = rawCode ? 'adminPanel.bulk.summarySingle' : 'adminPanel.bulk.summaryAll';
  const summaryVars: Record<string, string> = rawCode
    ? { code: rawCode }
    : { total: String(DEFAULT_ROOT_CODES.length) };
  const summary = await translateForUser(userId, summaryKey, summaryVars, locale);

  await sendBulkPaginated(
    interaction,
    title,
    summary,
    fields,
    accountFailures > 0 ? 'error' : 'success',
  );
}

const command: Command = {
  data: addBulkOptionToCommand(
    new SlashCommandBuilder()
      .setName('admin-panel')
      .setDescription('Redeem Fortnite root codes on your main account')
      .setNameLocalizations(buildDiscordLocalizations('adminPanel.cmd.name'))
      .setDescriptionLocalizations(buildDiscordLocalizations('adminPanel.cmd._1'))
      .addStringOption((option) =>
        option
          .setName('code')
          .setDescription('Root code to redeem (omit to redeem all default codes)')
          .setNameLocalizations(buildDiscordLocalizations('adminPanel.cmd.options.code.name'))
          .setDescriptionLocalizations(buildDiscordLocalizations('adminPanel.cmd.options.code._1'))
          .setRequired(false)
          .setMaxLength(64),
      )
      .setDMPermission(true),
    'adminPanel.bulk.optionDescription',
  ) as SlashCommandBuilder,

  auth: true,
  cooldown: 10,

  async execute(interaction: ChatInputCommandInteraction) {
    const userId = interaction.user.id;
    const locale = interaction.locale;
    const rawCode = interaction.options.getString('code')?.trim();
    const bulk = interaction.options.getBoolean('bulk') ?? false;

    if (bulk) {
      if (!await guardBulkMode(interaction)) return;

      const userDb = await UsuarioInfo.findOne({ id: userId });
      if (!userDb) {
        await replyEpicCredentialError(interaction, userId, 'noCuenta');
        return;
      }

      return handleBulkAdminPanel(interaction, userDb, rawCode || undefined);
    }

    const userDb = await UsuarioInfo.findOne({ id: userId });
    if (!userDb) {
      await replyEpicCredentialError(interaction, userId, 'noCuenta');
      return;
    }

    const mainAccount = userDb.deviceAuths.find((account) => account.cuentaMain);
    if (!mainAccount) {
      await replyEpicCredentialError(interaction, userId, 'noMain');
      return;
    }

    const author = await getEpicAuthor(userId, {
      accountId: mainAccount.accountId,
      accessToken: mainAccount.accessToken,
      displayName: mainAccount.displayName,
    });

    try {
      if (rawCode) {
        const { results } = await callCoreWithTimeout<{ results: RootRedeemResult[] }>(
          'admin-panel.redeem',
          10 * 60_000,
          {
            accountId: mainAccount.accountId,
            accessToken: mainAccount.accessToken,
            code: rawCode,
          },
        );
        const kind = results[0]?.kind ?? 'error';
        const line = await formatCodeResultLine(interaction, userId, rawCode, kind);

        await replyWithEpicEmbed(interaction, userId, {
          style: resultEmbedStyle(kind),
          fields: [
            {
              name: await translateForUser(userId, 'adminPanel.fields.codesStatus', undefined, locale),
              value: line,
              inline: false,
            },
          ],
          author,
          footerKey: 'brand',
        });
        return;
      }

      const { results } = await callCoreWithTimeout<{ results: RootRedeemResult[] }>(
        'admin-panel.redeem',
        10 * 60_000,
        {
          accountId: mainAccount.accountId,
          accessToken: mainAccount.accessToken,
        },
      );

      const [codesStatusTitle, lines] = await Promise.all([
        translateForUser(userId, 'adminPanel.fields.codesStatus', undefined, locale),
        Promise.all(results.map((result) => formatCodeResultLine(interaction, userId, result.code, result.kind))),
      ]);

      await replyWithEpicEmbed(interaction, userId, {
        style: bulkEmbedStyle(results),
        fields: [
          {
            name: codesStatusTitle,
            value: lines.join('\n'),
            inline: false,
          },
        ],
        author,
        footerKey: 'brand',
      });
    } catch (error) {
      await replyEpicApiError(interaction, userId, error);
    }
  },
};

export default command;
