import type { ChatInputCommandInteraction } from 'discord.js';
import { copyAllPlatformSettingsBetweenAccounts } from '#helpers/epic/fortnite/clientSettingsCloud.ts';
import {
  replyEpicCredentialError,
  replyEpicCustomError,
  replyWithEpicEmbed,
  getEpicAuthor,
} from '../epicEmbedHelper.ts';
import { translateForUser } from '#helpers/locales/index.ts';
import { ACCOUNT_SENTINEL_NONE, resolveLinkedAccountById } from './cloudconfigAccounts.ts';
import { formatTransferResultLines } from './formatResults.ts';

export async function handleCloudconfigTransferAccount(
  interaction: ChatInputCommandInteraction,
): Promise<void> {
  const userId = interaction.user.id;
  const locale = interaction.locale;
  const sourceId = interaction.options.getString('source', true);
  const targetId = interaction.options.getString('target', true);

  if (sourceId === targetId || sourceId === ACCOUNT_SENTINEL_NONE || targetId === ACCOUNT_SENTINEL_NONE) {
    await replyEpicCustomError(interaction, userId, 'cloudconfig.errors.sameAccount');
    return;
  }

  const sourceRes = await resolveLinkedAccountById(userId, sourceId);
  if ('error' in sourceRes) {
    if (sourceRes.error === 'no_accounts') {
      await replyEpicCredentialError(interaction, userId, 'noCuenta');
      return;
    }
    await replyEpicCustomError(interaction, userId, 'cloudconfig.errors.token');
    return;
  }

  const targetRes = await resolveLinkedAccountById(userId, targetId);
  if ('error' in targetRes) {
    await replyEpicCustomError(interaction, userId, 'cloudconfig.errors.token');
    return;
  }

  const results = await copyAllPlatformSettingsBetweenAccounts(
    sourceRes.account.accessToken,
    sourceRes.account.accountId,
    targetRes.account.accessToken,
    targetRes.account.accountId,
  );

  const okCount = results.filter((r) => r.ok).length;
  const author = await getEpicAuthor(userId, {
    accountId: sourceRes.account.accountId,
    accessToken: sourceRes.account.accessToken,
    displayName: sourceRes.account.displayName ?? sourceRes.account.accountId,
  });

  const body = await formatTransferResultLines(userId, results, locale);
  const warn = await translateForUser(userId, 'cloudconfig.warnings.crossPlatform', undefined, locale);
  const summary = await translateForUser(
    userId,
    'cloudconfig.transferAccount.summary',
    {
      source: sourceRes.account.displayName ?? sourceRes.account.accountId,
      target: targetRes.account.displayName ?? targetRes.account.accountId,
      ok: String(okCount),
      total: String(results.length),
    },
    locale,
  );

  await replyWithEpicEmbed(interaction, userId, {
    style: okCount > 0 ? 'success' : 'warning',
    title: await translateForUser(userId, 'cloudconfig.transferAccount.title', undefined, locale),
    description: `${summary}\n\n${body}\n\n${warn}`,
    author,
    footerKey: 'sensitive',
  });
}
