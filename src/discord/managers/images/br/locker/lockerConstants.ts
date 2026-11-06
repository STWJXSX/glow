import type { LockerCosmeticType } from './types.ts';

/** Modern square grid constants — validated 104px tiles, 6px gaps */
export const LOCKER_TILE_SIZE = 104;
export const LOCKER_TILE_GAP = 6;
/** @deprecated use resolveLockerGridCols() — kept as outfit max cols */
export const LOCKER_GRID_COLS = 24;
export const LOCKER_PAD_X = 28;
export const LOCKER_PAD_Y = 24;
export const LOCKER_PAD_BOTTOM = 28;
/** @deprecated use LOCKER_PAD_X / LOCKER_PAD_Y */
export const LOCKER_PAD = LOCKER_PAD_Y;
/** Header container height */
export const LOCKER_HEADER_REF_H = 176;
export const LOCKER_HEADER_H = 176;
export const LOCKER_HEADER_MAX_H = 176;
export const LOCKER_HEADER_MIN_H = 176;
export const LOCKER_AVATAR_SIZE = 112;
/** ~174px @ 2180px grid; ~72px @ 330px (16 skins). */
export const LOCKER_HEADER_GRID_RATIO = 0.22;
/** Rendered category icon size @ reference header. */
export const LOCKER_HEADER_ICON_SIZE = 116;
export const LOCKER_HEADER_ICON_LEFT_PAD = 18;
/** Thin vertical divider — spans icon asset band, not full header bar. */
export const LOCKER_HEADER_DIVIDER_W = 3;
export const LOCKER_HEADER_DIVIDER_BOTTOM_PAD_RATIO = 0.05;
export const LOCKER_HEADER_DIVIDER_GAP = 32;
export const LOCKER_HEADER_COUNT_SIZE = 70;
export const LOCKER_HEADER_COUNT_EXCLUSIVE_RATIO = 0.84;
/** Anton digits — no horizontal stretch. */
export const LOCKER_HEADER_COUNT_SCALE_X = 1;
export const LOCKER_HEADER_GRID_GAP = 20;
export const LOCKER_SITE_LABEL = 'glowhaven.site';
/** Footer text block uses ~58% of footer height (2 lines). */
export const LOCKER_FOOTER_TEXT_BLOCK_RATIO = 0.58;
export const LOCKER_FOOTER_TEXT_SCALE_X = 1.08;
/** Extra space between footer glyph centers. */
export const LOCKER_FOOTER_LETTER_SPACING_RATIO = 0.038;
export const LOCKER_FOOTER_REF_H = 150;
export const LOCKER_FOOTER_H = 150;
export const LOCKER_FOOTER_MIN_H = 150;
export const LOCKER_FOOTER_MAX_H = 150;
/** ~11.5% of grid height — ~253px @ 2200px grid (534 skins). */
export const LOCKER_FOOTER_GRID_RATIO = 0.115;
/** Footer content baselines — tied to tile so they grow with locker density. */
export const LOCKER_FOOTER_ICON_TILE_RATIO = 0.58;
export const LOCKER_FOOTER_TEXT_TILE_RATIO = 0.175;
export const LOCKER_NAME_BAR_H = Math.round(LOCKER_TILE_SIZE * 0.218);
export const LOCKER_LABEL_FONT_SIZE = Math.round(LOCKER_TILE_SIZE * 0.127);
/** Shrink font / extra lines — never negative tracking or horizontal squeeze. */
export const LOCKER_LABEL_MIN_FONT_SIZE = 6;
export const LOCKER_LABEL_MAX_LINES = 3;
/** @deprecated scaleX disabled — kept for API compat */
export const LOCKER_LABEL_MIN_SCALE_X = 1;
export const LOCKER_LABEL_SUPERSAMPLE = 1;
export const LOCKER_UI_SUPERSAMPLE = 2;
export const LOCKER_LABEL_PAD_X = 5;
/** Parallelism — tuned for large lockers (500+ tiles). */
export const LOCKER_TILE_CONCURRENCY = 48;
export const LOCKER_ROW_PACK_CONCURRENCY = 24;
export const LOCKER_PORTRAIT_PREFETCH_CONCURRENCY = 128;
export const LOCKER_OUTPUT_WEBP = {
  quality: 90,
  effort: 1,
  nearLossless: false,
  smartSubsample: true,
} as const;

export const TYPE_MAPPING: Record<LockerCosmeticType, { prefix: string; backendValue: string }> = {
  outfit: { prefix: 'AthenaCharacter:', backendValue: 'AthenaCharacter' },
  backpack: { prefix: 'AthenaBackpack:', backendValue: 'AthenaBackpack' },
  pickaxe: { prefix: 'AthenaPickaxe:', backendValue: 'AthenaPickaxe' },
  glider: { prefix: 'AthenaGlider:', backendValue: 'AthenaGlider' },
  emote: { prefix: 'AthenaDance:', backendValue: 'AthenaDance' },
  spray: { prefix: 'AthenaDance:', backendValue: 'AthenaSpray' },
  emoticon: { prefix: 'AthenaDance:', backendValue: 'AthenaEmoji' },
  toy: { prefix: 'AthenaDance:', backendValue: 'AthenaToy' },
  wrap: { prefix: 'AthenaItemWrap:', backendValue: 'AthenaItemWrap' },
  music: { prefix: 'AthenaMusicPack:', backendValue: 'AthenaMusicPack' },
  loadingscreen: { prefix: 'AthenaLoadingScreen:', backendValue: 'AthenaLoadingScreen' },
  contrail: { prefix: 'AthenaSkyDiveContrail:', backendValue: 'AthenaSkyDiveContrail' },
  companion: { prefix: 'CosmeticMimosa:', backendValue: 'CosmeticCompanion' },
  shoes: { prefix: 'CosmeticShoes:', backendValue: 'CosmeticShoes' },
  vehicle: { prefix: 'VehicleCosmetics_Skin:', backendValue: 'VehicleCosmetics_Skin' },
};

export const TYPE_ORDER: LockerCosmeticType[] = [
  'outfit', 'backpack', 'pickaxe', 'glider', 'emote', 'spray', 'emoticon', 'toy',
  'wrap', 'music', 'loadingscreen', 'contrail', 'companion', 'shoes', 'vehicle',
];

export const EID_TYPES = new Set<LockerCosmeticType>(['emote', 'spray', 'emoticon', 'toy']);
export const VALID_EID_BACKENDS = new Set(['AthenaDance', 'AthenaSpray', 'AthenaEmoji', 'AthenaToy']);

export const SERIES_THEME_MAP: Record<string, string> = {
  marvel: 'marvel',
  dc: 'dc',
  starwars: 'starwars',
  gaminglegends: 'gaminglegends',
  icon: 'icon',
  shadow: 'shadow',
  dark: 'dark',
  slurp: 'slurp',
  frozen: 'frozen',
  lava: 'lava',
};

export const RARITY_WEIGHTS: Record<string, number> = {
  gaminglegends: 200,
  marvel: 190,
  starwars: 180,
  dc: 170,
  icon: 160,
  dark: 150,
  shadow: 140,
  slurp: 130,
  frozen: 120,
  lava: 110,
  legendary: 100,
  epic: 90,
  rare: 80,
  uncommon: 70,
  common: 60,
  default: 50,
};

export function getRarityWeight(key: string): number {
  return RARITY_WEIGHTS[key.toLowerCase()] ?? 50;
}
