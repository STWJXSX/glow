import http from 'node:http';
import https from 'node:https';
import axios from 'axios';
import sharp from 'sharp';
import fs from 'node:fs';

import { resolveCosmeticImageFile, isLocalCosmeticUrl } from './cosmeticsLocalCatalog.ts';
import type { LockerDisplayCosmetic, LockerPageScratch, LockerPortraitEntry } from './types.ts';
import {
  LOCKER_PORTRAIT_PREFETCH_CONCURRENCY,
  LOCKER_TILE_GAP,
  LOCKER_TILE_SIZE,
} from './lockerConstants.ts';
import { mapConcurrent } from './lockerConcurrency.ts';
import { isLockerPerfEnabled } from './lockerPerf.ts';
import type { LockerPerf } from './lockerPerf.ts';
import { buildSquareCardBaseSvg, buildSquareCardOverlaySvg } from './lockerRarityTheme.ts';

const TILE_SIZE = LOCKER_TILE_SIZE;
const TILE_PNG = { compressionLevel: 0 } as const;

const portraitHttp = new http.Agent({ keepAlive: true, maxSockets: 96 });
const portraitHttps = new https.Agent({ keepAlive: true, maxSockets: 96 });
const portraitClient = axios.create({
  timeout: 6000,
  responseType: 'arraybuffer',
  httpAgent: portraitHttp,
  httpsAgent: portraitHttps,
  maxRedirects: 3,
});

const portraitInflight = new Map<string, Promise<LockerPortraitEntry | null>>();
const tilePerfTotals = { labelsMs: 0, compositeMs: 0, count: 0 };

async function getBgBuffer(themeKey: string, scratch: LockerPageScratch): Promise<Buffer> {
  const hit = scratch.backgrounds.get(themeKey);
  if (hit) return hit;
  const svgBuf = buildSquareCardBaseSvg(themeKey, TILE_SIZE);
  const png = await sharp(svgBuf).png(TILE_PNG).toBuffer();
  scratch.backgrounds.set(themeKey, png);
  return png;
}

async function fetchPortrait(url: string): Promise<LockerPortraitEntry | null> {
  try {
    let source: Buffer;
    if (isLocalCosmeticUrl(url)) {
      const filePath = resolveCosmeticImageFile(url);
      if (!filePath || !fs.existsSync(filePath)) return null;
      source = fs.readFileSync(filePath);
    } else {
      const res = await portraitClient.get<ArrayBuffer>(url);
      source = Buffer.from(res.data);
    }

    const { data, info } = await sharp(source)
      .resize(TILE_SIZE, TILE_SIZE, {
        fit: 'contain',
        background: { r: 0, g: 0, b: 0, alpha: 0 },
      })
      .png(TILE_PNG)
      .toBuffer({ resolveWithObject: true });

    return { buf: data, w: info.width, h: info.height };
  } catch {
    return null;
  }
}

async function getPortraitEntry(url: string, scratch: LockerPageScratch): Promise<LockerPortraitEntry | null> {
  const hit = scratch.portraits.get(url);
  if (hit) return hit;

  let pending = portraitInflight.get(url);
  if (!pending) {
    pending = fetchPortrait(url).then((entry) => {
      portraitInflight.delete(url);
      if (entry) scratch.portraits.set(url, entry);
      return entry;
    });
    portraitInflight.set(url, pending);
  }
  return pending;
}

export async function prefetchLockerPortraits(
  urls: Iterable<string | null | undefined>,
  scratch: LockerPageScratch,
  concurrency = LOCKER_PORTRAIT_PREFETCH_CONCURRENCY,
): Promise<void> {
  const unique: string[] = [];
  const seen = new Set<string>();
  for (const url of urls) {
    if (!url || seen.has(url) || scratch.portraits.has(url)) continue;
    seen.add(url);
    unique.push(url);
  }
  if (!unique.length) return;
  await mapConcurrent(unique, concurrency, (url) => getPortraitEntry(url, scratch));
}

export function flushTilePerf(perf: LockerPerf | null): void {
  if (!perf || tilePerfTotals.count === 0) return;
  const n = tilePerfTotals.count;
  perf.detail(`tile.sharpComposite CPU-sum (x${n}, avg ${(tilePerfTotals.compositeMs / n).toFixed(1)}ms)`, tilePerfTotals.compositeMs);
  tilePerfTotals.labelsMs = 0;
  tilePerfTotals.compositeMs = 0;
  tilePerfTotals.count = 0;
}

export async function prefetchLockerLabels(
  _items: LockerDisplayCosmetic[],
  _scratch: LockerPageScratch,
  _concurrency = 128,
): Promise<void> {
  // Label text is rendered directly via Sharp SVG in buildSquareCardOverlaySvg
}

export async function renderLockerTile(
  item: LockerDisplayCosmetic,
  scratch: LockerPageScratch,
): Promise<Buffer> {
  const track = isLockerPerfEnabled();
  const tStart = track ? performance.now() : 0;

  const [bg, portrait] = await Promise.all([
    getBgBuffer(item.themeKey, scratch),
    item.iconUrl ? getPortraitEntry(item.iconUrl, scratch) : Promise.resolve(null),
  ]);

  const layers: sharp.OverlayOptions[] = [{ input: bg, top: 0, left: 0 }];

  if (portrait) {
    layers.push({
      input: portrait.buf,
      left: Math.round((TILE_SIZE - portrait.w) / 2),
      top: Math.round((TILE_SIZE - portrait.h) / 2),
    });
  }

  const overlaySvg = buildSquareCardOverlaySvg(item, TILE_SIZE);
  layers.push({ input: overlaySvg, top: 0, left: 0 });

  const buf = await sharp({
    create: { width: TILE_SIZE, height: TILE_SIZE, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } },
  })
    .composite(layers)
    .png(TILE_PNG)
    .toBuffer();

  if (track) {
    tilePerfTotals.compositeMs += performance.now() - tStart;
    tilePerfTotals.count += 1;
  }

  return buf;
}

export async function renderLockerTiles(
  items: LockerDisplayCosmetic[],
  concurrency: number,
  scratch: LockerPageScratch,
  perf?: LockerPerf | null,
): Promise<Buffer[]> {
  const tiles = await mapConcurrent(items, concurrency, (item) => renderLockerTile(item, scratch));
  flushTilePerf(perf ?? null);
  return tiles;
}

export async function packLockerRowFromTiles(
  rowTiles: Buffer[],
  tileSize = TILE_SIZE,
  tileGap = LOCKER_TILE_GAP,
): Promise<Buffer> {
  const cols = rowTiles.length;
  const rowW = cols * tileSize + Math.max(0, cols - 1) * tileGap;
  const layers: sharp.OverlayOptions[] = rowTiles.map((input, i) => ({
    input,
    left: i * (tileSize + tileGap),
    top: 0,
  }));

  return sharp({
    create: { width: rowW, height: tileSize, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } },
  })
    .composite(layers)
    .png(TILE_PNG)
    .toBuffer();
}

/** @deprecated use renderLockerTiles + packLockerRowFromTiles */
export async function renderLockerRow(
  rowItems: LockerDisplayCosmetic[],
  scratch: LockerPageScratch,
): Promise<Buffer> {
  const tiles = await mapConcurrent(rowItems, rowItems.length, (item) => renderLockerTile(item, scratch));
  return packLockerRowFromTiles(tiles);
}

export function clearLockerTileInflight(): void {
  portraitInflight.clear();
}
