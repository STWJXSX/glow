/**
 * BULK ACCOUNT HELPER
 * Refreshes every device auth for a user in parallel.
 * Used by bulk mode of epic commands.
 */

import type { Client, ChatInputCommandInteraction } from 'discord.js';
import type { IDeviceAuth, IUsuarioInfo } from '#models/UsuarioInfo.ts';
import UsuarioInfo from '#models/UsuarioInfo.ts';
import { refreshAccountToken } from '../auth/tokenRefresh.ts';
import { log } from '#helpers/core/logger.ts';
import { translateForUser } from '#helpers/locales/index.ts';
import { getEmoji } from '#helpers/core/emojis.ts';
import { createErrorEmbed } from '#helpers/core/embedHelper.ts';

export interface ReadyAccount {
  account: IDeviceAuth;
  ok: boolean;
  error?: string;
}

export type BulkEmbedField = { name: string; value: string; inline?: boolean };

/**
 * Refreshes all device auths in a user document concurrently.
 * Always returns one entry per account; ok=false when refresh fails.
 */
export async function refreshAllAccounts(userDb: IUsuarioInfo): Promise<ReadyAccount[]> {
  if (!userDb.deviceAuths?.length) return [];

  const settled = await Promise.allSettled(
    userDb.deviceAuths.map((acc) => refreshAccountToken(userDb, acc.accountId)),
  );

  const ready: ReadyAccount[] = [];
  for (const [i, result] of settled.entries()) {
    if (result.status === 'fulfilled') {
      const { account, error } = result.value;
      ready.push(account && !error
        ? { account, ok: true }
        : { account: userDb.deviceAuths[i], ok: false, error: error ?? 'tokenFailure' });
      continue;
    }

    // Every refresh saves the same user document, so when several tokens expire at once
    // mongoose rejects all but one save with ParallelSaveError. Retry those one by one.
    try {
      const { account, error } = await refreshAccountToken(userDb, userDb.deviceAuths[i].accountId);
      ready.push(account && !error
        ? { account, ok: true }
        : { account: userDb.deviceAuths[i], ok: false, error: error ?? 'tokenFailure' });
    } catch (err) {
      log.epic.warn({ err, firstErr: result.reason }, '[bulkHelper] Account refresh failed');
      ready.push({ account: userDb.deviceAuths[i], ok: false, error: 'unknown' });
    }
  }
  return ready;
}

function bulkAuthErrorKey(error?: string): string {
  if (error === 'tokenFailure') return 'bulkMode.authExpired';
  if (error === 'networkError') return 'bulkMode.networkError';
  return 'bulkMode.authFailed';
}

/** Localized auth error text for a single account field in bulk mode. */
export async function formatBulkAuthError(
  userId: string,
  error?: string,
  locale?: string | null,
): Promise<string> {
  return translateForUser(userId, bulkAuthErrorKey(error), undefined, locale);
}

/** Account field name with Epic emoji and optional main marker. */
export function buildBulkAccountLabel(
  client: Client,
  displayName: string,
  isMain: boolean,
  mainMarker = '*',
): string {
  const emojiEpic = getEmoji(client, 'epic');
  return `${emojiEpic} ${displayName}${isMain ? ` ${mainMarker}` : ''}`;
}

/** Ready-made field when an account failed token refresh in bulk mode. */
export async function buildBulkAuthErrorField(
  client: Client,
  userId: string,
  account: IDeviceAuth,
  error?: string,
  locale?: string | null,
): Promise<BulkEmbedField> {
  const msg = await formatBulkAuthError(userId, error, locale);
  const emojiError = getEmoji(client, 'error');
  return {
    name: buildBulkAccountLabel(client, account.displayName, account.cuentaMain),
    value: `${emojiError} ${msg}`,
    inline: true,
  };
}
/**
 * Refreshes all accounts, handles token failures, returns ready list.
 * Re-fetch user after removals so callers get current deviceAuths count.
 */
export async function prepareBulkAccounts(
  interaction: ChatInputCommandInteraction,
  userDb: IUsuarioInfo,
): Promise<ReadyAccount[]> {
  const readyAccounts = await refreshAllAccounts(userDb);
  await handleTokenFailures(interaction, userDb, readyAccounts);
  return readyAccounts;
}

/**
 * Deletes accounts with tokenFailure from the user's DB and sends a DM notification.
 * Only removes accounts where error === 'tokenFailure'.
 */
export async function handleTokenFailures(
  interaction: ChatInputCommandInteraction,
  userDb: IUsuarioInfo,
  readyAccounts: ReadyAccount[],
): Promise<void> {
  const tokenFailed = readyAccounts.filter(a => !a.ok && a.error === 'tokenFailure');
  if (!tokenFailed.length) return;

  const failedIds = new Set(tokenFailed.map(a => a.account.accountId));
  const freshUser = await UsuarioInfo.findOne({ id: userDb.id });
  if (freshUser) {
    const wasMainDeleted = tokenFailed.some(a => a.account.cuentaMain);
    freshUser.deviceAuths = freshUser.deviceAuths.filter(
      (a: any) => !failedIds.has(a.accountId),
    ) as any;
    if (wasMainDeleted && freshUser.deviceAuths.length > 0) {
      (freshUser.deviceAuths[0] as any).cuentaMain = true;
    }
    await freshUser.save();
  }

  const userId = interaction.user.id;
  const locale = interaction.locale;
  const accountList = tokenFailed.map(a => `• **${a.account.displayName}**`).join('\n');

  const title = await translateForUser(userId, 'bulkMode.accountsRemoved.title', undefined, locale);
  const description = await translateForUser(
    userId,
    'bulkMode.accountsRemoved.description',
    { accounts: accountList },
    locale,
  );

  try {
    const discordUser = await interaction.client.users.fetch(interaction.user.id);
    const embed = await createErrorEmbed({ title, description, timestamp: true });
    await discordUser.send({ embeds: [embed] });
  } catch {
    // DM failed (user has DMs closed or other error)
  }
}
