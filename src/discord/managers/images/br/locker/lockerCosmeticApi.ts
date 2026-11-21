import axios from 'axios';

import { toFortniteApiLanguage, type SupportedLanguage } from '#helpers/locales/languages.ts';

import type { LockerCosmeticType } from './types.ts';

import { VALID_EID_BACKENDS } from './lockerConstants.ts';
import {
  isLocalCatalogAvailable,
  loadLocalCosmeticCatalog,
} from './cosmeticsLocalCatalog.ts';
import type { FortniteApiCosmetic } from './cosmeticsApiTypes.ts';

export type { FortniteApiCosmetic } from './cosmeticsApiTypes.ts';

function mapBrCosmetic(item: Record<string, unknown>): FortniteApiCosmetic | null {
  if (!item?.id) return null;

  const images = item.images as { icon?: string; smallIcon?: string; featured?: string } | undefined;

  return {
    id: String(item.id),
    name: String(item.name ?? item.id),
    rarity: String((item.rarity as { value?: string })?.value ?? 'common').toLowerCase(),
    series: (item.series as { value?: string })?.value ? String((item.series as { value: string }).value).toLowerCase() : null,
    backendType: String((item.type as { backendValue?: string })?.backendValue ?? ''),
    iconUrl: images?.icon ?? images?.smallIcon ?? images?.featured ?? null,
    added: (item.added as string) ?? null,
    source: 'br',
  };
}

function mapCarCosmetic(item: Record<string, unknown>): FortniteApiCosmetic | null {
  if (!item?.id) return null;

  const images = item.images as { small?: string; large?: string } | undefined;

  return {
    id: String(item.id),
    name: String(item.name ?? item.id),
    rarity: String((item.rarity as { value?: string })?.value ?? 'common').toLowerCase(),
    series: (item.series as { value?: string })?.value ? String((item.series as { value: string }).value).toLowerCase() : null,
    backendType: String((item.type as { backendValue?: string })?.backendValue ?? ''),
    iconUrl: images?.small ?? images?.large ?? null,
    added: (item.added as string) ?? null,
    source: 'cars',
  };
}

async function fetchCatalog(lang: SupportedLanguage): Promise<Map<string, FortniteApiCosmetic>> {
  const apiLang = toFortniteApiLanguage(lang);
  const map = new Map<string, FortniteApiCosmetic>();

  const [brRes, carsRes] = await Promise.all([
    axios.get('https://fortnite-api.com/v2/cosmetics/br', {
      params: { language: apiLang },
      timeout: 30_000,
    }),
    axios.get('https://fortnite-api.com/v2/cosmetics/cars', {
      params: { language: apiLang },
      timeout: 30_000,
    }),
  ]);

  for (const item of brRes.data?.data ?? []) {
    const mapped = mapBrCosmetic(item);
    if (mapped) map.set(mapped.id.toLowerCase(), mapped);
  }

  for (const item of carsRes.data?.data ?? []) {
    const mapped = mapCarCosmetic(item);
    if (mapped) map.set(mapped.id.toLowerCase(), mapped);
  }

  return map;
}

export async function loadFortniteCosmeticCatalog(
  lang: SupportedLanguage,
): Promise<Map<string, FortniteApiCosmetic>> {
  if (isLocalCatalogAvailable(lang)) {
    return loadLocalCosmeticCatalog(lang);
  }
  return fetchCatalog(lang);
}

export function resolveApiCosmetic(
  catalog: Map<string, FortniteApiCosmetic>,
  cosmeticId: string,
  backendValue: string,
  needsValidation: boolean,
): FortniteApiCosmetic | null {
  const row = catalog.get(cosmeticId.toLowerCase());
  if (!row) return null;
  if (!needsValidation) return row;
  if (!VALID_EID_BACKENDS.has(row.backendType)) return null;
  if (row.backendType !== backendValue) return null;
  return row;
}

export function normalizeSeriesThemeKey(series: string | null): string | null {
  if (!series) return null;

  const s = series.toLowerCase();
  if (s.includes('marvel')) return 'marvel';
  if (s.includes('star') && s.includes('war')) return 'starwars';
  if (s.includes('gaminglegend') || (s.includes('gaming') && s.includes('legend'))) return 'gaminglegends';
  if (s.includes('frozen') || s.includes('congelad')) return 'frozen';
  if (s.includes('lava')) return 'lava';
  if (s.includes('slurp')) return 'slurp';
  if (s.includes('shadow') || s.includes('sombra')) return 'shadow';
  if (s.includes('dark') || s.includes('oscur')) return 'dark';
  if (s.includes('icon') || s.includes('ídolo') || s.includes('idolo')) return 'icon';
  if (s.includes('dc')) return 'dc';
  if (s.includes('nissan')) return 'gaminglegends';

  return null;
}

export function resolveThemeKey(rarity: string, series: string | null, isExclusive: boolean): string {
  if (isExclusive) return 'exclusive';

  const seriesKey = normalizeSeriesThemeKey(series);
  if (seriesKey) return seriesKey;

  const r = rarity.toLowerCase();
  if (r === 'mythic') return 'mythic';

  return r || 'common';
}

export function mapRawToDisplay(
  raw: { id: string; type: LockerCosmeticType; backendValue: string; needsValidation?: boolean; isFavorite?: boolean },
  catalog: Map<string, FortniteApiCosmetic>,
  isExclusive: boolean,
): { name: string; themeKey: string; iconUrl: string | null; added?: string; isFavorite?: boolean } | null {
  const api = resolveApiCosmetic(catalog, raw.id, raw.backendValue, Boolean(raw.needsValidation));
  if (!api) return null;

  return {
    name: api.name,
    themeKey: resolveThemeKey(api.rarity, api.series, isExclusive),
    iconUrl: api.iconUrl,
    added: api.added ?? undefined,
    isFavorite: raw.isFavorite,
  };
}
