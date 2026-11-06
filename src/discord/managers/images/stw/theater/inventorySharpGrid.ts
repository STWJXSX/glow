import fs from 'fs';
import path from 'path';
import sharp from 'sharp';
import { computeBrandingMetrics, getStwFooterCompositeTop, getStwFooterZoneHeight } from '../campaign/stwBrandingMetrics.ts';
import type { StwCardBrandingContext } from '../campaign/types.ts';
import {
  buildInventoryTileBgSvg,
  buildInventoryTileOverlaySvg,
  getInventoryTileDimensions,
} from './inventoryTile.ts';
import { buildStwImageFooterBuffer } from '../resources/resourcesFooter.ts';
import type { InventoryTileDimensions, RenderInventoryPageOptions, StwInventoryDisplayItem } from './types.ts';

const STITCH_BG = { r: 13, g: 17, b: 24, alpha: 255 };
const OUTPUT_WEBP = { quality: 92, effort: 1, smartSubsample: true };
const PAD_X = 24;
const GRID_PAD = 14;
const PAD_TOP = 20;

const iconBufferCache = new Map<string, Buffer>();
const tileBgCache = new Map<string, Buffer>();
const tileOverlayCache = new Map<string, Buffer>();

function overlayCacheKey(item: StwInventoryDisplayItem, dims: InventoryTileDimensions): string {
  return [
    item.templateId, item.cantidad, item.stacks, item.nivel,
    item.categoria, item.rareza, dims.width, dims.height,
  ].join('|');
}

async function rasterizeSvg(svg: string): Promise<Buffer> {
  return sharp(Buffer.from(svg)).png().toBuffer();
}

async function getTileBgBuffer(item: StwInventoryDisplayItem, dims: InventoryTileDimensions): Promise<Buffer> {
  const key = `${item.rareza ?? 'c'}|${dims.width}|${dims.height}`;
  let buf = tileBgCache.get(key);
  if (!buf) {
    buf = await rasterizeSvg(buildInventoryTileBgSvg(dims, item.rareza));
    tileBgCache.set(key, buf);
  }
  return buf;
}

async function getTileOverlayBuffer(item: StwInventoryDisplayItem, dims: InventoryTileDimensions): Promise<Buffer> {
  const key = overlayCacheKey(item, dims);
  let buf = tileOverlayCache.get(key);
  if (!buf) {
    const showPower = item.categoria === 'weapons' || item.categoria === 'traps';
    buf = await rasterizeSvg(buildInventoryTileOverlaySvg(dims, item, { showPower }));
    tileOverlayCache.set(key, buf);
  }
  return buf;
}

async function getIconBuffer(iconPath: string, iconSize: number): Promise<Buffer> {
  const key = `${iconPath}|${iconSize}`;
  let buf = iconBufferCache.get(key);
  if (!buf) {
    buf = await sharp(iconPath)
      .resize(iconSize, iconSize, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
      .toBuffer();
    iconBufferCache.set(key, buf);
  }
  return buf;
}

async function mapConcurrent<T, R>(
  items: T[],
  concurrency: number,
  mapper: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const results = new Array<R>(items.length);
  let next = 0;
  async function worker(): Promise<void> {
    while (next < items.length) {
      const index = next++;
      results[index] = await mapper(items[index], index);
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, items.length || 1) }, () => worker()));
  return results;
}

function buildHeaderSvg(
  width: number,
  title: string,
  metaLine: string,
  textX: number,
  m: ReturnType<typeof computeBrandingMetrics>,
  headerH: number,
  titleCenterY: number | null,
): Buffer {
  const safeTitle = String(title).replace(/[<>&]/g, '');
  const safeMeta = String(metaLine).replace(/<[^>]+>/g, '').replace(/[<>&]/g, '');
  const hasMeta = Boolean(safeMeta.trim());
  const titleY = titleCenterY ?? Math.round(m.titleFont * 1.22);
  const titleBaseline = titleCenterY != null ? 'middle' : 'auto';
  const lineY = headerH - m.ruleOffset;
  const metaText = hasMeta
    ? `<text x="${textX}" y="${titleY + Math.round(m.metaFont * 1.75)}" fill="rgba(255,255,255,0.62)" font-family="Segoe UI,sans-serif" font-size="${m.metaFont}" font-weight="600">${safeMeta}</text>`
    : '';
  return Buffer.from(`<svg width="${width}" height="${headerH}" xmlns="http://www.w3.org/2000/svg">
    <text x="${textX}" y="${titleY}" dominant-baseline="${titleBaseline}" fill="#f8fafc" font-family="Segoe UI,sans-serif" font-size="${m.titleFont}" font-weight="800">${safeTitle}</text>
    ${metaText}
    <line x1="0" y1="${lineY}" x2="${width}" y2="${lineY}" stroke="rgba(255,255,255,0.14)" stroke-width="${m.strokeWidth}"/>
  </svg>`);
}

async function buildWatermarkBuffer(
  width: number,
  branding: StwCardBrandingContext,
  _brandIconBuf: Buffer | null,
  m: ReturnType<typeof computeBrandingMetrics>,
): Promise<Buffer> {
  return buildStwImageFooterBuffer(width, m.watermarkH, {
    lang: branding.lang,
    footerIconUrl: branding.footerIconUrl ?? undefined,
  });
}

async function buildHeaderBuffer(
  width: number,
  title: string,
  metaLine: string,
  accountAvatarBuf: Buffer | null,
  m: ReturnType<typeof computeBrandingMetrics>,
  headerH: number,
): Promise<Buffer> {
  const hasMeta = Boolean(metaLine?.trim());
  const avatarTop = accountAvatarBuf
    ? (hasMeta ? m.avatarTop : Math.max(0, Math.round((headerH - m.avatarSize) / 2)))
    : 0;
  const titleCenterY = accountAvatarBuf && !hasMeta
    ? avatarTop + Math.round(m.avatarSize / 2)
    : null;
  const textX = accountAvatarBuf ? m.avatarSize + m.avatarGap : 0;
  const layers: sharp.OverlayOptions[] = [{
    input: buildHeaderSvg(width, title, metaLine, textX, m, headerH, titleCenterY),
    top: 0,
    left: 0,
  }];
  if (accountAvatarBuf) {
    const avatarInput = await sharp(accountAvatarBuf).resize(m.avatarSize, m.avatarSize).png().toBuffer();
    layers.push({ input: avatarInput, left: 0, top: avatarTop });
  }
  return sharp({
    create: { width, height: headerH, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } },
  }).composite(layers).png().toBuffer();
}

async function renderRowBuffer(
  rowItems: StwInventoryDisplayItem[],
  dims: InventoryTileDimensions,
  tileGap: number,
  iconSize: number,
): Promise<Buffer> {
  const cols = rowItems.length;
  const rowW = cols * dims.width + (cols - 1) * tileGap;
  const rowH = dims.height;
  const iconPadX = Math.round((dims.iconArea - iconSize) / 2);
  const iconPadY = Math.round((dims.iconArea - iconSize) * 0.38);
  const layers: sharp.OverlayOptions[] = [];

  for (let col = 0; col < cols; col++) {
    const item = rowItems[col]!;
    const left = col * (dims.width + tileGap);
    layers.push({ input: await getTileBgBuffer(item, dims), left, top: 0 });

    if (item.iconPath && fs.existsSync(item.iconPath)) {
      layers.push({
        input: await getIconBuffer(item.iconPath, iconSize),
        left: left + iconPadX,
        top: iconPadY,
      });
    }

    layers.push({ input: await getTileOverlayBuffer(item, dims), left, top: 0 });
  }

  return sharp({
    create: { width: rowW, height: rowH, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } },
  })
    .composite(layers)
    .png({ compressionLevel: 3 })
    .toBuffer();
}

export async function renderInventoryPageToBuffer(options: RenderInventoryPageOptions): Promise<Buffer> {
  const {
    items,
    gridCols,
    tileSize,
    tileGap = 5,
    title,
    metaLine,
    branding = null,
    accountAvatarPng = null,
    brandIconPng = null,
    rowConcurrency = 8,
  } = options;

  const dims = getInventoryTileDimensions(tileSize);
  const rows = Math.ceil(items.length / gridCols);
  const gridW = gridCols * dims.width + (gridCols - 1) * tileGap + GRID_PAD * 2;
  const gridH = rows * dims.height + (rows - 1) * tileGap + GRID_PAD * 2;
  const frameW = gridW + PAD_X * 2;
  const brandingMetrics = computeBrandingMetrics(frameW);
  const hasMeta = Boolean(metaLine?.trim());
  const headerH = hasMeta
    ? brandingMetrics.headerH
    : Math.round(brandingMetrics.titleFont * 2.15 + brandingMetrics.ruleOffset + 8);
  const watermarkH = branding ? brandingMetrics.watermarkH : 0;
  const footerZoneH = branding ? getStwFooterZoneHeight(watermarkH) : 0;
  const frameH = headerH + PAD_TOP + gridH + (footerZoneH || 24);
  const iconSize = Math.round(dims.iconArea * 0.84);

  const seenThemes = new Set<string>();
  await mapConcurrent(items, 16, async (item) => {
    const themeKey = item.rareza ?? 'c';
    if (seenThemes.has(themeKey)) return;
    seenThemes.add(themeKey);
    await getTileBgBuffer(item, dims);
  });

  const iconPaths = new Set(items.map((item) => item.iconPath).filter(Boolean));
  await mapConcurrent([...iconPaths], 64, async (iconPath) => {
    await getIconBuffer(iconPath, iconSize);
  });

  const rowIndices = Array.from({ length: rows }, (_, index) => index);
  const rowBuffers = await mapConcurrent(rowIndices, rowConcurrency, async (row) => {
    const start = row * gridCols;
    const rowItems = items.slice(start, start + gridCols);
    return renderRowBuffer(rowItems, dims, tileGap, iconSize);
  });

  const layers: sharp.OverlayOptions[] = [];
  const bgFile = path.join(process.cwd(), 'assets/backgrounds/stwshop.png');

  if (fs.existsSync(bgFile)) {
    const bgBuf = await sharp(bgFile).resize(frameW, frameH, { fit: 'cover' }).blur(1).toBuffer();
    layers.push({ input: bgBuf, top: 0, left: 0 });
    layers.push({
      input: await sharp({
        create: { width: frameW, height: frameH, channels: 4, background: { r: 10, g: 14, b: 22, alpha: 191 } },
      }).png().toBuffer(),
      top: 0,
      left: 0,
    });
  }

  layers.push({
    input: await buildHeaderBuffer(frameW - PAD_X * 2, title, metaLine, accountAvatarPng, brandingMetrics, headerH),
    top: PAD_TOP,
    left: PAD_X,
  });

  const gridLeft = PAD_X + GRID_PAD;
  const gridTop = PAD_TOP + headerH + GRID_PAD;
  for (let row = 0; row < rows; row++) {
    layers.push({
      input: rowBuffers[row]!,
      left: gridLeft,
      top: gridTop + row * (dims.height + tileGap),
    });
  }

  if (branding) {
    const gridBottom = PAD_TOP + headerH + gridH;
    const footerBuf = await buildWatermarkBuffer(frameW - PAD_X * 2, branding, brandIconPng, brandingMetrics);
    layers.push({
      input: footerBuf,
      top: await getStwFooterCompositeTop(gridBottom, footerZoneH, footerBuf),
      left: PAD_X,
    });
  }

  return sharp({
    create: { width: frameW, height: frameH, channels: 4, background: STITCH_BG },
  })
    .composite(layers)
    .webp(OUTPUT_WEBP)
    .toBuffer();
}

export function clearInventoryRenderCaches(): void {
  iconBufferCache.clear();
  tileBgCache.clear();
  tileOverlayCache.clear();
}
