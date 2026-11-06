import axios from 'axios';
import type { ShopCatalog, ShopCatalogItem } from '../helpers/epic/br/shop/shopCatalog.ts';

const SHOP_URL = 'https://fortnite-api.com/v2/shop?language=en';
const CACHE_TTL_MS = 5 * 60 * 1000;

let cached: { catalog: ShopCatalog | null; fetchedAt: number } = {
  catalog: null,
  fetchedAt: 0,
};

function entryDisplayName(entry: any): string {
  if (entry.bundle?.name) return entry.bundle.name;
  const br = entry.brItems?.[0];
  if (br?.name) return br.name;
  if (entry.tracks?.[0]?.title) return entry.tracks[0].title;
  if (entry.instruments?.[0]?.name) return entry.instruments[0].name;
  if (entry.cars?.[0]?.name) return entry.cars[0].name;
  return entry.devName || 'Item';
}

function entryImage(entry: any): string | null {
  const br = entry.brItems?.[0];
  return br?.images?.featured || br?.images?.icon || br?.images?.smallIcon || null;
}

function entryType(entry: any): string {
  const br = entry.brItems?.[0];
  return br?.type?.displayValue || entry.layout?.name || 'Item';
}

function entryRarity(entry: any): string {
  const br = entry.brItems?.[0];
  return br?.rarity?.displayValue || 'Common';
}

/** Current item-shop day (the shop rotates at 00:00 UTC). */
export function currentShopDayUtc(): string {
  return new Date().toISOString().slice(0, 10);
}

/** True when the catalog belongs to today's shop (numbers/offers still valid). */
export function isCurrentShopCatalog(catalog: ShopCatalog | null): boolean {
  return !!catalog && catalog.date === currentShopDayUtc();
}

function buildCatalogFromEntries(entries: any[], shopDate?: string): ShopCatalog {
  const items: ShopCatalogItem[] = [];
  let number = 1;
  for (const entry of entries) {
    if (!entry.giftable || !entry.offerId) continue;
    const price = entry.finalPrice ?? entry.regularPrice ?? 0;
    if (!Number.isFinite(price) || price <= 0) continue;
    items.push({
      number,
      name: entryDisplayName(entry),
      offerId: entry.offerId,
      price,
      regularPrice: entry.regularPrice,
      type: entryType(entry),
      rarity: entryRarity(entry),
      section: entry.section?.displayName || entry.section?.id || '',
      isBundle: !!(entry.bundle || (entry.brItems?.length > 1)),
      giftable: true,
      image: entryImage(entry),
    });
    number += 1;
  }
  return {
    // The API's own shop date: right after 00:00 UTC it can still serve yesterday's shop.
    date: (shopDate ?? new Date().toISOString()).slice(0, 10),
    hash: '',
    language: 'en',
    generatedAt: new Date().toISOString(),
    itemCount: items.length,
    items,
  };
}

async function fetchShopEntries(): Promise<{ entries: any[]; date?: string }> {
  const headers: Record<string, string> = {};
  const apiKey = process.env.FORTNITE_API_KEY?.trim();
  if (apiKey) headers.Authorization = apiKey;
  const { data } = await axios.get(SHOP_URL, { headers, timeout: 20_000 });
  if (data?.status !== 200 || !data?.data?.entries?.length) {
    throw new Error(`fortnite-api shop status ${data?.status ?? 'unknown'}`);
  }
  return { entries: data.data.entries, date: data.data.date };
}

/** Item shop from fortnite-api.com (English names/prices). */
export async function loadEnglishFortniteShopCatalog(forceRefresh = false): Promise<ShopCatalog | null> {
  const now = Date.now();
  if (
    !forceRefresh
    && cached.catalog
    && now - cached.fetchedAt < CACHE_TTL_MS
    && isCurrentShopCatalog(cached.catalog)
  ) {
    return cached.catalog;
  }
  try {
    const { entries, date } = await fetchShopEntries();
    const catalog = buildCatalogFromEntries(entries, date);
    cached = { catalog, fetchedAt: now };
    return catalog;
  } catch {
    return cached.catalog;
  }
}

let refreshInFlight: Promise<ShopCatalog | null> | null = null;

function refreshCatalogInBackground(): Promise<ShopCatalog | null> {
  if (!refreshInFlight) {
    refreshInFlight = loadEnglishFortniteShopCatalog(true).finally(() => {
      refreshInFlight = null;
    });
  }
  return refreshInFlight;
}

/**
 * Catalog for autocomplete, which must answer Discord within 3s. Never blocks on the
 * shop download: a stale catalog is returned at once (and refreshed in the background);
 * with no catalog at all it waits at most `maxWaitMs`, then returns null ("loading").
 */
export async function getShopCatalogForAutocomplete(maxWaitMs = 1500): Promise<ShopCatalog | null> {
  const current = isCurrentShopCatalog(cached.catalog);
  const fresh = current && Date.now() - cached.fetchedAt < CACHE_TTL_MS;
  if (fresh) return cached.catalog;

  const refresh = refreshCatalogInBackground();
  // A slightly old catalog of TODAY's shop is fine; yesterday's never is.
  if (current) return cached.catalog;

  return Promise.race([
    refresh.then((c) => (isCurrentShopCatalog(c) ? c : null)),
    new Promise<null>((resolve) => setTimeout(() => resolve(null), maxWaitMs)),
  ]);
}

/** Keeps the catalog warm so autocomplete always has one (call once at startup). */
export function startShopCatalogWarmer(): void {
  void refreshCatalogInBackground();
  setInterval(() => void refreshCatalogInBackground(), CACHE_TTL_MS - 30_000).unref?.();
}

export function filterGiftCatalogForAutocomplete(
  catalog: ShopCatalog | null,
  focusedValue: string,
): ShopCatalogItem[] {
  if (!catalog?.items?.length) return [];
  const normalized = focusedValue.trim().toLowerCase();
  const match = focusedValue.trim().match(/^#?(\d+)$/);
  const byNumber = match ? Number.parseInt(match[1], 10) : null;

  let items = catalog.items.filter((item) => item.giftable);
  if (byNumber !== null && Number.isFinite(byNumber)) {
    items = items.filter((item) => String(item.number).startsWith(String(byNumber)));
  } else if (normalized) {
    items = items.filter(
      (item) =>
        item.name.toLowerCase().includes(normalized) ||
        String(item.number).includes(normalized.replace('#', '')),
    );
  }
  return items.slice(0, 25);
}
