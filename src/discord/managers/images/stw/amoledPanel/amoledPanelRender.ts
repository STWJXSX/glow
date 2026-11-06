import fs from 'fs';
import sharp from 'sharp';

import { computeBrandingMetrics } from '../campaign/stwBrandingMetrics.ts';
import {
  buildBrandingContext,
  prepareAccountAvatar,
} from '../campaign/stwCardBranding.ts';
import type { StwCardBrandingContext } from '../campaign/types.ts';
import { buildResourcesFooterBuffer } from '../resources/resourcesFooter.ts';
import {
  AMOLED_BG,
  AMOLED_OUTPUT_WEBP,
  CELL_GAP,
  CELL_H,
  CELL_ICON,
  DEFAULT_GRID_COLS,
  DEFAULT_GRID_ROWS,
  DEFAULT_MAX_PAGES,
  PANEL_FOOTER_H,
  PANEL_FOOTER_GAP,
  PANEL_PAD_BOTTOM,
  PANEL_GRID_PAD,
  PANEL_PAD_TOP,
  PANEL_PAD_X,
} from './constants.ts';
import type {
  AmoledGridTile,
  RenderAmoledPanelOptions,
  RenderAmoledPanelPage,
  RenderAmoledPanelResult,
} from './types.ts';

const TRANSPARENT = { r: 0, g: 0, b: 0, alpha: 0 } as const;
const iconCache = new Map<string, Buffer>();

function esc(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function fmtQty(n: number): string {
  if (n >= 1_000_000_000) return `${(n / 1_000_000_000).toFixed(1)}B`;
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 10_000) return `${Math.round(n / 1000)}K`;
  return n.toLocaleString('en-US');
}

async function svgToPng(svg: string): Promise<Buffer> {
  return sharp(Buffer.from(svg)).png().toBuffer();
}

async function loadIcon(iconPath: string | null, size: number): Promise<Buffer | null> {
  if (!iconPath || !fs.existsSync(iconPath)) return null;
  const key = `${iconPath}|${size}`;
  let buf = iconCache.get(key);
  if (!buf) {
    buf = await sharp(iconPath)
      .resize(size, size, { fit: 'contain', background: TRANSPARENT })
      .png()
      .toBuffer();
    iconCache.set(key, buf);
  }
  return buf;
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
  const safeTitle = esc(title);
  const safeMeta = esc(metaLine.replace(/<[^>]+>/g, ''));
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
    create: { width, height: headerH, channels: 4, background: TRANSPARENT },
  }).composite(layers).png().toBuffer();
}

async function renderCell(tile: AmoledGridTile, cellW: number): Promise<Buffer> {
  const icon = await loadIcon(tile.iconPath, CELL_ICON);
  const layers: sharp.OverlayOptions[] = [];

  const bgSvg = `<svg width="${cellW}" height="${CELL_H}" xmlns="http://www.w3.org/2000/svg">
    <rect width="100%" height="100%" rx="10" fill="#0a0a0a" stroke="rgba(255,255,255,0.07)"/>
  </svg>`;
  layers.push({ input: await svgToPng(bgSvg), left: 0, top: 0 });

  if (icon) {
    layers.push({
      input: icon,
      left: Math.floor((cellW - CELL_ICON) / 2),
      top: 8,
    });
  }

  const qtySvg = `<svg width="${cellW}" height="22" xmlns="http://www.w3.org/2000/svg">
    <text x="${cellW / 2}" y="16" fill="#fff" font-family="Segoe UI,sans-serif" font-size="13" font-weight="700" text-anchor="middle">${fmtQty(tile.quantity)}</text>
  </svg>`;
  layers.push({ input: await svgToPng(qtySvg), left: 0, top: CELL_H - 26 });

  return sharp({
    create: { width: cellW, height: CELL_H, channels: 4, background: TRANSPARENT },
  }).composite(layers).png().toBuffer();
}

async function renderGrid(tiles: AmoledGridTile[], gridCols: number, contentW: number): Promise<Buffer> {
  const cellW = Math.floor((contentW - PANEL_GRID_PAD * 2 - (gridCols - 1) * CELL_GAP) / gridCols);
  const rows = Math.max(1, Math.ceil(tiles.length / gridCols));
  const gridW = PANEL_GRID_PAD * 2 + gridCols * cellW + (gridCols - 1) * CELL_GAP;
  const gridH = PANEL_GRID_PAD * 2 + rows * CELL_H + (rows - 1) * CELL_GAP;

  const layers: sharp.OverlayOptions[] = [];
  await Promise.all(tiles.map(async (tile, i) => {
    const col = i % gridCols;
    const row = Math.floor(i / gridCols);
    const cell = await renderCell(tile, cellW);
    layers.push({
      input: cell,
      left: PANEL_GRID_PAD + col * (cellW + CELL_GAP),
      top: PANEL_GRID_PAD + row * (CELL_H + CELL_GAP),
    });
  }));

  return sharp({
    create: { width: gridW, height: gridH, channels: 4, background: TRANSPARENT },
  }).composite(layers).png().toBuffer();
}

function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

export function clearAmoledPanelCaches(): void {
  iconCache.clear();
}

export async function renderAmoledPanel(options: RenderAmoledPanelOptions): Promise<RenderAmoledPanelResult> {
  const {
    title,
    metaLine = '',
    tiles,
    gridCols = DEFAULT_GRID_COLS,
    gridRows = DEFAULT_GRID_ROWS,
    maxPages = DEFAULT_MAX_PAGES,
    branding,
    accessToken,
    accountId,
    discordUserId,
    fileBaseName,
  } = options;

  const perPage = gridCols * gridRows;
  const maxRenderable = perPage * maxPages;
  const truncated = tiles.length > maxRenderable;
  const slice = truncated ? tiles.slice(0, maxRenderable) : tiles;
  const pageChunks = chunk(slice, perPage);
  const pageCount = pageChunks.length;

  const contentW = PANEL_GRID_PAD * 2 + gridCols * 100 + (gridCols - 1) * CELL_GAP;
  const frameW = contentW + PANEL_PAD_X * 2;
  const m = computeBrandingMetrics(frameW);
  const headerH = Math.max(
    m.avatarSize + m.avatarTop * 2,
    Math.round(m.titleFont * 2.15 + m.ruleOffset + 8),
  );

  const brandingCtx: StwCardBrandingContext | null = accountId
    ? buildBrandingContext(title, accountId, branding)
    : null;

  const [accountAvatarPng] = brandingCtx && accessToken && accountId
    ? await Promise.all([
      prepareAccountAvatar(accessToken, accountId, m.avatarSize, discordUserId),
    ])
    : [null];

  const pages: RenderAmoledPanelPage[] = [];

  try {
    for (let i = 0; i < pageChunks.length; i++) {
      const pageTiles = pageChunks[i]!;
      const pageTitle = pageCount > 1 ? `${title} · ${i + 1}/${pageCount}` : title;
      const pageMeta = metaLine.trim();

      const [headerBuf, gridBuf, footerBuf] = await Promise.all([
        buildHeaderBuffer(frameW - PANEL_PAD_X * 2, pageTitle, pageMeta, accountAvatarPng, m, headerH),
        renderGrid(pageTiles, gridCols, contentW),
        buildResourcesFooterBuffer(frameW - PANEL_PAD_X * 2, PANEL_FOOTER_H, branding),
      ]);

      const gridMeta = await sharp(gridBuf).metadata();
      const gridH = gridMeta.height ?? 0;
      const frameH = PANEL_PAD_TOP + headerH + gridH + PANEL_FOOTER_GAP + PANEL_FOOTER_H + PANEL_PAD_BOTTOM;

      const buffer = await sharp({
        create: { width: frameW, height: frameH, channels: 4, background: AMOLED_BG },
      })
        .composite([
          { input: headerBuf, top: PANEL_PAD_TOP, left: PANEL_PAD_X },
          { input: gridBuf, top: PANEL_PAD_TOP + headerH, left: PANEL_PAD_X },
          { input: footerBuf, top: PANEL_PAD_TOP + headerH + gridH + PANEL_FOOTER_GAP, left: PANEL_PAD_X },
        ])
        .webp(AMOLED_OUTPUT_WEBP)
        .toBuffer();

      pages.push({
        buffer,
        fileName: pageCount === 1 ? `${fileBaseName}.webp` : `${fileBaseName}-${i + 1}.webp`,
        itemCount: pageTiles.length,
      });
    }
  } finally {
    clearAmoledPanelCaches();
  }

  return { pages, totalCount: tiles.length, truncated };
}
