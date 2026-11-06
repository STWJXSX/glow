import fs from 'fs';
import path from 'path';
import sharp from 'sharp';
import axios from 'axios';

import { RESOURCES_OUTPUT_WEBP } from './resourcesConstants.ts';
import { buildStwImageFooterBuffer } from './resourcesFooter.ts';
import { MODERN_LAYOUT } from './resourcesLayout.ts';
import { resolveZoneEmblemIcon, resolveStwAssetPath } from './resourcesAssetResolver.ts';
import type { StwImageBrandingOptions } from '../stwImageBranding.ts';
import type { StwResourcesPanelData, StwResourceTile } from './types.ts';

const L = MODERN_LAYOUT;
const W = L.width; // 1200
const PAD = L.pad; // 28
const INNER_W = L.innerW; // 1144
const TRANSPARENT = { r: 0, g: 0, b: 0, alpha: 0 } as const;

function esc(text: string): string {
  return String(text ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function fmtQty(n: number): string {
  if (n >= 1_000_000_000) return `${(n / 1_000_000_000).toFixed(1)}B`;
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 10_000) return `${Math.round(n / 1000)}K`;
  return n.toLocaleString('en-US');
}

function fmtNum(n: number): string {
  return n.toLocaleString('en-US');
}

async function svgToPng(svg: string): Promise<Buffer> {
  return sharp(Buffer.from(svg)).png().toBuffer();
}

async function loadIcon(iconPath: string | null, iconUrl: string | null, size: number): Promise<Buffer | null> {
  if (iconPath && fs.existsSync(iconPath)) {
    try {
      return await sharp(iconPath)
        .resize(size, size, { fit: 'contain', background: TRANSPARENT })
        .png()
        .toBuffer();
    } catch {
      // fallback
    }
  }

  if (iconUrl) {
    try {
      const { data } = await axios.get<ArrayBuffer>(iconUrl, {
        responseType: 'arraybuffer',
        timeout: 8_000,
        validateStatus: (status) => status < 400,
      });
      return await sharp(Buffer.from(data))
        .resize(size, size, { fit: 'contain', background: TRANSPARENT })
        .png()
        .toBuffer();
    } catch {
      return null;
    }
  }

  return null;
}

function resolveBackgroundPath(): string | null {
  const candidates = [
    resolveStwAssetPath('assets/backgrounds/commandroom.png'),
    resolveStwAssetPath('assets/backgrounds/map.png'),
    resolveStwAssetPath('assets/backgrounds/stwshop.png'),
    path.join((import.meta.dirname ?? __dirname), 'resources-background.webp'),
  ];
  return candidates.find((p) => p && fs.existsSync(p)) ?? null;
}

async function buildDarkAtmosphericBackground(width: number, height: number): Promise<Buffer> {
  const bgPath = resolveBackgroundPath();

  const overlaySvg = `
    <svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <radialGradient id="stormNebula" cx="50%" cy="8%" r="75%">
          <stop offset="0%" stop-color="#4c1d95" stop-opacity="0.38"/>
          <stop offset="40%" stop-color="#1e1b4b" stop-opacity="0.2"/>
          <stop offset="100%" stop-color="#090b14" stop-opacity="0"/>
        </radialGradient>
        <radialGradient id="cyanAccent" cx="15%" cy="30%" r="50%">
          <stop offset="0%" stop-color="#0891b2" stop-opacity="0.12"/>
          <stop offset="100%" stop-color="#0891b2" stop-opacity="0"/>
        </radialGradient>
        <linearGradient id="darkCover" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stop-color="#0b0d18" stop-opacity="0.82"/>
          <stop offset="45%" stop-color="#080a13" stop-opacity="0.9"/>
          <stop offset="100%" stop-color="#05060b" stop-opacity="0.97"/>
        </linearGradient>
        <linearGradient id="borderGlow" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stop-color="rgba(168, 85, 247, 0.4)"/>
          <stop offset="50%" stop-color="rgba(59, 130, 246, 0.2)"/>
          <stop offset="100%" stop-color="rgba(16, 185, 129, 0.3)"/>
        </linearGradient>
      </defs>
      <rect width="${width}" height="${height}" fill="url(#darkCover)"/>
      <rect width="${width}" height="${height}" fill="url(#stormNebula)"/>
      <rect width="${width}" height="${height}" fill="url(#cyanAccent)"/>
      <!-- Ambient Outer Frame -->
      <rect x="1" y="1" width="${width - 2}" height="${height - 2}" rx="14" fill="none" stroke="url(#borderGlow)" stroke-width="1.5"/>
    </svg>
  `;

  if (bgPath) {
    try {
      const baseBg = await sharp(bgPath)
        .resize(width, height, { fit: 'cover', position: 'centre' })
        .blur(6)
        .toBuffer();

      return sharp(baseBg)
        .composite([{ input: Buffer.from(overlaySvg), top: 0, left: 0 }])
        .png()
        .toBuffer();
    } catch {
      // fallback to procedural gradient
    }
  }

  return sharp({
    create: { width, height, channels: 4, background: { r: 8, g: 10, b: 18, alpha: 255 } },
  })
    .composite([{ input: Buffer.from(overlaySvg), top: 0, left: 0 }])
    .png()
    .toBuffer();
}

function buildHeaderSvg(data: StwResourcesPanelData, hasAvatar = false): string {
  const h = L.headerH;
  const displayName = data.displayName || 'Commander';
  const founderEdition = data.founderEdition || 'Standard Edition';

  let founderBg = 'rgba(245, 158, 11, 0.15)';
  let founderBorder = 'rgba(245, 158, 11, 0.5)';
  let founderColor = '#fbbf24';
  if (/ultimate/i.test(founderEdition)) {
    founderBg = 'rgba(236, 72, 153, 0.2)';
    founderBorder = 'rgba(236, 72, 153, 0.6)';
    founderColor = '#f472b6';
  } else if (/limited/i.test(founderEdition)) {
    founderBg = 'rgba(168, 85, 247, 0.2)';
    founderBorder = 'rgba(168, 85, 247, 0.6)';
    founderColor = '#c084fc';
  } else if (!/founder/i.test(founderEdition)) {
    founderBg = 'rgba(148, 163, 184, 0.12)';
    founderBorder = 'rgba(148, 163, 184, 0.3)';
    founderColor = '#94a3b8';
  }

  return `
    <svg width="${W}" height="${h}" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <linearGradient id="headerGrad" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stop-color="rgba(24, 30, 52, 0.85)"/>
          <stop offset="100%" stop-color="rgba(14, 18, 32, 0.9)"/>
        </linearGradient>
        <linearGradient id="powerBadgeGrad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stop-color="rgba(245, 158, 11, 0.18)"/>
          <stop offset="100%" stop-color="rgba(245, 158, 11, 0.05)"/>
        </linearGradient>
        <linearGradient id="bookBadgeGrad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stop-color="rgba(59, 130, 246, 0.18)"/>
          <stop offset="100%" stop-color="rgba(59, 130, 246, 0.05)"/>
        </linearGradient>
      </defs>

      <!-- Glass Container -->
      <rect x="${PAD}" y="0" width="${INNER_W}" height="${h}" rx="14" fill="url(#headerGrad)" stroke="rgba(255,255,255,0.09)" stroke-width="1"/>

      <!-- Commander Avatar Ring -->
      <circle cx="${PAD + 44}" cy="${h / 2}" r="27" fill="${hasAvatar ? '#0b0f19' : 'rgba(255,255,255,0.04)'}" stroke="rgba(59, 130, 246, 0.5)" stroke-width="1.5"/>
      ${!hasAvatar ? `
      <!-- Fallback Silhouette -->
      <g transform="translate(${PAD + 31}, ${h / 2 - 13})" fill="rgba(255,255,255,0.35)">
        <path d="M13 13a6.5 6.5 0 1 0-6.5-6.5A6.5 6.5 0 0 0 13 13zm0 3c-4.4 0-13 2.2-13 6.6V26h26v-3.4c0-4.4-8.6-6.6-13-6.6z"/>
      </g>
      ` : ''}

      <!-- Commander Name & Subtitle -->
      <text x="${PAD + 84}" y="${h / 2 - 6}" fill="#ffffff" font-family="'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif" font-size="22" font-weight="800" letter-spacing="0.3">${esc(displayName)}</text>
      
      <!-- Founder Edition Pill Badge -->
      <rect x="${PAD + 84}" y="${h / 2 + 5}" width="168" height="22" rx="11" fill="${founderBg}" stroke="${founderBorder}" stroke-width="1"/>
      <text x="${PAD + 96}" y="${h / 2 + 20}" fill="${founderColor}" font-family="'Segoe UI', Roboto, sans-serif" font-size="11" font-weight="700" letter-spacing="0.5">★ ${esc(founderEdition.toUpperCase())}</text>

      <!-- Stat 1: Power Level (Unboxed) -->
      <g transform="translate(${W - PAD - 365}, 16)">
        <text x="54" y="21" fill="rgba(251, 191, 36, 0.92)" font-family="'Segoe UI', Roboto, sans-serif" font-size="10.5" font-weight="700" letter-spacing="0.8">HOMEBASE POWER</text>
        <text x="54" y="47" fill="#ffffff" font-family="'Segoe UI', Roboto, sans-serif" font-size="25" font-weight="900">${data.homebaseLevel}</text>
      </g>

      <!-- Subtle vertical divider between stats -->
      <line x1="${W - PAD - 190}" y1="20" x2="${W - PAD - 190}" y2="68" stroke="rgba(255,255,255,0.08)" stroke-width="1"/>

      <!-- Stat 2: Collection Book (Unboxed) -->
      <g transform="translate(${W - PAD - 170}, 16)">
        <text x="54" y="21" fill="rgba(96, 165, 250, 0.92)" font-family="'Segoe UI', Roboto, sans-serif" font-size="10.5" font-weight="700" letter-spacing="0.8">COLLECTION BOOK</text>
        <text x="54" y="47" fill="#ffffff" font-family="'Segoe UI', Roboto, sans-serif" font-size="25" font-weight="900">${data.collectionBookLevel}</text>
      </g>
    </svg>
  `;
}

function buildTopCardsSvg(data: StwResourcesPanelData): string {
  const cardH = L.topCardsH; // 312
  const gap = 20;
  const colW = Math.floor((INNER_W - gap) / 2); // ~562px
  const leftX = PAD;
  const rightX = PAD + colW + gap;

  // Storm Shield Defenses
  const totalCompleted = data.stormShields.reduce((acc, z) => acc + z.completed, 0);
  const totalMax = data.stormShields.reduce((acc, z) => acc + z.max, 0);

  const shieldRows = data.stormShields.map((zone, i) => {
    const rowY = 56 + i * 58;
    const barW = 140;
    const pct = zone.max > 0 ? zone.completed / zone.max : 0;
    const fillW = Math.round(barW * pct);
    const endDone = zone.enduranceComplete;
    const endBg = endDone ? 'rgba(16, 185, 129, 0.18)' : 'rgba(239, 68, 68, 0.1)';
    const endStroke = endDone ? 'rgba(16, 185, 129, 0.6)' : 'rgba(239, 68, 68, 0.35)';
    const endColor = endDone ? '#34d399' : '#f87171';
    const endText = endDone ? 'Endurance ✓' : 'Endurance ✕';

    return `
      <!-- Zone Row ${i + 1} -->
      <g transform="translate(0, ${rowY})">
        <!-- Zone Row Ambient Background -->
        <rect x="${leftX + 16}" y="0" width="${colW - 32}" height="50" rx="8" fill="rgba(255,255,255,0.02)"/>

        <!-- Zone Emblem Container Tile -->
        <rect x="${leftX + 22}" y="6" width="38" height="38" rx="8" fill="rgba(255,255,255,0.04)" stroke="rgba(255,255,255,0.07)" stroke-width="1"/>

        <!-- Zone Name -->
        <text x="${leftX + 68}" y="31" fill="#ffffff" font-family="'Segoe UI', Roboto, sans-serif" font-size="14.5" font-weight="700">${esc(zone.label)}</text>

        <!-- Progress Bar Track -->
        <rect x="${leftX + 215}" y="20" width="${barW}" height="10" rx="5" fill="rgba(255,255,255,0.08)"/>
        ${fillW > 0 ? `<rect x="${leftX + 215}" y="20" width="${fillW}" height="10" rx="5" fill="url(#shieldBarGrad)"/>` : ''}

        <!-- Fraction Count -->
        <text x="${leftX + 215 + barW + 14}" y="29" fill="#e2e8f0" font-family="'Segoe UI', Roboto, sans-serif" font-size="12.5" font-weight="800">${zone.completed}/${zone.max}</text>

        <!-- Endurance Status Pill -->
        <rect x="${leftX + colW - 142}" y="13" width="126" height="25" rx="12.5" fill="${endBg}" stroke="${endStroke}" stroke-width="1"/>
        <text x="${leftX + colW - 79}" y="29.5" fill="${endColor}" font-family="'Segoe UI', Roboto, sans-serif" font-size="11" font-weight="700" text-anchor="middle">${endText}</text>
      </g>
    `;
  }).join('');

  // Challenges (7 items in 2 columns: left 4 items, right 3 items + 1 summary slot)
  const completedChallenges = data.challenges.filter((c) => c.complete).length;
  const challengeColsW = Math.floor((colW - 44) / 2); // ~259px each

  const challengeCards = data.challenges.map((c, i) => {
    const isRightCol = i >= 4;
    const colIdx = isRightCol ? 1 : 0;
    const rowIdx = isRightCol ? i - 4 : i;
    const itemX = rightX + 16 + colIdx * (challengeColsW + 12);
    const itemY = 58 + rowIdx * 56;
    const itemW = challengeColsW;
    const itemH = 48;

    const pct = c.target > 0 ? Math.min(1, c.current / c.target) : 0;
    const barW = Math.round((itemW - 20) * pct);
    const isDone = c.complete;

    const borderStroke = isDone ? 'rgba(16, 185, 129, 0.5)' : 'rgba(255, 255, 255, 0.07)';
    const itemBg = isDone ? 'rgba(16, 185, 129, 0.08)' : 'rgba(255, 255, 255, 0.03)';
    const barFill = isDone ? '#10b981' : 'url(#challengeBarGrad)';
    const progressColor = isDone ? '#34d399' : 'rgba(255, 255, 255, 0.65)';

    return `
      <g transform="translate(${itemX}, ${itemY})">
        <rect width="${itemW}" height="${itemH}" rx="8" fill="${itemBg}" stroke="${borderStroke}" stroke-width="1"/>
        
        <!-- Challenge Name -->
        <text x="10" y="19" fill="#ffffff" font-family="'Segoe UI', Roboto, sans-serif" font-size="11.5" font-weight="700">${esc(c.label)}</text>
        ${isDone ? `<text x="${itemW - 10}" y="19" fill="#34d399" font-family="'Segoe UI', Roboto, sans-serif" font-size="11" font-weight="800" text-anchor="end">✓</text>` : ''}

        <!-- Numbers (e.g. 12 / 100) -->
        <text x="10" y="32" fill="${progressColor}" font-family="'Segoe UI', Roboto, sans-serif" font-size="10" font-weight="600">${fmtNum(c.current)} / ${fmtNum(c.target)}</text>

        <!-- Progress Bar -->
        <rect x="10" y="38" width="${itemW - 20}" height="4" rx="2" fill="rgba(255,255,255,0.09)"/>
        ${barW > 0 ? `<rect x="10" y="38" width="${barW}" height="4" rx="2" fill="${barFill}"/>` : ''}
      </g>
    `;
  }).join('');

  const milestoneSlot = data.challenges.length === 7 ? `
    <g transform="translate(${rightX + 16 + (challengeColsW + 12)}, ${58 + 3 * 56})">
      <rect width="${challengeColsW}" height="48" rx="8" fill="rgba(245, 158, 11, 0.08)" stroke="rgba(245, 158, 11, 0.3)" stroke-width="1"/>
      <text x="10" y="19" fill="#fbbf24" font-family="'Segoe UI', Roboto, sans-serif" font-size="11.5" font-weight="700">★ Total Progress</text>
      <text x="${challengeColsW - 10}" y="19" fill="#fbbf24" font-family="'Segoe UI', Roboto, sans-serif" font-size="11" font-weight="800" text-anchor="end">${Math.round((completedChallenges / 7) * 100)}%</text>
      <text x="10" y="32" fill="rgba(255, 255, 255, 0.65)" font-family="'Segoe UI', Roboto, sans-serif" font-size="10" font-weight="600">${completedChallenges} of 7 Completed</text>
      <rect x="10" y="38" width="${challengeColsW - 20}" height="4" rx="2" fill="rgba(255,255,255,0.09)"/>
      <rect x="10" y="38" width="${Math.round((challengeColsW - 20) * (completedChallenges / 7))}" height="4" rx="2" fill="#fbbf24"/>
    </g>
  ` : '';

  return `
    <svg width="${W}" height="${cardH}" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <linearGradient id="cardBg" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stop-color="rgba(18, 24, 42, 0.8)"/>
          <stop offset="100%" stop-color="rgba(12, 16, 28, 0.85)"/>
        </linearGradient>
        <linearGradient id="shieldBarGrad" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stop-color="#06b6d4"/>
          <stop offset="100%" stop-color="#10b981"/>
        </linearGradient>
        <linearGradient id="challengeBarGrad" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stop-color="#3b82f6"/>
          <stop offset="100%" stop-color="#06b6d4"/>
        </linearGradient>
      </defs>

      <!-- Left Card: Storm Shield Defenses -->
      <g>
        <rect x="${leftX}" y="0" width="${colW}" height="${cardH}" rx="14" fill="url(#cardBg)" stroke="rgba(255,255,255,0.08)" stroke-width="1"/>
        
        <!-- Header -->
        <text x="${leftX + 48}" y="32" fill="#e2e8f0" font-family="'Segoe UI', Roboto, sans-serif" font-size="13" font-weight="800" letter-spacing="1">STORM SHIELD DEFENSES</text>
        <rect x="${leftX + colW - 110}" y="16" width="94" height="22" rx="11" fill="rgba(59, 130, 246, 0.15)" stroke="rgba(59, 130, 246, 0.4)" stroke-width="1"/>
        <text x="${leftX + colW - 63}" y="31" fill="#60a5fa" font-family="'Segoe UI', Roboto, sans-serif" font-size="11" font-weight="700" text-anchor="middle">${totalCompleted}/${totalMax} Total</text>
        
        <line x1="${leftX + 16}" y1="46" x2="${leftX + colW - 16}" y2="46" stroke="rgba(255,255,255,0.06)" stroke-width="1"/>

        ${shieldRows}
      </g>

      <!-- Right Card: Campaign Challenges -->
      <g>
        <rect x="${rightX}" y="0" width="${colW}" height="${cardH}" rx="14" fill="url(#cardBg)" stroke="rgba(255,255,255,0.08)" stroke-width="1"/>
        
        <!-- Header -->
        <text x="${rightX + 48}" y="32" fill="#e2e8f0" font-family="'Segoe UI', Roboto, sans-serif" font-size="13" font-weight="800" letter-spacing="1">CAMPAIGN CHALLENGES</text>
        <rect x="${rightX + colW - 135}" y="16" width="119" height="22" rx="11" fill="rgba(16, 185, 129, 0.15)" stroke="rgba(16, 185, 129, 0.4)" stroke-width="1"/>
        <text x="${rightX + colW - 75}" y="31" fill="#34d399" font-family="'Segoe UI', Roboto, sans-serif" font-size="11" font-weight="700" text-anchor="middle">${completedChallenges} / ${data.challenges.length} Complete</text>
        
        <line x1="${rightX + 16}" y1="46" x2="${rightX + colW - 16}" y2="46" stroke="rgba(255,255,255,0.06)" stroke-width="1"/>

        ${challengeCards}
        ${milestoneSlot}
      </g>
    </svg>
  `;
}

async function buildModernResourcesSection(data: StwResourcesPanelData): Promise<{ buffer: Buffer; height: number }> {
  const items = data.resources.length ? data.resources : [];
  const cols = L.resCols;
  const rows = Math.max(1, Math.ceil(items.length / cols));
  
  const cellGapX = L.resCellGapX;
  const cellGapY = L.resCellGapY;
  const padInner = L.resPadInner;
  const cellW = Math.floor((INNER_W - padInner * 2 - (cols - 1) * cellGapX) / cols); // ~146px
  const cellH = L.resCellH;

  const headerH = L.resHeaderH;
  const sectionH = headerH + padInner + rows * cellH + (rows - 1) * cellGapY + padInner;

  const containerSvg = `
    <svg width="${W}" height="${sectionH}" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <linearGradient id="resBg" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stop-color="rgba(18, 24, 42, 0.8)"/>
          <stop offset="100%" stop-color="rgba(12, 16, 28, 0.85)"/>
        </linearGradient>
      </defs>
      <rect x="${PAD}" y="0" width="${INNER_W}" height="${sectionH}" rx="14" fill="url(#resBg)" stroke="rgba(255,255,255,0.08)" stroke-width="1"/>
      
      <!-- Section Header -->
      <text x="${PAD + 44}" y="32" fill="#e2e8f0" font-family="'Segoe UI', Roboto, sans-serif" font-size="13" font-weight="800" letter-spacing="1">ACCOUNT RESOURCES &amp; MATERIALS</text>
      <rect x="${W - PAD - 130}" y="15" width="110" height="22" rx="11" fill="rgba(255,255,255,0.05)" stroke="rgba(255,255,255,0.12)" stroke-width="1"/>
      <text x="${W - PAD - 75}" y="30" fill="rgba(255,255,255,0.7)" font-family="'Segoe UI', Roboto, sans-serif" font-size="11" font-weight="700" text-anchor="middle">${items.length} Items Listed</text>

      <line x1="${PAD + 16}" y1="${headerH}" x2="${W - PAD - 16}" y2="${headerH}" stroke="rgba(255,255,255,0.06)" stroke-width="1"/>
    </svg>
  `;

  const layers: sharp.OverlayOptions[] = [];
  const iconSize = 44;

  await Promise.all(items.map(async (res, i) => {
    const col = i % cols;
    const row = Math.floor(i / cols);
    const x = PAD + padInner + col * (cellW + cellGapX);
    const y = headerH + padInner + row * (cellH + cellGapY);

    const cellLayers: sharp.OverlayOptions[] = [];

    const icon = await loadIcon(res.iconPath, res.iconUrl, iconSize);
    if (icon) {
      cellLayers.push({
        input: icon,
        top: 8,
        left: Math.floor((cellW - iconSize) / 2),
      });
    }

    const cardSvg = `
      <svg width="${cellW}" height="${cellH}" xmlns="http://www.w3.org/2000/svg">
        <rect width="${cellW}" height="${cellH}" rx="10" fill="rgba(255,255,255,0.025)" stroke="rgba(255,255,255,0.07)" stroke-width="1"/>
        <!-- Quantity -->
        <text x="${cellW / 2}" y="67" fill="#ffffff" font-family="'Segoe UI', Roboto, sans-serif" font-size="14.5" font-weight="800" text-anchor="middle">${fmtQty(res.quantity)}</text>
        <!-- Resource Label -->
        <text x="${cellW / 2}" y="82" fill="rgba(255,255,255,0.55)" font-family="'Segoe UI', Roboto, sans-serif" font-size="9" font-weight="600" text-anchor="middle">${esc(res.label.length > 18 ? res.label.slice(0, 16) + '...' : res.label)}</text>
      </svg>
    `;

    const cellBuf = await sharp(Buffer.from(cardSvg))
      .composite(cellLayers)
      .png()
      .toBuffer();

    layers.push({
      input: cellBuf,
      left: x,
      top: y,
    });
  }));

  const bgBuf = await svgToPng(containerSvg);
  const buffer = await sharp(bgBuf)
    .composite(layers)
    .png()
    .toBuffer();

  return { buffer, height: sectionH };
}

function buildModernSchematicsSvg(data: StwResourcesPanelData): string {
  const s = data.schematics;
  const sectionH = L.schemH; // 290
  const gap = 20;
  const colW = Math.floor((INNER_W - gap) / 2);
  const leftX = PAD;
  const rightX = PAD + colW + gap;

  // Power Level Tiers
  const plTiers = [
    { label: '⚡ 144', subtitle: 'Supercharged Max', count: s.pl144, color: '#fbbf24', bg: 'rgba(251, 191, 36, 0.12)', border: 'rgba(251, 191, 36, 0.4)' },
    { label: '⚡ 130', subtitle: 'Tier 5 Max Power', count: s.pl130, color: '#f97316', bg: 'rgba(249, 115, 22, 0.12)', border: 'rgba(249, 115, 22, 0.4)' },
    { label: '⚡ 106', subtitle: 'Tier 4 / Shadowshard', count: s.pl106, color: '#a855f7', bg: 'none', border: 'rgba(255, 255, 255, 0.08)' },
    { label: '⚡ 77', subtitle: 'Tier 3 / Malachite', count: s.pl77, color: '#3b82f6', bg: 'none', border: 'rgba(255, 255, 255, 0.08)' },
    { label: '⚡ 51', subtitle: 'Tier 2 / Silver', count: s.pl51, color: '#22c55e', bg: 'rgba(34, 197, 94, 0.12)', border: 'rgba(34, 197, 94, 0.4)' },
    { label: '⚡ 26', subtitle: 'Tier 1 / Copper', count: s.pl26, color: '#94a3b8', bg: 'rgba(148, 163, 184, 0.1)', border: 'rgba(148, 163, 184, 0.3)' },
  ];

  // Star & Supercharged Tiers
  const starTiers = [
    { label: '⚡ Supercharged', subtitle: 'Overcharged Power', count: s.supercharged, color: '#38bdf8', bg: 'none', border: 'rgba(255, 255, 255, 0.08)' },
    { label: '5 ★', subtitle: 'Sunbeam / Brightcore', count: s.stars5, color: '#eab308', bg: 'rgba(234, 179, 8, 0.12)', border: 'rgba(234, 179, 8, 0.4)' },
    { label: '4 ★', subtitle: 'Shadowshard / Obsidian', count: s.stars4, color: '#c084fc', bg: 'none', border: 'rgba(255, 255, 255, 0.08)' },
    { label: '3 ★', subtitle: 'Malachite Ore', count: s.stars3, color: '#60a5fa', bg: 'none', border: 'rgba(255, 255, 255, 0.08)' },
    { label: '2 ★', subtitle: 'Silver Ore', count: s.stars2, color: '#4ade80', bg: 'rgba(74, 222, 128, 0.12)', border: 'rgba(74, 222, 128, 0.4)' },
    { label: '1 ★', subtitle: 'Copper Ore', count: s.stars1, color: '#94a3b8', bg: 'rgba(148, 163, 184, 0.1)', border: 'rgba(148, 163, 184, 0.3)' },
  ];

  const renderRows = (items: typeof plTiers, baseX: number) => items.map((item, i) => {
    const rowY = 58 + i * 36;
    const rowW = colW - 32;
    const badgeW = item.label.length > 7 ? 112 : 62;
    const subX = 12 + badgeW;
    const hasBg = item.bg !== 'none';
    return `
      <g transform="translate(${baseX + 16}, ${rowY})">
        <rect width="${rowW}" height="30" rx="6" fill="${item.count > 0 ? 'rgba(255,255,255,0.04)' : 'rgba(255,255,255,0.015)'}" stroke="${item.count > 0 ? item.border : 'rgba(255,255,255,0.04)'}" stroke-width="1"/>
        
        <!-- Tier Badge -->
        ${hasBg ? `<rect x="4" y="3" width="${badgeW}" height="24" rx="4" fill="${item.bg}"/>` : ''}
        <text x="${4 + badgeW / 2}" y="19" fill="${item.color}" font-family="'Segoe UI', Roboto, sans-serif" font-size="11.5" font-weight="800" text-anchor="middle">${esc(item.label)}</text>

        <!-- Subtitle -->
        <text x="${subX}" y="20" fill="rgba(255,255,255,0.5)" font-family="'Segoe UI', Roboto, sans-serif" font-size="11" font-weight="600">${esc(item.subtitle)}</text>

        <!-- Value Counter -->
        <rect x="${rowW - 54}" y="3" width="50" height="24" rx="4" fill="${item.count > 0 ? (hasBg ? item.bg : 'rgba(255,255,255,0.05)') : 'rgba(255,255,255,0.03)'}"/>
        <text x="${rowW - 29}" y="19.5" fill="${item.count > 0 ? '#ffffff' : 'rgba(255,255,255,0.3)'}" font-family="'Segoe UI', Roboto, sans-serif" font-size="13" font-weight="800" text-anchor="middle">${item.count}</text>
      </g>
    `;
  }).join('');

  return `
    <svg width="${W}" height="${sectionH}" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <linearGradient id="schemBg" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stop-color="rgba(18, 24, 42, 0.8)"/>
          <stop offset="100%" stop-color="rgba(12, 16, 28, 0.85)"/>
        </linearGradient>
      </defs>

      <!-- Full-Width Container -->
      <rect x="${PAD}" y="0" width="${INNER_W}" height="${sectionH}" rx="14" fill="url(#schemBg)" stroke="rgba(255,255,255,0.08)" stroke-width="1"/>
      
      <!-- Header -->
      <text x="${PAD + 44}" y="32" fill="#e2e8f0" font-family="'Segoe UI', Roboto, sans-serif" font-size="13" font-weight="800" letter-spacing="1">SCHEMATICS &amp; ARSENAL BREAKDOWN</text>
      
      <!-- Legacy Schematics Pill -->
      <rect x="${W - PAD - 210}" y="15" width="190" height="22" rx="11" fill="rgba(245, 158, 11, 0.12)" stroke="rgba(245, 158, 11, 0.4)" stroke-width="1"/>
      <text x="${W - PAD - 115}" y="30" fill="#fbbf24" font-family="'Segoe UI', Roboto, sans-serif" font-size="11" font-weight="700" text-anchor="middle">Legacy Schematics: ${s.legacy}</text>

      <line x1="${PAD + 16}" y1="46" x2="${W - PAD - 16}" y2="46" stroke="rgba(255,255,255,0.06)" stroke-width="1"/>

      <!-- Center Divider Line between Left & Right Columns -->
      <line x1="${PAD + colW + gap / 2}" y1="52" x2="${PAD + colW + gap / 2}" y2="${sectionH - 16}" stroke="rgba(255,255,255,0.06)" stroke-width="1"/>

      <!-- Left Column: Power Levels -->
      ${renderRows(plTiers, leftX)}

      <!-- Right Column: Stars -->
      ${renderRows(starTiers, rightX)}
    </svg>
  `;
}

export async function renderStwResourcesImage(
  data: StwResourcesPanelData,
  branding?: Pick<StwImageBrandingOptions, 'footerIconUrl' | 'lang'>,
  accountAvatarBuf?: Buffer | null,
): Promise<Buffer> {
  const hasAvatar = Boolean(accountAvatarBuf);
  const headerBuf = await svgToPng(buildHeaderSvg(data, hasAvatar));
  const topCardsBuf = await svgToPng(buildTopCardsSvg(data));
  const resourcesGrid = await buildModernResourcesSection(data);
  const schematicsBuf = await svgToPng(buildModernSchematicsSvg(data));
  const footerBuf = await buildStwImageFooterBuffer(W, L.footerH, branding);

  const headerH = L.headerH;
  const gapY = L.gapY;
  const topCardsH = L.topCardsH;
  const resH = resourcesGrid.height;
  const schemH = L.schemH;
  const footerH = L.footerH;

  const totalH = PAD + headerH + gapY + topCardsH + gapY + resH + gapY + schemH + gapY + footerH + PAD;

  const bgBuf = await buildDarkAtmosphericBackground(W, totalH);

  const overlayLayers: sharp.OverlayOptions[] = [
    { input: headerBuf, top: PAD, left: 0 },
    { input: topCardsBuf, top: PAD + headerH + gapY, left: 0 },
    { input: resourcesGrid.buffer, top: PAD + headerH + gapY + topCardsH + gapY, left: 0 },
    { input: schematicsBuf, top: PAD + headerH + gapY + topCardsH + gapY + resH + gapY, left: 0 },
    { input: footerBuf, top: PAD + headerH + gapY + topCardsH + gapY + resH + gapY + schemH + gapY, left: 0 },
  ];

  // User Account Avatar in Header
  if (accountAvatarBuf) {
    try {
      const avatarSize = 54;
      const mask = Buffer.from(
        `<svg width="${avatarSize}" height="${avatarSize}"><circle cx="${avatarSize / 2}" cy="${avatarSize / 2}" r="${avatarSize / 2}" fill="#fff"/></svg>`,
      );
      const ring = Buffer.from(
        `<svg width="${avatarSize}" height="${avatarSize}"><circle cx="${avatarSize / 2}" cy="${avatarSize / 2}" r="${avatarSize / 2 - 0.75}" fill="none" stroke="rgba(59, 130, 246, 0.6)" stroke-width="1.5"/></svg>`,
      );
      const roundedAvatar = await sharp(accountAvatarBuf)
        .resize(avatarSize, avatarSize, { fit: 'cover', position: 'centre' })
        .composite([
          { input: mask, blend: 'dest-in' },
          { input: ring, blend: 'over' },
        ])
        .png()
        .toBuffer();

      overlayLayers.push({
        input: roundedAvatar,
        left: PAD + 17,
        top: PAD + Math.floor((headerH - avatarSize) / 2),
      });
    } catch {
      // ignore
    }
  }

  // Header Power Icon
  const powerIconPath = resolveStwAssetPath('assets/stw-catalog/zones/icon/power.webp');
  const powerIcon = await loadIcon(powerIconPath, null, 36);
  if (powerIcon) {
    overlayLayers.push({
      input: powerIcon,
      left: W - PAD - 365 + 10,
      top: PAD + 26,
    });
  }

  // Header Collection Book Icon
  const bookIconPath = resolveStwAssetPath('assets/icons/stw/llamas/T-CollectionBook-Bang.png');
  const bookIcon = await loadIcon(bookIconPath, null, 38);
  if (bookIcon) {
    overlayLayers.push({
      input: bookIcon,
      left: W - PAD - 170 + 6,
      top: PAD + 25,
    });
  }

  // Storm Shield Defenses Card Header Icon
  const stormShieldIconPath = resolveStwAssetPath('assets/icons/stw/world/storm-shield.png');
  const stormShieldIcon = await loadIcon(stormShieldIconPath, null, 24);
  if (stormShieldIcon) {
    overlayLayers.push({
      input: stormShieldIcon,
      left: PAD + 16,
      top: PAD + headerH + gapY + 16,
    });
  }

  // Zone Emblems for each theater
  await Promise.all(data.stormShields.map(async (zone, i) => {
    const emblemPath = resolveZoneEmblemIcon(zone.key);
    const zIcon = await loadIcon(emblemPath, null, 32);
    if (zIcon) {
      overlayLayers.push({
        input: zIcon,
        left: PAD + 25,
        top: PAD + headerH + gapY + 56 + i * 58 + 9,
      });
    }
  }));

  return sharp(bgBuf)
    .composite(overlayLayers)
    .webp(RESOURCES_OUTPUT_WEBP)
    .toBuffer();
}
