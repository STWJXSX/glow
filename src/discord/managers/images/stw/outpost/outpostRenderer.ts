import fs from 'fs';
import path from 'path';

import sharp from 'sharp';

import { RESOURCES_AMOLED_BG, RESOURCES_OUTPUT_WEBP } from '../resources/resourcesConstants.ts';
import { buildResourcesFooterBuffer } from '../resources/resourcesFooter.ts';
import { LAYOUT } from '../resources/resourcesLayout.ts';
import { resolveZoneDifficultyIcon } from '../resources/resourcesAssetResolver.ts';
import type { StwImageBrandingOptions } from '../stwImageBranding.ts';
import type { StwOutpostPanelData } from './types.ts';

const W = LAYOUT.colShieldsW;
const HEADER_H = 88;
const FOOTER_H = 94;
const FOOTER_GAP = 14;
const PAD_BOTTOM = 20;
const TRANSPARENT = { r: 0, g: 0, b: 0, alpha: 0 } as const;

function esc(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

async function svgToPng(svg: string): Promise<Buffer> {
  return sharp(Buffer.from(svg)).png().toBuffer();
}

async function loadIcon(iconPath: string | null, size: number): Promise<Buffer | null> {
  if (!iconPath || !fs.existsSync(iconPath)) return null;
  return sharp(iconPath)
    .resize(size, size, { fit: 'contain', background: TRANSPARENT })
    .png()
    .toBuffer();
}

function resolveBackgroundPath(): string | null {
  const candidates = [
    path.join((import.meta.dirname ?? __dirname), '../resources/resources-background.webp'),
    path.join(process.cwd(), 'src/discord/managers/images/stw/resources/resources-background.webp'),
  ];
  return candidates.find((p) => fs.existsSync(p)) ?? null;
}

async function buildFrameBackground(width: number, height: number): Promise<Buffer> {
  const bgPath = resolveBackgroundPath();
  if (bgPath) {
    return sharp(bgPath)
      .resize(width, height, { fit: 'cover', position: 'centre' })
      .png()
      .toBuffer();
  }
  return sharp({
    create: { width, height, channels: 4, background: RESOURCES_AMOLED_BG },
  })
    .png()
    .toBuffer();
}

function buildHeaderSvg(data: StwOutpostPanelData): string {
  return `<svg width="${W}" height="${HEADER_H}" xmlns="http://www.w3.org/2000/svg">
    <text x="${LAYOUT.pad}" y="34" fill="#fff" font-family="Segoe UI,Arial,sans-serif" font-size="18" font-weight="700">${esc(data.displayName)}</text>
    <text x="${LAYOUT.pad}" y="58" fill="rgba(255,255,255,0.62)" font-family="Segoe UI,Arial,sans-serif" font-size="14" font-weight="600">Storm Shield · Level ${data.homebaseLevel}</text>
    <line x1="0" y1="${HEADER_H - 1}" x2="${W}" y2="${HEADER_H - 1}" stroke="rgba(255,255,255,0.12)" stroke-width="1"/>
  </svg>`;
}

function buildShieldsSvg(data: StwOutpostPanelData): string {
  const shields = data.stormShields.map((zone, i) => {
    const y = LAYOUT.shieldRowStartY + i * LAYOUT.shieldRowH;
    const midY = y + Math.floor(LAYOUT.shieldRowH / 2);
    const pct = zone.max > 0 ? zone.completed / zone.max : 0;
    const barW = Math.round(LAYOUT.shieldBarW * pct);
    const endColor = zone.enduranceComplete ? '#3dff7a' : '#ff3b4d';
    const endMark = zone.enduranceComplete ? '✓' : '✕';
    return `
      <text x="${LAYOUT.shieldLabelX}" y="${midY + 5}" fill="#fff" font-family="Segoe UI,Arial,sans-serif" font-size="15" font-weight="600">${esc(zone.label)}</text>
      <rect x="${LAYOUT.shieldBarX}" y="${midY - 5}" width="${LAYOUT.shieldBarW}" height="${LAYOUT.shieldBarH}" rx="4" fill="#161616"/>
      <rect x="${LAYOUT.shieldBarX}" y="${midY - 5}" width="${barW}" height="${LAYOUT.shieldBarH}" rx="4" fill="#2fd65f"/>
      <text x="${LAYOUT.shieldFracX}" y="${midY + 5}" fill="#fff" font-family="Segoe UI,Arial,sans-serif" font-size="12" font-weight="700">${zone.completed}/${zone.max}</text>
      <rect x="${LAYOUT.shieldEnduranceX}" y="${midY - 12}" width="${LAYOUT.shieldEnduranceW}" height="24" rx="12" fill="#0a0a0a" stroke="#ff3b4d" stroke-width="1"/>
      <text x="${LAYOUT.shieldEnduranceX + LAYOUT.shieldEnduranceW / 2}" y="${midY + 4}" fill="${endColor}" font-family="Segoe UI,Arial,sans-serif" font-size="10" font-weight="700" text-anchor="middle">Endurance ${endMark}</text>
    `;
  }).join('');

  const bodyH = LAYOUT.shieldRowStartY + data.stormShields.length * LAYOUT.shieldRowH + 12;
  return `<svg width="${W}" height="${bodyH}" xmlns="http://www.w3.org/2000/svg">
    ${shields}
  </svg>`;
}

export async function renderStwOutpostImage(
  data: StwOutpostPanelData,
  branding?: Pick<StwImageBrandingOptions, 'footerIconUrl' | 'lang'>,
): Promise<Buffer> {
  const bodyH = LAYOUT.shieldRowStartY + data.stormShields.length * LAYOUT.shieldRowH + 12;
  const frameH = HEADER_H + bodyH + FOOTER_GAP + FOOTER_H + PAD_BOTTOM;

  const [headerBuf, bodyBuf, footerBuf, bgBuf] = await Promise.all([
    svgToPng(buildHeaderSvg(data)),
    svgToPng(buildShieldsSvg(data)),
    buildResourcesFooterBuffer(W, FOOTER_H, branding),
    buildFrameBackground(W, frameH),
  ]);

  const zoneIcons: sharp.OverlayOptions[] = [];
  await Promise.all(data.stormShields.map(async (zone, i) => {
    const icon = await loadIcon(resolveZoneDifficultyIcon(zone.key), LAYOUT.shieldIconSize);
    if (!icon) return;
    const y = HEADER_H + LAYOUT.shieldRowStartY + i * LAYOUT.shieldRowH;
    zoneIcons.push({
      input: icon,
      left: LAYOUT.shieldIconX,
      top: y + Math.floor((LAYOUT.shieldRowH - LAYOUT.shieldIconSize) / 2),
    });
  }));

  return sharp(bgBuf)
    .composite([
      { input: headerBuf, top: 0, left: 0 },
      { input: bodyBuf, top: HEADER_H, left: 0 },
      ...zoneIcons,
      { input: footerBuf, top: HEADER_H + bodyH + FOOTER_GAP, left: 0 },
    ])
    .webp(RESOURCES_OUTPUT_WEBP)
    .toBuffer();
}
