/**
 * BR Item Shop fetch via fortnite-api.com — per-language with in-memory cache.
 */

import axios from 'axios';
import {
  FALLBACK_LANGUAGE,
  toFortniteApiLanguage,
  type FortniteApiLanguage,
  type SupportedLanguage,
} from '#helpers/locales/languages.ts';

const SHOP_API_BASE = 'https://fortnite-api.com/v2/shop';
const REQUEST_TIMEOUT_MS = 20_000;

export interface BrShopCosmetic {
  cosmeticId: string;
  itemName: string;
  itemType: string;
  itemImage: string | null;
  itemRarity: string;
  finalPrice: number;
  offerId: string;
}

export interface BrShopEntry extends BrShopCosmetic {
  devName?: string;
}

function shopUrl(language: FortniteApiLanguage): string {
  return `${SHOP_API_BASE}?language=${encodeURIComponent(language)}`;
}

function parseBrItem(entry: any, brItem: any): Omit<BrShopCosmetic, 'cosmeticId'> & { cosmeticId: string } {
  return {
    cosmeticId: brItem.id,
    offerId: entry.offerId,
    finalPrice: entry.finalPrice ?? 0,
    itemName: brItem.name || 'Unknown Item',
    itemType: brItem.type?.displayValue || 'Item',
    itemImage:
      brItem.images?.featured ||
      brItem.images?.icon ||
      brItem.images?.smallIcon ||
      null,
    itemRarity: brItem.rarity?.displayValue || 'Common',
  };
}

async function fetchShopRaw(language: FortniteApiLanguage): Promise<any[]> {
  const response = await axios.get(shopUrl(language), { timeout: REQUEST_TIMEOUT_MS });
  if (response.status !== 200 || response.data?.status !== 200) {
    throw new Error(`Shop API returned status ${response.data?.status ?? response.status}`);
  }
  return response.data?.data?.entries ?? [];
}

const cosmeticMapCache = new Map<FortniteApiLanguage, Map<string, BrShopCosmetic>>();
const freeItemsCache = new Map<FortniteApiLanguage, BrShopEntry[]>();

/** Clear caches (e.g. between cron runs). */
export function clearBrShopCache(): void {
  cosmeticMapCache.clear();
  freeItemsCache.clear();
}

/**
 * cosmeticId → shop row for a user language.
 * Falls back to English when the API request for the requested language fails.
 */
export async function fetchBrShopCosmeticMap(
  lang: SupportedLanguage,
): Promise<Map<string, BrShopCosmetic>> {
  const apiLang = toFortniteApiLanguage(lang);
  if (cosmeticMapCache.has(apiLang)) {
    return cosmeticMapCache.get(apiLang)!;
  }

  try {
    const entries = await fetchShopRaw(apiLang);
    const map = new Map<string, BrShopCosmetic>();
    for (const entry of entries) {
      if (!entry.brItems?.length || !entry.offerId) continue;
      for (const brItem of entry.brItems) {
        if (!brItem.id || map.has(brItem.id)) continue;
        map.set(brItem.id, parseBrItem(entry, brItem));
      }
    }
    cosmeticMapCache.set(apiLang, map);
    return map;
  } catch (err) {
    if (apiLang !== FALLBACK_LANGUAGE) {
      return fetchBrShopCosmeticMap(FALLBACK_LANGUAGE);
    }
    throw err;
  }
}

/** Free BR shop entries for a user language. */
export async function fetchBrFreeShopItems(lang: SupportedLanguage): Promise<BrShopEntry[]> {
  const apiLang = toFortniteApiLanguage(lang);
  if (freeItemsCache.has(apiLang)) {
    return freeItemsCache.get(apiLang)!;
  }

  let entries: any[];
  try {
    entries = await fetchShopRaw(apiLang);
  } catch (err) {
    if (apiLang !== FALLBACK_LANGUAGE) {
      return fetchBrFreeShopItems(FALLBACK_LANGUAGE);
    }
    throw err;
  }

  const freeItems: BrShopEntry[] = [];
  for (const entry of entries) {
    if (entry.finalPrice !== 0 || !entry.brItems?.length || !entry.offerId) continue;
    const mainItem = entry.brItems[0];
    freeItems.push({
      ...parseBrItem(entry, mainItem),
      devName: entry.devName || 'Unknown',
    });
  }

  freeItemsCache.set(apiLang, freeItems);
  return freeItems;
}

export function getBrShopApiUrl(lang: SupportedLanguage): string {
  return shopUrl(toFortniteApiLanguage(lang));
}
