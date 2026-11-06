import type { ChatInputCommandInteraction } from 'discord.js';
import { copyPlatformSettingsOnAccount } from '#helpers/epic/fortnite/clientSettingsCloud.ts';
import {
  replyEpicCredentialError,
  replyEpicCustomError,
  replyWithEpicEmbed,
  getEpicAuthor,
} from '../epicEmbedHelper.ts';
import { translateForUser } from '#helpers/locales/index.ts';
import { resolveLinkedAccount } from './cloudconfigAccounts.ts';
import { resolvePlatformId } from './cloudconfigPlatforms.ts';
import { formatTransferResultLines } from './formatResults.ts';

export async function handleCloudconfigTransferPlatform(
  interaction: ChatInputCommandInteraction,
): Promise<void> {
  const userId = interaction.user.id;
  const locale = interaction.locale;
  const fromId = interaction.options.getString('from', true);
  const toId = interaction.options.getString('to', true);
  const accountOpt = interaction.options.getString('account');

  const from = resolvePlatformId(fromId);
  const to = resolvePlatformId(toId);
  if (!from.ok || !to.ok) {
    await replyEpicCustomError(interaction, userId, 'cloudconfig.errors.invalidPlatform');
    return;
  }
  if (from.platform!.id === to.platform!.id) {
    await replyEpicCustomError(interaction, userId, 'cloudconfig.errors.samePlatform');
    return;
  }

  const resolved = await resolveLinkedAccount(userId, accountOpt);
  if ('error' in resolved) {
    if (resolved.error === 'no_accounts') {
      await replyEpicCredentialError(interaction, userId, 'noCuenta');
      return;
    }
    if (resolved.error === 'no_main') {
      await replyEpicCredentialError(interaction, userId, 'noMain');
      return;
    }
    await replyEpicCustomError(interaction, userId, 'cloudconfig.errors.token');
    return;
  }

  const { account } = resolved;
  const result = await copyPlatformSettingsOnAccount(
    account.accessToken,
    account.accountId,
    from.platform!,
    to.platform!,
  );

  const author = await getEpicAuthor(userId, {
    accountId: account.accountId,
    accessToken: account.accessToken,
    displayName: account.displayName ?? account.accountId,
  });

  const body = await formatTransferResultLines(userId, [result], locale);
  const warn = await translateForUser(userId, 'cloudconfig.warnings.crossPlatform', undefined, locale);

  await replyWithEpicEmbed(interaction, userId, {
    style: result.ok ? 'success' : 'warning',
    title: await translateForUser(userId, 'cloudconfig.transferPlatform.title', undefined, locale),
    description: `${body}\n\n${warn}`,
    author,
    footerKey: 'sensitive',
  });
}
