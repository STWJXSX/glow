import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { join } from 'path';
import { log } from '#helpers/core/logger.ts';
import {
  FALLBACK_LANGUAGE,
  toFortniteApiLanguage,
  type SupportedLanguage,
} from '#helpers/locales/languages.ts';


export type ShopCatalogLanguage = SupportedLanguage;

export interface ShopCatalogItem {
  number: number;
  name: string;
  offerId: string;
  price: number;
  regularPrice?: number;
  type: string;
  rarity: string;
  section: string;
  isBundle: boolean;
  giftable: boolean;
  image?: string | null;
}

export interface ShopCatalog {
  date: string;
  hash: string;
  language: ShopCatalogLanguage;
  generatedAt: string;
  itemCount: number;
  items: ShopCatalogItem[];
}

const SHOP_DIR = join((import.meta.dirname ?? __dirname), '../data/shop');

export function normalizeShopLanguage(language: string): SupportedLanguage {
  return toFortniteApiLanguage(language as SupportedLanguage);
}

export function getShopCatalogPath(language: string): string {
  const lang = normalizeShopLanguage(language);
  return join(SHOP_DIR, `shop_catalog_${lang}.json`);
}

export function getShopDataPath(language: string): string {
  const lang = normalizeShopLanguage(language);
  return join(SHOP_DIR, `shop_data_${lang}.json`);
}

export function readShopDataFile(language: SupportedLanguage): { hash: string; date: string; entries: unknown[] } | null {
  try {
    const filePath = getShopDataPath(language);
    if (!existsSync(filePath)) return null;
    const data = JSON.parse(readFileSync(filePath, 'utf8')) as {
      hash?: string;
      date?: string;
      entries?: unknown[];
    };
    if (!data?.entries?.length) return null;
    return {
      hash: data.hash ?? '',
      date: data.date ?? '',
      entries: data.entries,
    };
  } catch (error) {
    log.epic.warn({ error, language }, '[ShopCatalog] Error leyendo shop_data');
    return null;
  }
}


export function saveShopCatalog(catalog: ShopCatalog): void {
  if (!existsSync(SHOP_DIR)) {
    mkdirSync(SHOP_DIR, { recursive: true });
  }

  const filePath = getShopCatalogPath(catalog.language);
  writeFileSync(filePath, JSON.stringify(catalog, null, 2), 'utf8');
  log.epic.info(`[ShopCatalog] Guardado ${filePath} (${catalog.itemCount} items)`);
}

function readCatalogFile(language: SupportedLanguage): ShopCatalog | null {
  try {
    const filePath = getShopCatalogPath(language);
    if (!existsSync(filePath)) return null;

    const catalog = JSON.parse(readFileSync(filePath, 'utf8')) as ShopCatalog;
    if (!catalog?.items?.length) return null;

    return catalog;
  } catch (error) {
    log.epic.warn({ error, language }, '[ShopCatalog] Error leyendo catálogo');
    return null;
  }
}

/** Load numbered shop catalog for a user language, falling back to English. */
export function loadShopCatalog(language: string): ShopCatalog | null {
  const lang = normalizeShopLanguage(language);
  const catalog = readCatalogFile(lang);
  if (catalog) return catalog;

  if (lang !== FALLBACK_LANGUAGE) {
    return readCatalogFile(FALLBACK_LANGUAGE);
  }

  return null;
}

export function parseShopItemNumber(input: string): number | null {
  const trimmed = input.trim();
  const match = trimmed.match(/^#?(\d+)$/);
  if (!match) return null;

  const number = Number.parseInt(match[1], 10);
  return Number.isFinite(number) && number > 0 ? number : null;
}

export function resolveShopCatalogItem(
  catalog: ShopCatalog | null,
  input: string,
  options: { giftableOnly?: boolean } = {},
): ShopCatalogItem | null {
  if (!catalog?.items?.length || !input?.trim()) return null;

  const { giftableOnly = false } = options;
  const pool = giftableOnly ? catalog.items.filter((item) => item.giftable) : catalog.items;

  // Autocomplete sends the offer id: unlike "#12" it can't point to another item after a shop rotation.
  const offerMatch = input.trim().match(/^offer:(.+)$/);
  if (offerMatch) {
    return pool.find((item) => item.offerId === offerMatch[1]) ?? null;
  }

  const byNumber = parseShopItemNumber(input);
  if (byNumber !== null) {
    return pool.find((item) => item.number === byNumber) ?? null;
  }

  const normalized = input.trim().toLowerCase();
  const exact = pool.find((item) => item.name.toLowerCase() === normalized);
  if (exact) return exact;

  const partialMatches = pool.filter((item) => item.name.toLowerCase().includes(normalized));
  if (partialMatches.length === 1) return partialMatches[0];

  return null;
}

const JAM_TRACK_RARITY = 'Jam Track';
const MAX_KIND_LENGTH = 24;

/**
 * Short cosmetic kind for autocomplete ("Emote", "Outfit", "Jam Track"...).
 * Jam Tracks store the artist(s) in `type`, so they are detected by rarity — otherwise a track and
 * an emote with the same name (e.g. "Hell Again") look identical in the list.
 */
export function catalogItemKindLabel(item: ShopCatalogItem): string {
  const kind = item.rarity === JAM_TRACK_RARITY ? JAM_TRACK_RARITY : (item.type ?? '').trim();
  return kind.length > MAX_KIND_LENGTH ? `${kind.slice(0, MAX_KIND_LENGTH - 1)}…` : kind;
}

export function formatCatalogChoiceLabel(item: ShopCatalogItem): string {
  const prefix = `#${item.number}`;
  const price = `${item.price} V`;
  const kind = catalogItemKindLabel(item);
  // Separators: "prefix · name · kind · price" (3 x " · ") — keep the whole label within Discord's 100.
  const separators = kind ? 9 : 6;
  const maxNameLength = 100 - prefix.length - price.length - kind.length - separators;
  const name =
    item.name.length > maxNameLength
      ? `${item.name.slice(0, Math.max(1, maxNameLength - 2))}..`
      : item.name;

  return kind ? `${prefix} · ${name} · ${kind} · ${price}` : `${prefix} · ${name} · ${price}`;
}

const DEFAULT_AI_SHOP_MAX_CHARS = 6_500;
const DEFAULT_AI_ITEMS_PER_SECTION = 8;
const JAM_SECTION_RE = /pista|jam\s*track|improvis/i;

const SHOP_QUERY_STOPWORDS = new Set([
  'en', 'la', 'el', 'de', 'un', 'una', 'los', 'las', 'del', 'que', 'con', 'por', 'para',
  'esta', 'este', 'está', 'hay', 'como', 'objetos', 'objeto', 'tienda', 'fortnite', 'hoy',
  'the', 'and', 'for', 'shop', 'item', 'esta', 'estan', 'son', 'las', 'que',
]);

function isLowPriorityShopSection(section: string): boolean {
  return JAM_SECTION_RE.test(section);
}

/** Find catalog items matching user question tokens (e.g. "ice spice"). */
export function searchShopCatalogItems(
  catalog: ShopCatalog,
  query: string,
  limit = 16
): ShopCatalogItem[] {
  const normalized = query.toLowerCase();
  const terms = normalized
    .replace(/[^\p{L}\p{N}\s-]/gu, ' ')
    .split(/\s+/)
    .filter((t) => t.length >= 3 && !SHOP_QUERY_STOPWORDS.has(t));

  if (!terms.length) return [];

  const scored: Array<{ item: ShopCatalogItem; score: number }> = [];

  for (const item of catalog.items) {
    const blob = `${item.name} ${item.section} ${item.type}`.toLowerCase();
    let score = 0;
    for (const term of terms) {
      if (blob.includes(term)) score += 1;
    }
    if (normalized.length >= 4 && blob.includes(normalized.replace(/\s+/g, ' ').trim())) {
      score += terms.length;
    }
    if (score > 0) scored.push({ item, score });
  }

  if (terms.length >= 2) {
    scored.sort((a, b) => b.score - a.score || a.item.number - b.item.number);
    const minScore = 2;
    return scored.filter((entry) => entry.score >= minScore).slice(0, limit).map((e) => e.item);
  }

  scored.sort((a, b) => b.score - a.score || a.item.number - b.item.number);
  return scored.slice(0, limit).map((entry) => entry.item);
}
