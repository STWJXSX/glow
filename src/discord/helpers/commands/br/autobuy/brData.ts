/**
 * AutoBuy BR — data layer (cosmetics cache, watchlist CRUD).
 */

import axios from 'axios';
import { log } from '#helpers/core/logger.ts';
import AutoBuySelectedItems from '#models/AutoBuySelectedItems.ts';
import UsuarioInfo from '#models/UsuarioInfo.ts';

export interface BrCosmetic {
  id: string;
  name: string;
  type: string;
}

const cosmeticsCache = new Map<string, BrCosmetic[]>();
const cacheExpiry = new Map<string, number>();
const CACHE_TTL_MS = 24 * 60 * 60 * 1000;

export async function getAllBrCosmetics(apiLanguage: string): Promise<BrCosmetic[]> {
  const key = apiLanguage;
  const now = Date.now();

  if (cosmeticsCache.has(key) && now < (cacheExpiry.get(key) ?? 0)) {
    return cosmeticsCache.get(key)!;
  }

  try {
    const response = await axios.get('https://fortnite-api.com/v2/cosmetics/br', {
      params: { language: key },
      timeout: 15000,
    });

    if (response.data?.status !== 200 || !Array.isArray(response.data.data)) {
      return cosmeticsCache.get(key) ?? [];
    }

    const items: BrCosmetic[] = response.data.data
      .filter((c: any) => c.id && c.name)
      .map((c: any) => ({
        id: c.id,
        name: c.name,
        type: c.type?.displayValue ?? 'Item',
      }))
      .sort((a: BrCosmetic, b: BrCosmetic) => a.name.localeCompare(b.name));

    cosmeticsCache.set(key, items);
    cacheExpiry.set(key, now + CACHE_TTL_MS);
    return items;
  } catch (err: any) {
    log.epic.error({ error: err.message }, '[AUTOBUY-BR] Failed to fetch BR cosmetics');
    return cosmeticsCache.get(key) ?? [];
  }
}

export async function resolveMainAccount(discordId: string): Promise<
  | { ok: true; userInfo: NonNullable<Awaited<ReturnType<typeof UsuarioInfo.findOne>>>; mainAccount: any; accountId: string }
  | { ok: false; reason: 'noCuenta' | 'noMain' }
> {
  const userInfo = await UsuarioInfo.findOne({ id: discordId });
  if (!userInfo?.deviceAuths?.length) return { ok: false, reason: 'noCuenta' };
  const mainAccount = userInfo.deviceAuths.find((a: any) => a.cuentaMain);
  if (!mainAccount) return { ok: false, reason: 'noMain' };
  return { ok: true, userInfo, mainAccount, accountId: mainAccount.accountId };
}

export async function getWatchedCosmeticIds(discordId: string, accountId: string): Promise<string[]> {
  const state = await getWatchlistAccountState(discordId, accountId);
  return state.watchedCosmeticIds;
}

export async function getWatchlistAccountState(
  discordId: string,
  accountId: string,
): Promise<{ watchedCosmeticIds: string[]; isActive: boolean }> {
  const doc = await AutoBuySelectedItems.findOne({ discordId });
  const entry = doc?.accounts?.get(accountId);
  return {
    watchedCosmeticIds: entry?.watchedCosmeticIds ?? [],
    isActive: entry?.isActive ?? false,
  };
}

export type AddWatchlistResult =
  | { ok: true; displayName: string; type: string; count: number }
  | { ok: false; reason: 'already' | 'full' | 'notFound'; displayName?: string };

export async function addToWatchlist(
  discordId: string,
  accountId: string,
  cosmeticId: string,
  cosmetic?: BrCosmetic,
): Promise<AddWatchlistResult> {
  let doc = await AutoBuySelectedItems.findOne({ discordId });
  if (!doc) {
    doc = new AutoBuySelectedItems({ discordId, accounts: new Map() });
  }

  let accountEntry = doc.accounts.get(accountId);
  if (!accountEntry) {
    accountEntry = {
      isActive: true,
      accountId,
      watchedCosmeticIds: [],
      createdAt: new Date(),
      lastActivity: new Date(),
    };
  }

  const displayName = cosmetic?.name ?? cosmeticId;
  const type = cosmetic?.type ?? 'Item';

  if (accountEntry.watchedCosmeticIds.includes(cosmeticId)) {
    return { ok: false, reason: 'already', displayName };
  }

  if (accountEntry.watchedCosmeticIds.length >= 50) {
    return { ok: false, reason: 'full' };
  }

  accountEntry.watchedCosmeticIds.push(cosmeticId);
  accountEntry.lastActivity = new Date();
  doc.accounts.set(accountId, accountEntry);
  doc.markModified('accounts');
  await doc.save();

  log.epic.info({ discordId, accountId, cosmeticId, displayName }, '[AUTOBUY-BR] Item added');
  return { ok: true, displayName, type, count: accountEntry.watchedCosmeticIds.length };
}

export type RemoveWatchlistResult =
  | { ok: true; displayName: string; count: number }
  | { ok: false; reason: 'notFound' };

export async function removeFromWatchlist(
  discordId: string,
  accountId: string,
  cosmeticId: string,
  cosmetic?: BrCosmetic,
): Promise<RemoveWatchlistResult> {
  const doc = await AutoBuySelectedItems.findOne({ discordId });
  const accountEntry = doc?.accounts?.get(accountId);

  if (!accountEntry?.watchedCosmeticIds.includes(cosmeticId)) {
    return { ok: false, reason: 'notFound' };
  }

  accountEntry.watchedCosmeticIds = accountEntry.watchedCosmeticIds.filter((id) => id !== cosmeticId);
  accountEntry.lastActivity = new Date();
  doc!.accounts.set(accountId, accountEntry);
  doc!.markModified('accounts');
  await doc!.save();

  const displayName = cosmetic?.name ?? cosmeticId;
  log.epic.info({ discordId, accountId, cosmeticId, displayName }, '[AUTOBUY-BR] Item removed');
  return { ok: true, displayName, count: accountEntry.watchedCosmeticIds.length };
}

export type CosmeticSearchResult =
  | { kind: 'none' }
  | { kind: 'single'; cosmetic: BrCosmetic }
  | { kind: 'multiple'; matches: BrCosmetic[] };

const SEARCH_RESULT_LIMIT = 25;

function rankCosmeticMatch(cosmetic: BrCosmetic, lower: string): number {
  const name = cosmetic.name.toLowerCase();
  const id = cosmetic.id.toLowerCase();
  if (name === lower || id === lower) return 0;
  if (name.startsWith(lower)) return 1;
  if (name.includes(lower)) return 2;
  if (id.includes(lower)) return 3;
  return 4;
}

export function searchCosmetics(cosmetics: BrCosmetic[], query: string): CosmeticSearchResult {
  const trimmed = query.trim();
  if (!trimmed) return { kind: 'none' };

  const lower = trimmed.toLowerCase();
  const byId = cosmetics.find((c) => c.id.toLowerCase() === lower);
  if (byId) return { kind: 'single', cosmetic: byId };

  const exactName = cosmetics.filter((c) => c.name.toLowerCase() === lower);
  if (exactName.length === 1) return { kind: 'single', cosmetic: exactName[0] };
  if (exactName.length > 1) {
    return { kind: 'multiple', matches: exactName.slice(0, SEARCH_RESULT_LIMIT) };
  }

  const partial = cosmetics
    .filter((c) => c.name.toLowerCase().includes(lower) || c.id.toLowerCase().includes(lower))
    .sort((a, b) => {
      const rankDiff = rankCosmeticMatch(a, lower) - rankCosmeticMatch(b, lower);
      if (rankDiff !== 0) return rankDiff;
      return a.name.localeCompare(b.name);
    });

  if (partial.length === 0) return { kind: 'none' };
  if (partial.length === 1) return { kind: 'single', cosmetic: partial[0] };
  return { kind: 'multiple', matches: partial.slice(0, SEARCH_RESULT_LIMIT) };
}
