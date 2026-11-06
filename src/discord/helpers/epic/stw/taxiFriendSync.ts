import axios from 'axios';
import { log } from '#helpers/core/logger.ts';
import { Endpoints } from '#helpers/core/endpoints.ts';
import { refreshAccountToken } from '../auth/tokenRefresh.ts';
import UsuarioInfo from '#models/UsuarioInfo.ts';
import { TAXI_BOT_CATALOG } from './taxiBotCatalog.ts';

export interface TaxiFriendSyncResult {
  sent: Array<{ accountName: string; taxiName: string }>;
  alreadyFriends: number;
  pending: number;
  errors: Array<{ accountName: string; taxiName: string; message: string }>;
  skippedNoAuth: string[];
  taxiCount: number;
  accountCount: number;
}

async function getFriendAccountIds(accountId: string, accessToken: string): Promise<Set<string>> {
  const { data } = await axios.get<Array<{ accountId: string }>>(
    `${Endpoints.FRIENDS}/${accountId}/friends`,
    { headers: { Authorization: `Bearer ${accessToken}` }, timeout: 10_000 },
  );
  return new Set((data ?? []).map((entry) => entry.accountId));
}

async function getOutgoingAccountIds(accountId: string, accessToken: string): Promise<Set<string>> {
  const { data: summary } = await axios.get<{ outgoing?: Array<{ accountId: string }> }>(
    `${Endpoints.FRIENDS}/${accountId}/summary`,
    { headers: { Authorization: `Bearer ${accessToken}` }, timeout: 15_000 },
  );
  return new Set((summary?.outgoing ?? []).map((entry) => entry.accountId));
}

export async function syncTaxiFriendRequests(userId: string): Promise<TaxiFriendSyncResult> {
  const userInfo = await UsuarioInfo.findOne({ id: userId });
  const linkedAccounts = userInfo?.deviceAuths ?? [];
  const taxiBots = [...TAXI_BOT_CATALOG];

  const result: TaxiFriendSyncResult = {
    sent: [],
    alreadyFriends: 0,
    pending: 0,
    errors: [],
    skippedNoAuth: [],
    taxiCount: taxiBots.length,
    accountCount: linkedAccounts.length,
  };

  if (!userInfo || linkedAccounts.length === 0) {
    return result;
  }

  for (const linked of linkedAccounts) {
    const accountName = linked.displayName || linked.accountId;
    const { account, error } = await refreshAccountToken(userInfo, linked.accountId);
    if (!account?.accessToken) {
      result.skippedNoAuth.push(accountName);
      log.commands.warn(
        { userId, accountId: linked.accountId, error },
        '[Taxi] friendall: no access token for linked account',
      );
      continue;
    }

    let friendIds: Set<string>;
    let outgoingIds: Set<string>;

    try {
      [friendIds, outgoingIds] = await Promise.all([
        getFriendAccountIds(account.accountId, account.accessToken),
        getOutgoingAccountIds(account.accountId, account.accessToken),
      ]);
    } catch (error) {
      log.commands.error(
        { error, accountId: linked.accountId },
        '[Taxi] friendall: failed to fetch friends summary',
      );
      result.errors.push({
        accountName,
        taxiName: '*',
        message: 'Failed to load friends list',
      });
      continue;
    }

    for (const taxi of taxiBots) {
      if (friendIds.has(taxi.accountId)) {
        result.alreadyFriends += 1;
        continue;
      }

      if (outgoingIds.has(taxi.accountId)) {
        result.pending += 1;
        continue;
      }

      try {
        await axios.post(
          `${Endpoints.FRIENDS}/${account.accountId}/friends/${taxi.accountId}`,
          {},
          { headers: { Authorization: `Bearer ${account.accessToken}` }, timeout: 10_000 },
        );
        result.sent.push({ accountName, taxiName: taxi.displayName });
      } catch (err: any) {
        const message =
          err?.response?.data?.errorMessage ||
          err?.response?.data?.errorCode ||
          err?.message ||
          'Unknown error';

        const normalized = String(message).toLowerCase();
        if (normalized.includes('already') || normalized.includes('pending')) {
          result.pending += 1;
          continue;
        }

        result.errors.push({
          accountName,
          taxiName: taxi.displayName,
          message: String(message),
        });
      }
    }
  }

  return result;
}
