import sharp from 'sharp';
import fs from 'node:fs/promises';
import fsSync from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import type { RenderLockerPageOptions } from './types.ts';
import {
  LOCKER_PAD_X,
  LOCKER_PAD_Y,
  LOCKER_PAD_BOTTOM,
  LOCKER_OUTPUT_WEBP,
  LOCKER_TILE_GAP,
  LOCKER_HEADER_GRID_GAP,
  LOCKER_HEADER_H,
  LOCKER_FOOTER_H,
  LOCKER_AVATAR_SIZE,
  LOCKER_TILE_CONCURRENCY,
  LOCKER_ROW_PACK_CONCURRENCY,
} from './lockerConstants.ts';
import { mapConcurrent } from './lockerConcurrency.ts';
import {
  resolveLockerGridPixelSize,
  resolveLockerGridRows,
} from './lockerGridLayout.ts';
import {
  clearLockerTileInflight,
  packLockerRowFromTiles,
  prefetchLockerLabels,
  prefetchLockerPortraits,
  renderLockerTile,
} from './lockerTile.ts';
import { buildStwImageFooterBuffer } from '#managers/images/stw/resources/resourcesFooter.ts';
import { resolveGlowBrandIconPath } from '#helpers/core/glowAssetPaths.ts';
import type { LockerPerf } from './lockerPerf.ts';
import { createLockerPageScratch } from './types.ts';

const BG = { r: 6, g: 9, b: 15, alpha: 255 }; // Modern navy obsidian
const FRAME_PNG = { compressionLevel: 0 } as const;
/** sharp 0.34+: per-instance option, not sharp.limitInputPixels(). */
const HUGE_IMAGE_INPUT = { limitInputPixels: false as const };

/** Above this, use disk encode + fewer composite layers. */
const HUGE_LOCKER_PIXEL_THRESHOLD = 25_000_000;
/** libwebp on Windows often fails above ~35–45M px — downscale before encode. */
const MAX_WEBP_ENCODE_PIXELS = 32_000_000;
const HUGE_LOCKER_ROWS_PER_STRIP = 8;

function esc(str: string): string {
  return str.replace(/[<>&"]/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;' }[c]!));
}

function resolveEncodeDimensions(frameW: number, frameH: number): { w: number; h: number } {
  const pixels = frameW * frameH;
  if (pixels <= MAX_WEBP_ENCODE_PIXELS) return { w: frameW, h: frameH };
  const scale = Math.sqrt(MAX_WEBP_ENCODE_PIXELS / pixels);
  return {
    w: Math.max(1, Math.floor(frameW * scale)),
    h: Math.max(1, Math.floor(frameH * scale)),
  };
}

function isJpegBuffer(buf: Buffer): boolean {
  return buf.length >= 2 && buf[0] === 0xff && buf[1] === 0xd8;
}

async function packRowBuffersIntoStrips(
  rowBuffers: Buffer[],
  tileSize: number,
  tileGap: number,
  rowsPerStrip: number,
): Promise<Buffer[]> {
  const strips: Buffer[] = [];
  const rowStep = tileSize + tileGap;

  for (let start = 0; start < rowBuffers.length; start += rowsPerStrip) {
    const chunk = rowBuffers.slice(start, start + rowsPerStrip);
    const stripH = chunk.length * tileSize + Math.max(0, chunk.length - 1) * tileGap;
    const meta = await sharp(chunk[0]!).metadata();
    const stripW = meta.width ?? 0;

    strips.push(await sharp({
      ...HUGE_IMAGE_INPUT,
      create: {
        width: stripW,
        height: stripH,
        channels: 4,
        background: { r: 0, g: 0, b: 0, alpha: 0 },
      },
    })
      .composite(chunk.map((input, i) => ({
        input,
        left: 0,
        top: i * rowStep,
      })))
      .png(FRAME_PNG)
      .toBuffer());
  }

  return strips;
}

function buildLockerWebpOptions(pixels: number) {
  if (pixels > HUGE_LOCKER_PIXEL_THRESHOLD) {
    return { quality: 85, effort: 0, nearLossless: false, smartSubsample: true } as const;
  }
  return LOCKER_OUTPUT_WEBP;
}

async function encodeLockerWebp(
  frameW: number,
  frameH: number,
  layers: sharp.OverlayOptions[],
): Promise<Buffer> {
  const pixels = frameW * frameH;
  const webpOpts = buildLockerWebpOptions(pixels);
  const { w: encodeW, h: encodeH } = resolveEncodeDimensions(frameW, frameH);

  const buildFrame = () => sharp({
    ...HUGE_IMAGE_INPUT,
    create: { width: frameW, height: frameH, channels: 4, background: BG },
  }).composite(layers);

  const encodeFromPngFile = async (pngPath: string): Promise<Buffer> => {
    const tmpId = randomUUID();
    const tmpWebp = path.join(os.tmpdir(), `locker-${tmpId}.webp`);
    const tmpJpg = path.join(os.tmpdir(), `locker-${tmpId}.jpg`);

    const raster = sharp(pngPath, { ...HUGE_IMAGE_INPUT, sequentialRead: true });
    const sized = encodeW !== frameW || encodeH !== frameH
      ? raster.resize(encodeW, encodeH, { fit: 'fill', kernel: sharp.kernel.lanczos3 })
      : raster;

    try {
      try {
        await sized.clone().webp({ ...webpOpts, effort: 0 }).toFile(tmpWebp);
        return await fs.readFile(tmpWebp);
      } catch {
        await sized.clone().jpeg({ quality: 90, mozjpeg: true }).toFile(tmpJpg);
        return await fs.readFile(tmpJpg);
      }
    } finally {
      await Promise.all([
        fs.unlink(tmpWebp).catch(() => {}),
        fs.unlink(tmpJpg).catch(() => {}),
      ]);
    }
  };

  if (pixels <= HUGE_LOCKER_PIXEL_THRESHOLD) {
    try {
      return await buildFrame().webp(webpOpts).toBuffer();
    } catch {
      const tmpId = randomUUID();
      const tmpPng = path.join(os.tmpdir(), `locker-${tmpId}.png`);
      try {
        await buildFrame().png({ compressionLevel: 2, effort: 1 }).toFile(tmpPng);
        return await encodeFromPngFile(tmpPng);
      } finally {
        await fs.unlink(tmpPng).catch(() => {});
      }
    }
  }

  const tmpId = randomUUID();
  const tmpPng = path.join(os.tmpdir(), `locker-${tmpId}.png`);

  try {
    await buildFrame().png({ compressionLevel: 1, effort: 1 }).toFile(tmpPng);
    return await encodeFromPngFile(tmpPng);
  } finally {
    await fs.unlink(tmpPng).catch(() => {});
  }
}

export function resolveLockerOutputFileName(buffer: Buffer): string {
  return isJpegBuffer(buffer) ? 'locker.jpg' : 'locker.webp';
}

async function timed<T>(name: string, perf: LockerPerf | null, fn: () => Promise<T>): Promise<T> {
  if (!perf) return fn();
  const start = performance.now();
  try {
    return await fn();
  } finally {
    perf.record(name, performance.now() - start);
  }
}

// Clean, Proportional, OPEN Header WITHOUT multicolored line and WITHOUT casillas/boxes
function buildProportionalHeaderSvg(
  width: number,
  height: number,
  params: {
    displayName: string;
    totalCount: number;
    hasAvatar: boolean;
    categoryType?: string;
  },
): Buffer {
  const { displayName, totalCount, hasAvatar, categoryType = 'outfit' } = params;

  const avatarSlotX = 32;
  const avatarSlotSize = LOCKER_AVATAR_SIZE;
  const avatarSlotY = Math.round((height - avatarSlotSize) / 2);

  const fallbackAvatarSvg = !hasAvatar
    ? `<g transform="translate(${avatarSlotX}, ${avatarSlotY})">
        <circle cx="${avatarSlotSize / 2}" cy="${avatarSlotSize / 2}" r="${avatarSlotSize / 2}" fill="#131b2e" stroke="rgba(255,255,255,0.15)" stroke-width="2"/>
        <text x="${avatarSlotSize / 2}" y="${avatarSlotSize / 2 + 16}" text-anchor="middle" font-family="'Segoe UI', Arial, sans-serif" font-size="46">👑</text>
       </g>`
    : `<g transform="translate(${avatarSlotX}, ${avatarSlotY})">
        <circle cx="${avatarSlotSize / 2}" cy="${avatarSlotSize / 2}" r="${avatarSlotSize / 2 + 2}" fill="none" stroke="rgba(255,255,255,0.18)" stroke-width="2.5"/>
       </g>`;

  const centerY = Math.round(height / 2);
  const textY = centerY + 19;
  const countY = centerY + 22;

  const typeLabel = categoryType === 'outfit' ? 'SKINS' : categoryType.toUpperCase() + 'S';

  const svg = `<svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">
    <defs>
      <!-- Sleek clean dark background - NO MULTICOLORED LINE -->
      <linearGradient id="header-bg" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stop-color="#0b101c"/>
        <stop offset="100%" stop-color="#060912"/>
      </linearGradient>
    </defs>

    <!-- Header Frame -->
    <rect width="${width}" height="${height}" fill="url(#header-bg)" stroke="rgba(255,255,255,0.08)" stroke-width="1.5"/>
    
    <!-- Clean monochrome subtle top border (NO RAINBOW) -->
    <line x1="0" y1="1" x2="${width}" y2="1" stroke="rgba(255,255,255,0.14)" stroke-width="1.5"/>

    ${fallbackAvatarSvg}

    <!-- User Information (Clean, prominent, vertically centered with avatar - NO SUBTITLE) -->
    <g transform="translate(${avatarSlotX + avatarSlotSize + 28}, 0)">
      <text x="0" y="${textY}" font-family="'Segoe UI', 'Outfit', Arial, sans-serif" font-size="56" font-weight="900" fill="#ffffff" letter-spacing="0.5">
        ${esc(displayName)}
      </text>
    </g>

    <!-- Open Count (Scaled up, NO BOX!) -->
    <g transform="translate(${width - 36}, 0)">
      <text x="0" y="${countY}" text-anchor="end" font-family="'Segoe UI', 'Outfit', Arial, sans-serif" font-size="70" font-weight="900" fill="#f8fafc">
        ${totalCount} <tspan font-size="28" font-weight="700" fill="#64748b" letter-spacing="2">${typeLabel}</tspan>
      </text>
    </g>
  </svg>`;

  return Buffer.from(svg);
}

// Faint majestic Glow logo watermark for the grid background
async function buildFaintGlowWatermark(w: number, h: number): Promise<Buffer | null> {
  const iconPath = resolveGlowBrandIconPath();
  if (!iconPath || !fsSync.existsSync(iconPath)) return null;

  try {
    const size = Math.round(Math.min(w, h) * 0.45);
    const { data, info } = await sharp(iconPath)
      .resize(size, size, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
      .ensureAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });

    // 3.5% subtle alpha watermark
    for (let i = 3; i < data.length; i += 4) {
      data[i] = Math.round(data[i] * 0.035);
    }

    return sharp(data, {
      raw: { width: info.width, height: info.height, channels: 4 },
    })
      .png()
      .toBuffer();
  } catch {
    return null;
  }
}

export async function renderLockerPageToBuffer(options: RenderLockerPageOptions): Promise<Buffer> {
  const {
    items,
    gridCols,
    tileSize,
    tileGap = LOCKER_TILE_GAP,
    categoryType,
    branding,
    accountAvatarPng,
    tileConcurrency = LOCKER_TILE_CONCURRENCY,
    rowConcurrency = LOCKER_ROW_PACK_CONCURRENCY,
    perf = null,
    scratch: scratchArg,
  } = options;

  const scratch = scratchArg ?? createLockerPageScratch();

  perf?.lap('layout');

  const rows = resolveLockerGridRows(items.length, gridCols);
  const { width: gridW, height: gridH } = resolveLockerGridPixelSize(
    gridCols,
    rows,
    tileSize,
    tileGap,
  );

  const frameW = gridW + LOCKER_PAD_X * 2;
  const headerH = LOCKER_HEADER_H;
  const footerH = LOCKER_FOOTER_H;
  const headerTop = LOCKER_PAD_Y;
  const gridTop = headerTop + headerH + LOCKER_HEADER_GRID_GAP;
  const footerTop = gridTop + gridH + 18;
  const frameH = footerTop + footerH + LOCKER_PAD_BOTTOM;

  await Promise.all([
    timed(`prefetchPortraits (${items.length})`, perf, () => prefetchLockerPortraits(items.map((i) => i.iconUrl), scratch)),
    timed(`prefetchLabels (${items.length})`, perf, () => prefetchLockerLabels(items, scratch)),
  ]);

  const hugeLocker = items.length > 1200;
  const effectiveTileConcurrency = hugeLocker ? Math.min(tileConcurrency, 32) : tileConcurrency;
  const effectiveRowConcurrency = hugeLocker ? 2 : rowConcurrency;

  const displayName = branding?.displayName || '乂 STW_JXSX メ';

  const [headerBuf, footerBuf, watermarkBuf] = await Promise.all([
    timed('header', perf, async () => buildProportionalHeaderSvg(gridW, headerH, {
      displayName,
      totalCount: items.length,
      hasAvatar: Boolean(accountAvatarPng),
      categoryType,
    })),
    timed('footer', perf, async () => buildStwImageFooterBuffer(gridW, footerH, {
      lang: 'en',
    })),
    timed('watermark', perf, async () => buildFaintGlowWatermark(frameW, frameH)),
  ]);

  const rowIndices = Array.from({ length: rows }, (_, i) => i);
  const rowBuffers = await timed(`renderRows (${rows} rows)`, perf, async () => mapConcurrent(rowIndices, effectiveRowConcurrency, async (row) => {
    const start = row * gridCols;
    const rowItems = items.slice(start, start + gridCols);
    const tiles = await mapConcurrent(
      rowItems,
      effectiveTileConcurrency,
      (item) => renderLockerTile(item, scratch),
    );
    return packLockerRowFromTiles(tiles, tileSize, tileGap);
  }));

  const rowStep = tileSize + tileGap;
  const finalLayers: sharp.OverlayOptions[] = [];

  // 1. Watermark in background if available
  if (watermarkBuf) {
    const meta = await sharp(watermarkBuf).metadata();
    finalLayers.push({
      input: watermarkBuf,
      left: Math.round((frameW - (meta.width ?? 0)) / 2),
      top: Math.round(gridTop + (gridH - (meta.height ?? 0)) / 2),
    });
  }

  // 2. Rows
  if (hugeLocker) {
    const strips = await timed(`gridStrips (${rows} rows)`, perf, () => packRowBuffersIntoStrips(
      rowBuffers,
      tileSize,
      tileGap,
      HUGE_LOCKER_ROWS_PER_STRIP,
    ));
    for (let i = 0; i < strips.length; i++) {
      finalLayers.push({
        input: strips[i]!,
        top: gridTop + i * HUGE_LOCKER_ROWS_PER_STRIP * rowStep,
        left: LOCKER_PAD_X,
      });
    }
  } else {
    for (let row = 0; row < rows; row++) {
      finalLayers.push({
        input: rowBuffers[row]!,
        top: gridTop + row * rowStep,
        left: LOCKER_PAD_X,
      });
    }
  }

  // 3. Header
  finalLayers.unshift({ input: headerBuf, left: LOCKER_PAD_X, top: headerTop });

  // 4. Epic Games Account Avatar overlay
  if (accountAvatarPng) {
    finalLayers.push({
      input: accountAvatarPng,
      left: LOCKER_PAD_X + 32,
      top: headerTop + Math.round((headerH - LOCKER_AVATAR_SIZE) / 2),
    });
  }

  // 5. Hairline separator line above footer
  const footerDividerSvg = Buffer.from(`
    <svg width="${gridW}" height="2" xmlns="http://www.w3.org/2000/svg">
      <line x1="0" y1="1" x2="${gridW}" y2="1" stroke="rgba(255,255,255,0.08)" stroke-width="1.5"/>
    </svg>
  `);
  finalLayers.push({ input: footerDividerSvg, left: LOCKER_PAD_X, top: gridTop + gridH + 10 });

  // 6. Centered footer
  const footerMeta = await sharp(footerBuf).metadata();
  const footerBufH = footerMeta.height ?? footerH;
  const footerCompositeTop = footerTop + Math.max(0, Math.round((footerH - footerBufH) / 2));
  finalLayers.push({ input: footerBuf, left: LOCKER_PAD_X, top: footerCompositeTop });

  return timed(`finalComposite+webp (${frameW}x${frameH})`, perf, () => encodeLockerWebp(frameW, frameH, finalLayers));
}

export function clearLockerRenderCaches(): void {
  clearLockerTileInflight();
}
