import type { LockerCosmeticType } from './types.ts';
import {
  LOCKER_FOOTER_GRID_RATIO,
  LOCKER_FOOTER_MAX_H,
  LOCKER_FOOTER_MIN_H,
  LOCKER_FOOTER_REF_H,
  LOCKER_FOOTER_TEXT_BLOCK_RATIO,
  LOCKER_HEADER_COUNT_SCALE_X,
  LOCKER_HEADER_COUNT_SIZE,
  LOCKER_HEADER_DIVIDER_GAP,
  LOCKER_HEADER_DIVIDER_W,
  LOCKER_HEADER_GRID_RATIO,
  LOCKER_HEADER_ICON_LEFT_PAD,
  LOCKER_HEADER_ICON_SIZE,
  LOCKER_HEADER_MAX_H,
  LOCKER_HEADER_MIN_H,
  LOCKER_HEADER_REF_H,
} from './lockerConstants.ts';

/** Typical max cols (medium lockers). */
export const LOCKER_GRID_MAX_COLS: Record<LockerCosmeticType, number> = {
  outfit: 14,
  backpack: 12,
  pickaxe: 12,
  glider: 11,
  emote: 10,
  spray: 15,
  emoticon: 15,
  toy: 12,
  wrap: 12,
  music: 10,
  loadingscreen: 15,
  contrail: 12,
  companion: 12,
  shoes: 12,
  vehicle: 14,
};

/** Hard cap — wide grid for huge lockers (534+ skins). */
export const LOCKER_GRID_HARD_MAX_COLS: Record<LockerCosmeticType, number> = {
  outfit: 28,
  backpack: 22,
  pickaxe: 22,
  glider: 20,
  emote: 16,
  spray: 24,
  emoticon: 24,
  toy: 20,
  wrap: 20,
  music: 16,
  loadingscreen: 24,
  contrail: 20,
  companion: 20,
  shoes: 20,
  vehicle: 22,
};

/** Target max rows — single image widens cols instead of paginating. */
export const LOCKER_MAX_GRID_ROWS = 72;

/**
 * StormyChecker-style dynamic cols:
 * - 1–3 items → width = item count (no empty strip)
 * - medium → sqrt grid (~10 cols @ 70 skins)
 * - large → more cols, balanced aspect (534 → ~20–28 cols, not 13×42 rows)
 */
export function resolveLockerGridCols(itemCount: number, categoryType: LockerCosmeticType): number {
  if (itemCount <= 0) return 1;
  if (itemCount <= 3) return itemCount;

  // Square 1:1 aspect ratio grid (cols ≈ rows)
  let cols = Math.ceil(Math.sqrt(itemCount));

  const minCols = categoryType === 'outfit' ? 6 : 5;
  cols = Math.max(minCols, Math.min(itemCount, cols));

  const hardMax = LOCKER_GRID_HARD_MAX_COLS[categoryType] ?? 36;
  cols = Math.min(cols, hardMax);

  const rows = Math.ceil(itemCount / cols);
  if (rows > LOCKER_MAX_GRID_ROWS) {
    cols = Math.ceil(itemCount / LOCKER_MAX_GRID_ROWS);
  }

  return Math.max(1, Math.min(itemCount, cols));
}

export function resolveLockerGridRows(itemCount: number, cols: number): number {
  return Math.ceil(itemCount / Math.max(1, cols));
}

export function resolveLockerGridPixelSize(
  cols: number,
  rows: number,
  tileSize: number,
  tileGap: number,
): { width: number; height: number } {
  const width = cols * tileSize + Math.max(0, cols - 1) * tileGap;
  const height = rows * tileSize + Math.max(0, rows - 1) * tileGap;
  return { width, height };
}

export interface LockerHeaderMetrics {
  headerH: number;
  iconSize: number;
  iconLeftPad: number;
  dividerW: number;
  dividerGap: number;
  countSize: number;
  countScaleX: number;
}

/** Header height tracks grid — small exclusive lockers stay compact. */
export function resolveLockerHeaderHeight(gridH: number): number {
  const h = Math.round(gridH * LOCKER_HEADER_GRID_RATIO);
  return Math.max(LOCKER_HEADER_MIN_H, Math.min(LOCKER_HEADER_MAX_H, h));
}

export function resolveLockerHeaderMetrics(gridH: number): LockerHeaderMetrics {
  const headerH = resolveLockerHeaderHeight(gridH);
  const scale = headerH / LOCKER_HEADER_REF_H;
  return {
    headerH,
    iconSize: Math.max(36, Math.round(LOCKER_HEADER_ICON_SIZE * scale)),
    iconLeftPad: Math.max(6, Math.round(LOCKER_HEADER_ICON_LEFT_PAD * scale)),
    dividerW: Math.max(2, Math.round(LOCKER_HEADER_DIVIDER_W * scale)),
    dividerGap: Math.max(8, Math.round(LOCKER_HEADER_DIVIDER_GAP * scale)),
    countSize: Math.max(28, Math.round(LOCKER_HEADER_COUNT_SIZE * scale)),
    countScaleX: LOCKER_HEADER_COUNT_SCALE_X,
  };
}

/** Footer height tracks grid — same visual share on small and huge lockers. */
export function resolveLockerFooterHeight(gridH: number): number {
  const h = Math.round(gridH * LOCKER_FOOTER_GRID_RATIO);
  return Math.max(LOCKER_FOOTER_MIN_H, Math.min(LOCKER_FOOTER_MAX_H, h));
}

/** Scale footer assets up on large images; baseline sizes kept on small lockers. */
export function resolveLockerFooterScale(footerH: number): number {
  return Math.max(1, footerH / LOCKER_FOOTER_REF_H);
}

export function resolveLockerFooterGap(footerH: number): number {
  return Math.max(12, Math.round(footerH * 0.1));
}

export function resolveLockerFooterTypography(footerH: number): {
  textBlockH: number;
  lineGap: number;
  textSize: number;
  iconSize: number;
  iconPad: number;
  iconLeft: number;
  textGap: number;
} {
  const iconPad = Math.max(8, Math.round(footerH * 0.04));
  const iconSize = footerH - iconPad * 2;
  const iconLeft = Math.max(6, Math.round(footerH * 0.03));
  const textGap = Math.max(28, Math.round(footerH * 0.085));
  const textBlockH = Math.round(footerH * LOCKER_FOOTER_TEXT_BLOCK_RATIO);
  const lineGap = Math.max(6, Math.round(footerH * 0.035));
  const textSize = Math.max(20, Math.round((textBlockH - lineGap) / 1.95));
  return { textBlockH, lineGap, textSize, iconSize, iconPad, iconLeft, textGap };
}

export function splitLockerItemsIntoPages<T>(
  items: T[],
  cols: number,
  maxRowsPerPage = LOCKER_MAX_GRID_ROWS,
): T[][] {
  if (!items.length) return [[]];
  return [items];
}
