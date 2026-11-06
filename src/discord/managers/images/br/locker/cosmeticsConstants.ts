import path from 'path';

export const COSMETIC_SECTIONS = [
  'br',
  'tracks',
  'instruments',
  'cars',
  'lego',
  'legoKits',
  'beans',
] as const;

export type CosmeticSection = (typeof COSMETIC_SECTIONS)[number];

export const COSMETICS_ASSETS_DIR = path.join((import.meta.dirname ?? __dirname), 'assets', 'cosmetics');
export const COSMETICS_CATALOG_DIR = path.join(COSMETICS_ASSETS_DIR, 'catalog');
export const COSMETICS_META_DIR = path.join(COSMETICS_ASSETS_DIR, 'meta');
export const COSMETICS_IMAGES_DIR = path.join(COSMETICS_ASSETS_DIR, 'images');

export const COSMETICS_MANIFEST_FILE = 'cosmetics-manifest.json';
export const COSMETICS_INDEX_FILE = 'cosmetics-index.json';

export const FORTNITE_COSMETICS_URL = 'https://fortnite-api.com/v2/cosmetics';
export const FORTNITE_COSMETICS_NEW_URL = 'https://fortnite-api.com/v2/cosmetics/new';

/** Daily sync before Epic shop reset (00:00 UTC). */
export const COSMETICS_SYNC_CRON_UTC = '0 21 * * *';

export const LOCAL_COSMETIC_URL_PREFIX = '@cosmetic/';
