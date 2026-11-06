import fs from 'fs';
import path from 'path';
import sharp from 'sharp';
import { computeBrandingMetrics, getStwFooterCompositeTop, getStwFooterZoneHeight } from './stwBrandingMetrics.ts';
import {
  extractTier,
  getCardDimensions,
  getFortniteCardTheme,
  getStarBaselineY,
  getMaxStarsForRarity,
  getStarCenterXs,
  getStarSize,
  isStwSuperchargedLevel,
  normalizeDisplayRarity,
  renderFavoriteBadgeSvg,
  renderPowerFooterSvg,
} from './stwFortniteCard.ts';
import type { BrandingMetrics, CardDimensions, CardTheme, StwCardBrandingContext, StwCardDisplayItem } from './types.ts';
import { getTypeBadgePosition, getTypeBadgeSize, resolveCardTypeIconPath } from './stwCardTypeBadge.ts';
import { buildStwImageFooterBuffer } from '../resources/resourcesFooter.ts';

const STITCH_BG = { r: 13, g: 17, b: 24, alpha: 255 };
const OUTPUT_WEBP = { quality: 92, effort: 1, smartSubsample: true };

const iconBufferCache = new Map<string, Buffer>();
const typeIconBufferCache = new Map<string, Buffer>();
const rarityBgCache = new Map<string, Buffer>();
const overlayPngCache = new Map<string, Buffer>();

function overlayCacheKey(item: StwCardDisplayItem, dims: CardDimensions): string {
  const tier = item.tier ?? extractTier(item.templateId);
  return [
    item.rarity, item.level, tier, item.powerLevel,
    item.isManager ? 1 : 0, item.favorite ? 1 : 0, item.quantity > 1 ? item.quantity : 0,
    dims.width, dims.height,
  ].join('|');
}

function buildCardRimSvg(width: number, height: number, theme: CardTheme): string {
  const rx = 3;
  return `
  <defs>
    <filter id="rimGlow" x="-40%" y="-40%" width="180%" height="180%">
      <feGaussianBlur in="SourceGraphic" stdDeviation="1.6" result="blur"/>
      <feMerge><feMergeNode in="blur"/><feMergeNode in="SourceGraphic"/></feMerge>
    </filter>
    <filter id="rimHalo" x="-50%" y="-50%" width="200%" height="200%">
      <feGaussianBlur in="SourceGraphic" stdDeviation="2.4" result="blur"/>
      <feMerge><feMergeNode in="blur"/><feMergeNode in="SourceGraphic"/></feMerge>
    </filter>
  </defs>
  <rect x="1.5" y="1.5" width="${width - 3}" height="${height - 3}" rx="${rx}" fill="none" stroke="${theme.glow}" stroke-width="4" opacity="0.28"/>
  <rect x="1" y="1" width="${width - 2}" height="${height - 2}" rx="${rx}" fill="none" stroke="${theme.border}" stroke-width="2" opacity="0.95" filter="url(#rimGlow)"/>
  <rect x="0.5" y="0.5" width="${width - 1}" height="${height - 1}" rx="${rx}" fill="none" stroke="${theme.border}" stroke-width="1" opacity="0.65" filter="url(#rimHalo)"/>
  <rect width="${width}" height="${height}" rx="${rx}" fill="none" stroke="rgba(0,0,0,0.45)" stroke-width="1"/>`;
}

function buildRarityBgSvg(dims: CardDimensions, theme: CardTheme): string {
  const { width, height, portraitSize, footerH } = dims;
  const sheenW = Math.round(width * 1.4);
  const sheenH = Math.round(portraitSize * 1.3);
  const sheenX = Math.round(-width * 0.2);
  const sheenY = Math.round(-portraitSize * 0.3);

  return `<svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="base" x1="0%" y1="0%" x2="38%" y2="100%">
      <stop offset="0%" stop-color="${theme.top}"/>
      <stop offset="48%" stop-color="${theme.mid}"/>
      <stop offset="100%" stop-color="${theme.bottom}"/>
    </linearGradient>
    <radialGradient id="vig" cx="50%" cy="95%" rx="55%" ry="40%" gradientUnits="objectBoundingBox">
      <stop offset="0%" stop-color="${theme.bottom}"/>
      <stop offset="72%" stop-color="${theme.vignette}"/>
      <stop offset="100%" stop-color="${theme.vignette}"/>
    </radialGradient>
    <radialGradient id="glow" cx="50%" cy="20%" rx="44%" ry="28%" gradientUnits="objectBoundingBox">
      <stop offset="0%" stop-color="${theme.glow}"/>
      <stop offset="58%" stop-color="${theme.glow}" stop-opacity="0"/>
    </radialGradient>
    <radialGradient id="soft" cx="50%" cy="35%" r="58%" gradientUnits="objectBoundingBox">
      <stop offset="0%" stop-color="rgba(255,255,255,0.14)"/>
      <stop offset="58%" stop-color="rgba(255,255,255,0)"/>
    </radialGradient>
    <linearGradient id="sheen" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="42%" stop-color="transparent"/>
      <stop offset="50%" stop-color="${theme.sheen}"/>
      <stop offset="58%" stop-color="transparent"/>
    </linearGradient>
  </defs>
  <rect width="${width}" height="${height}" rx="3" fill="url(#base)"/>
  <rect width="${width}" height="${height}" rx="3" fill="url(#vig)"/>
  <rect width="${width}" height="${portraitSize}" rx="3" fill="url(#glow)"/>
  <rect x="${sheenX}" y="${sheenY}" width="${sheenW}" height="${sheenH}" fill="url(#sheen)" transform="rotate(-10 ${width / 2} ${portraitSize / 2})"/>
  <rect width="${width}" height="${portraitSize}" rx="3" fill="url(#soft)"/>
  <rect y="${portraitSize}" width="${width}" height="${footerH}" fill="${theme.footer}"/>
  <line x1="${width * 0.08}" y1="${portraitSize + 1}" x2="${width * 0.92}" y2="${portraitSize + 1}" stroke="rgba(200,50,50,0.6)" stroke-width="1"/>
  ${buildCardRimSvg(width, height, theme)}
</svg>`;
}

function buildCardOverlaySvg(item: StwCardDisplayItem, dims: CardDimensions): string {
  const maxStars = getMaxStarsForRarity(item.rarity);
  const tier = Math.min(item.tier ?? extractTier(item.templateId), maxStars);
  const evolved = isStwSuperchargedLevel(item.level);
  const rarityKey = normalizeDisplayRarity(item.rarity);
  const { width, height, portraitSize, footerH } = dims;
  const starFill = evolved ? '#5ce1e6' : '#ffffff';
  const starSize = getStarSize(width, footerH);
  const starY = getStarBaselineY(portraitSize, footerH, height, starSize);
  const starCenters = getStarCenterXs(width, footerH, maxStars);
  const stars = Array.from({ length: maxStars }, (_, index) => {
    const fill = index < tier ? starFill : 'rgba(255,255,255,0.18)';
    return `<text x="${starCenters[index]}" y="${starY}" text-anchor="middle" fill="${fill}" font-family="Segoe UI,sans-serif" font-size="${starSize}">★</text>`;
  }).join('');
  const power = renderPowerFooterSvg(portraitSize, width, item.powerLevel);
  const qty = item.quantity > 1
    ? `<text x="${width - 5}" y="${portraitSize - 6}" fill="#fff" font-family="Segoe UI,sans-serif" font-size="${Math.max(13, Math.round(width * 0.18))}" font-weight="800" text-anchor="end">${item.quantity}</text>`
    : '';
  const mythic = rarityKey === 'er'
    ? `<rect x="1" y="1" width="${width - 2}" height="${height - 2}" rx="3" fill="none" stroke="rgba(255,240,140,0.9)" stroke-width="2"/>`
    : '';
  const manager = item.isManager && rarityKey !== 'er'
    ? `<rect x="1" y="1" width="${width - 2}" height="${height - 2}" rx="3" fill="none" stroke="rgba(255,200,90,0.55)" stroke-width="2"/>`
    : '';
  const favorite = item.favorite ? renderFavoriteBadgeSvg(width) : '';

  return `<svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">
  ${power}
  ${stars}
  ${qty}
  ${mythic}
  ${manager}
  ${favorite}
</svg>`;
}

async function rasterizeSvg(svg: string): Promise<Buffer> {
  return sharp(Buffer.from(svg)).png().toBuffer();
}

async function getRarityBgBuffer(item: StwCardDisplayItem, dims: CardDimensions): Promise<Buffer> {
  const rarityKey = normalizeDisplayRarity(item.rarity);
  const key = `${rarityKey}|${dims.width}|${dims.height}`;
  let buf = rarityBgCache.get(key);
  if (!buf) {
    const theme = getFortniteCardTheme(item.rarity);
    buf = await rasterizeSvg(buildRarityBgSvg(dims, theme));
    rarityBgCache.set(key, buf);
  }
  return buf;
}

async function getOverlayBuffer(item: StwCardDisplayItem, dims: CardDimensions): Promise<Buffer> {
  const key = overlayCacheKey(item, dims);
  let buf = overlayPngCache.get(key);
  if (!buf) {
    buf = await rasterizeSvg(buildCardOverlaySvg(item, dims));
    overlayPngCache.set(key, buf);
  }
  return buf;
}

async function getTypeIconBuffer(iconPath: string, iconSize: number): Promise<Buffer> {
  const key = `${iconPath}|${iconSize}`;
  let buf = typeIconBufferCache.get(key);
  if (!buf) {
    buf = await sharp(iconPath)
      .resize(iconSize, iconSize, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
      .toBuffer();
    typeIconBufferCache.set(key, buf);
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
  await Promise.all(
    Array.from({ length: Math.min(concurrency, items.length || 1) }, () => worker()),
  );
  return results;
}

async function preloadRarityBgs(items: StwCardDisplayItem[], dims: CardDimensions): Promise<void> {
  const seen = new Set<string>();
  await mapConcurrent(items, 16, async (item) => {
    const rarityKey = normalizeDisplayRarity(item.rarity);
    const key = `${rarityKey}|${dims.width}|${dims.height}`;
    if (seen.has(key)) return;
    seen.add(key);
    await getRarityBgBuffer(item, dims);
  });
}

async function preloadTypeIcons(items: StwCardDisplayItem[], badgeSize: number): Promise<void> {
  const paths = new Set<string>();
  for (const item of items) {
    const iconPath = resolveCardTypeIconPath(item.typeKey, item.templateId);
    if (iconPath && fs.existsSync(iconPath)) paths.add(iconPath);
  }
  await mapConcurrent([...paths], 32, async (iconPath) => {
    await getTypeIconBuffer(iconPath, badgeSize);
  });
}

async function preloadIcons(items: StwCardDisplayItem[], iconsDir: string, iconSize: number): Promise<number> {
  const paths = new Set<string>();
  for (const item of items) {
    if (!item.iconFileName) continue;
    const iconPath = resolveItemIconPath(item, iconsDir);
    if (iconPath && fs.existsSync(iconPath)) paths.add(iconPath);
  }
  await mapConcurrent([...paths], 64, async (iconPath) => {
    await getIconBuffer(iconPath, iconSize);
  });
  return paths.size;
}

function resolveItemIconPath(item: StwCardDisplayItem, iconsDir: string): string | null {
  if (!item.iconFileName) return null;
  return path.isAbsolute(item.iconFileName)
    ? item.iconFileName
    : path.join(iconsDir, item.iconFileName);
}

async function renderRowBuffer(
  rowItems: StwCardDisplayItem[],
  iconsDir: string,
  dims: CardDimensions,
  cardGap: number,
): Promise<Buffer> {
  const cols = rowItems.length;
  const rowW = cols * dims.width + (cols - 1) * cardGap;
  const rowH = dims.height;
  const iconSize = Math.round(dims.portraitSize * 0.92);
  const iconTop = dims.portraitSize - iconSize;
  const typeBadgeSize = getTypeBadgeSize(dims.width);
  const layers: sharp.OverlayOptions[] = [];

  for (let col = 0; col < cols; col++) {
    const item = rowItems[col];
    const left = col * (dims.width + cardGap);
    layers.push({ input: await getRarityBgBuffer(item, dims), left, top: 0 });

    if (item.iconFileName) {
      const iconPath = resolveItemIconPath(item, iconsDir);
      if (iconPath && fs.existsSync(iconPath)) {
        layers.push({
          input: await getIconBuffer(iconPath, iconSize),
          left: left + Math.round((dims.width - iconSize) / 2),
          top: iconTop,
        });
      }
    }

    layers.push({ input: await getOverlayBuffer(item, dims), left, top: 0 });

    const typeIconPath = resolveCardTypeIconPath(item.typeKey, item.templateId);
    if (typeIconPath && fs.existsSync(typeIconPath)) {
      const badgePos = getTypeBadgePosition(dims.portraitSize, dims.width, typeBadgeSize);
      layers.push({
        input: await getTypeIconBuffer(typeIconPath, typeBadgeSize),
        left: left + badgePos.x,
        top: badgePos.y,
      });
    }
  }

  return sharp({
    create: { width: rowW, height: rowH, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } },
  })
    .composite(layers)
    .png({ compressionLevel: 3 })
    .toBuffer();
}

function buildHeaderSvg(width: number, title: string, metaLine: string, textX: number, m: BrandingMetrics): Buffer {
  const safeTitle = String(title).replace(/[<>&]/g, '');
  const safeMeta = String(metaLine).replace(/<[^>]+>/g, '').replace(/[<>&]/g, '');
  const titleY = Math.round(m.titleFont * 1.22);
  const metaY = titleY + Math.round(m.metaFont * 1.75);
  const lineY = m.headerH - m.ruleOffset;
  return Buffer.from(`<svg width="${width}" height="${m.headerH}" xmlns="http://www.w3.org/2000/svg">
    <text x="${textX}" y="${titleY}" fill="#f8fafc" font-family="Segoe UI,sans-serif" font-size="${m.titleFont}" font-weight="800">${safeTitle}</text>
    <text x="${textX}" y="${metaY}" fill="rgba(255,255,255,0.62)" font-family="Segoe UI,sans-serif" font-size="${m.metaFont}" font-weight="600">${safeMeta}</text>
    <line x1="0" y1="${lineY}" x2="${width}" y2="${lineY}" stroke="rgba(255,255,255,0.14)" stroke-width="${m.strokeWidth}"/>
  </svg>`);
}

async function buildHeaderBuffer(
  width: number,
  title: string,
  metaLine: string,
  accountAvatarBuf: Buffer | null,
  m: BrandingMetrics,
): Promise<Buffer> {
  const textX = accountAvatarBuf ? m.avatarSize + m.avatarGap : 0;
  const layers: sharp.OverlayOptions[] = [{ input: buildHeaderSvg(width, title, metaLine, textX, m), top: 0, left: 0 }];
  if (accountAvatarBuf) {
    const avatarInput = await sharp(accountAvatarBuf).resize(m.avatarSize, m.avatarSize).png().toBuffer();
    layers.push({ input: avatarInput, left: 0, top: m.avatarTop });
  }
  return sharp({
    create: { width, height: m.headerH, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } },
  }).composite(layers).png().toBuffer();
}

async function buildWatermarkBuffer(
  width: number,
  branding: StwCardBrandingContext,
  _brandIconBuf: Buffer | null,
  m: BrandingMetrics,
): Promise<Buffer> {
  return buildStwImageFooterBuffer(width, m.watermarkH, {
    lang: branding.lang,
    footerIconUrl: branding.footerIconUrl ?? undefined,
  });
}

export interface RenderStwCardsGridOptions {
  items: StwCardDisplayItem[];
  iconsDir: string;
  gridCols: number;
  cardSize: number;
  cardGap?: number;
  title: string;
  metaLine: string;
  bgPath?: string | null;
  branding?: StwCardBrandingContext | null;
  accountAvatarPng?: Buffer | null;
  brandIconPng?: Buffer | null;
  rowConcurrency?: number;
}

export async function renderStwCardsGridToBuffer(options: RenderStwCardsGridOptions): Promise<Buffer> {
  const {
    items,
    iconsDir,
    gridCols,
    cardSize,
    cardGap = 4,
    title,
    metaLine,
    bgPath = null,
    branding = null,
    accountAvatarPng = null,
    brandIconPng = null,
    rowConcurrency = 8,
  } = options;

  const dims = getCardDimensions(cardSize);
  const rows = Math.ceil(items.length / gridCols);
  const padX = 24;
  const padTop = 20;
  const gridPad = 14;
  const gridW = gridCols * dims.width + (gridCols - 1) * cardGap + gridPad * 2;
  const gridH = rows * dims.height + (rows - 1) * cardGap + gridPad * 2;
  const frameW = gridW + padX * 2;
  const brandingMetrics = computeBrandingMetrics(frameW);
  const headerH = brandingMetrics.headerH;
  const watermarkH = branding ? brandingMetrics.watermarkH : 0;
  const footerZoneH = branding ? getStwFooterZoneHeight(watermarkH) : 0;
  const frameH = headerH + padTop + gridH + (footerZoneH || 24);
  const iconSize = Math.round(dims.portraitSize * 0.92);

  await preloadRarityBgs(items, dims);
  await preloadIcons(items, iconsDir, iconSize);
  await preloadTypeIcons(items, getTypeBadgeSize(dims.width));

  const rowIndices = Array.from({ length: rows }, (_, index) => index);
  const rowBuffers = await mapConcurrent(rowIndices, rowConcurrency, async (row) => {
    const start = row * gridCols;
    const rowItems = items.slice(start, start + gridCols);
    return renderRowBuffer(rowItems, iconsDir, dims, cardGap);
  });

  const layers: sharp.OverlayOptions[] = [];
  const bgFile = bgPath ?? path.join(process.cwd(), 'assets/backgrounds/stwshop.png');

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
    input: await buildHeaderBuffer(frameW - padX * 2, title, metaLine, accountAvatarPng, brandingMetrics),
    top: padTop,
    left: padX,
  });

  const gridLeft = padX + gridPad;
  const gridTop = padTop + headerH + gridPad;
  for (let row = 0; row < rows; row++) {
    layers.push({
      input: rowBuffers[row],
      left: gridLeft,
      top: gridTop + row * (dims.height + cardGap),
    });
  }

  if (branding) {
    const gridBottom = padTop + headerH + gridH;
    const footerBuf = await buildWatermarkBuffer(frameW - padX * 2, branding, brandIconPng, brandingMetrics);
    layers.push({
      input: footerBuf,
      top: await getStwFooterCompositeTop(gridBottom, footerZoneH, footerBuf),
      left: padX,
    });
  }

  return sharp({
    create: { width: frameW, height: frameH, channels: 4, background: STITCH_BG },
  })
    .composite(layers)
    .webp(OUTPUT_WEBP)
    .toBuffer();
}

/** Clear per-render caches (call between renders in long-running bot). */
export function clearStwCardRenderCaches(): void {
  iconBufferCache.clear();
  typeIconBufferCache.clear();
  rarityBgCache.clear();
  overlayPngCache.clear();
}
