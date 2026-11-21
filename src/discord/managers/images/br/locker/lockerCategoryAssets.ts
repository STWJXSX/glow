import fs from 'fs';
import path from 'path';
import sharp from 'sharp';
import type { LockerCosmeticType, LockerCosmeticTypeFilter, LockerHeaderIconKey } from './types.ts';

const CATEGORIES_DIR = path.join((import.meta.dirname ?? __dirname), 'assets', 'categories');

/** Preferred filename per type — drop `{type}.png` in assets/categories/ */
const CATEGORY_ASSET_CANDIDATES: Record<LockerCosmeticType, string[]> = {
  outfit: ['outfit.png', 'oufit.png', 'outfit.jpg'],
  backpack: ['backpack.png', 'backpack.jpg'],
  pickaxe: ['pickaxe.png', 'pickaxe.jpg'],
  glider: ['glider.png', 'glider.jpg'],
  emote: ['emote.png', 'emote.jpg'],
  spray: ['spray.png', 'spray.jpg'],
  emoticon: ['emoticon.png', 'emoticon.jpg'],
  toy: ['toy.png', 'toy.jpg'],
  wrap: ['wrap.png', 'wrap.jpg'],
  music: ['music.png', 'music.jpg'],
  loadingscreen: ['loadingscreen.png', 'loadingscreen.jpg'],
  contrail: ['contrail.png', 'contrail.jpg'],
  companion: ['companion.png', 'companion.jpg'],
  shoes: ['shoes.png', 'shoes.jpg'],
  vehicle: ['vehicle.png', 'vehicle.jpg', 'car.png', 'cars.png'],
};

const SPECIAL_HEADER_ICONS: Record<'fallback' | 'exclusives', string[]> = {
  fallback: ['locker-fallback.png'],
  exclusives: ['exclusives.png'],
};

export const LOCKER_CATEGORY_ASSET_FILES: Record<LockerCosmeticType, string> = Object.fromEntries(
  Object.entries(CATEGORY_ASSET_CANDIDATES).map(([type, files]) => [type, files[0]]),
) as Record<LockerCosmeticType, string>;

export function resolveHeaderCategoryIcon(
  types: LockerCosmeticTypeFilter[],
  exclusiveOnly: boolean,
  explicit?: LockerCosmeticType,
): LockerHeaderIconKey {
  if (exclusiveOnly) return 'exclusives';
  if (explicit) return explicit;
  if (types.includes('all')) return 'fallback';
  const selected = types.filter((t): t is LockerCosmeticType => t !== 'all');
  if (selected.length !== 1) return 'fallback';
  return selected[0]!;
}

export async function measureOpaqueRight(png: Buffer): Promise<number> {
  const { data, info } = await sharp(png).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  let maxX = -1;
  for (let y = 0; y < info.height; y++) {
    for (let x = 0; x < info.width; x++) {
      if (data[(y * info.width + x) * 4 + 3]! > 20) maxX = Math.max(maxX, x);
    }
  }
  return maxX < 0 ? info.width - 1 : maxX;
}

function resolveCategoryAssetPath(type: LockerCosmeticType): string | null {
  const candidates = CATEGORY_ASSET_CANDIDATES[type] ?? [`${type}.png`];
  for (const file of candidates) {
    const full = path.join(CATEGORIES_DIR, file);
    if (fs.existsSync(full)) return full;
  }
  return null;
}

function resolveHeaderIconAssetPath(key: LockerHeaderIconKey): string | null {
  if (key === 'fallback' || key === 'exclusives') {
    for (const file of SPECIAL_HEADER_ICONS[key]) {
      const full = path.join(CATEGORIES_DIR, file);
      if (fs.existsSync(full)) return full;
    }
    return null;
  }
  return resolveCategoryAssetPath(key);
}

type IconColorMode = 'header' | 'tile';

const BG_LUM_THRESHOLD = 36;

function isBlueLockerBg(r: number, g: number, b: number, lum: number): boolean {
  return b > 95 && b > r * 1.05 && b > g * 0.85 && lum < 235;
}

async function extractCategoryIcon(
  input: Buffer,
  colorMode: IconColorMode,
): Promise<Buffer> {
  const workSize = 512;
  const resized = await sharp(input)
    .resize(workSize, workSize, { fit: 'inside', background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  const { data, info } = resized;
  for (let i = 0; i < data.length; i += 4) {
    const r = data[i]!;
    const g = data[i + 1]!;
    const b = data[i + 2]!;
    const a = data[i + 3]!;
    if (a < 8) continue;

    const lum = 0.299 * r + 0.587 * g + 0.114 * b;
    const isBg = isBlueLockerBg(r, g, b, lum) || lum < BG_LUM_THRESHOLD;

    if (colorMode === 'header') {
      if (isBg) {
        data[i + 3] = 0;
        continue;
      }
      data[i] = 255;
      data[i + 1] = 255;
      data[i + 2] = 255;
      data[i + 3] = 255;
      continue;
    }

    if (isBg) {
      data[i] = 0;
      data[i + 1] = 0;
      data[i + 2] = 0;
      data[i + 3] = colorMode === 'tile' && lum < BG_LUM_THRESHOLD ? 255 : 0;
      continue;
    }

    data[i] = 255;
    data[i + 1] = 255;
    data[i + 2] = 255;
    data[i + 3] = 255;
  }

  return sharp(data, { raw: info }).png().toBuffer();
}

async function trimIconBounds(icon: Buffer): Promise<Buffer> {
  try {
    return await sharp(icon).trim({ threshold: 1 }).png().toBuffer();
  } catch {
    return icon;
  }
}

async function normalizeHeaderCategoryIcon(input: Buffer, height: number): Promise<Buffer> {
  const extracted = await extractCategoryIcon(input, 'header');
  const trimmed = await trimIconBounds(extracted);
  return sharp(trimmed)
    .resize({ height, fit: 'inside' })
    .png()
    .toBuffer();
}

async function normalizeCategoryIcon(input: Buffer, size: number): Promise<Buffer> {
  const extracted = await extractCategoryIcon(input, 'tile');
  return sharp(extracted)
    .resize(size, size, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .png()
    .toBuffer();
}

export async function loadLockerHeaderCategoryIcon(
  key: LockerHeaderIconKey,
  height: number,
): Promise<Buffer> {
  const assetPath = resolveHeaderIconAssetPath(key);
  if (!assetPath) {
    throw new Error(`Missing locker category icon: ${key} in assets/categories`);
  }

  const raw = fs.readFileSync(assetPath);
  return normalizeHeaderCategoryIcon(raw, height);
}

export async function loadLockerCategoryIcon(
  type: LockerCosmeticType,
  size: number,
): Promise<Buffer> {
  const assetPath = resolveCategoryAssetPath(type);
  if (!assetPath) {
    throw new Error(`Missing locker category icon: ${type}.png in assets/categories`);
  }

  const raw = fs.readFileSync(assetPath);
  return normalizeCategoryIcon(raw, size);
}
