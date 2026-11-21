import {
  getFortniteCardTheme,
  normalizeDisplayRarity,
} from '../campaign/stwFortniteCard.ts';
import {
  STW_SVG_FONT,
  fitStwFontSize,
  measureStwUiTextWidth,
  stwSvgNumericWeight,
} from '../stwImageFonts.ts';
import type { StwInventoryCategory, StwInventoryRarityCode } from '#helpers/epic/stw/inventory/stwInventoryData.ts';
import type { CardTheme } from '../campaign/types.ts';
import type { InventoryTileDimensions, StwInventoryDisplayItem } from './types.ts';

const BOLT_PATH = 'M7.2 0 3.4 7.4h2.4L4.8 14l5.8-8.2H8.2z';

/** STW backpack slot — soft radial fill, no pattern. */
interface InventoryGameTheme {
  center: string;
  mid: string;
  edge: string;
  border: string;
}

const INVENTORY_GAME_THEMES: Record<string, InventoryGameTheme> = {
  c: { center: '#8e969c', mid: '#5c646a', edge: '#383e44', border: '#181c20' },
  uc: { center: '#72d84a', mid: '#46a430', edge: '#286420', border: '#123010' },
  r: { center: '#54b8ec', mid: '#2a84c4', edge: '#185880', border: '#0a3048' },
  vr: { center: '#cc70f0', mid: '#9438c8', edge: '#5c2088', border: '#341058' },
  sr: { center: '#f09030', mid: '#c86010', edge: '#7a3808', border: '#4a2004' },
  ur: { center: '#fff060', mid: '#e8c820', edge: '#a88810', border: '#6a5808' },
  er: { center: '#fff060', mid: '#e8c820', edge: '#a88810', border: '#6a5808' },
};

const CATEGORY_THEMES: Record<Exclude<StwInventoryCategory, 'weapons' | 'traps'>, CardTheme> = {
  ingredients: {
    top: '#6EC4B4', mid: '#2A7A6A', bottom: '#0E3228', glow: '#98E8D8', border: '#A8F0E0',
    accent: '#d0fff4', vignette: '#061410', sheen: 'rgba(160,240,220,0.22)', footer: 'rgba(4,12,10,0.92)',
  },
  materials: {
    top: '#E0C070', mid: '#9A7020', bottom: '#3E2808', glow: '#F0D888', border: '#F0E0A0',
    accent: '#fff0c0', vignette: '#141008', sheen: 'rgba(255,220,140,0.22)', footer: 'rgba(12,8,2,0.92)',
  },
  ammo: {
    top: '#8AB4E8', mid: '#3A68A8', bottom: '#142840', glow: '#B8D4F8', border: '#C8E0FF',
    accent: '#e0f0ff', vignette: '#081018', sheen: 'rgba(160,200,255,0.2)', footer: 'rgba(4,8,16,0.92)',
  },
};

export function getInventoryTileDimensions(tileSize: number): InventoryTileDimensions {
  const size = Math.max(72, tileSize);
  return { width: size, height: size, iconArea: size, footerH: 0 };
}

export function getInventoryTileTheme(
  categoria: StwInventoryCategory,
  rareza: StwInventoryRarityCode | null,
): CardTheme {
  if (rareza) {
    return getFortniteCardTheme(normalizeDisplayRarity(rareza));
  }
  if (categoria === 'weapons' || categoria === 'traps') {
    return getFortniteCardTheme('c');
  }
  return CATEGORY_THEMES[categoria];
}

function getInventoryGameTheme(rareza: StwInventoryRarityCode | null): InventoryGameTheme {
  const key = rareza ?? 'c';
  return INVENTORY_GAME_THEMES[key] ?? INVENTORY_GAME_THEMES.c;
}

function escapeXml(value: string): string {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** Match STW backpack abbreviations (5K, 2.72K, 47.59K). */
export function formatGameQty(n: number): string {
  if (n >= 1_000_000) {
    const v = n / 1_000_000;
    return v >= 100 ? `${Math.round(v)}M` : `${trimTrailingZeros(v.toFixed(2))}M`;
  }
  if (n >= 10_000) {
    return `${trimTrailingZeros((n / 1000).toFixed(2))}K`;
  }
  if (n >= 1000) {
    const v = n / 1000;
    if (v >= 10) return `${trimTrailingZeros(v.toFixed(1))}K`;
    return `${trimTrailingZeros(v.toFixed(2))}K`;
  }
  return n.toLocaleString('en-US');
}

function trimTrailingZeros(value: string): string {
  return value.replace(/\.?0+$/, '');
}

export function buildInventoryTileBgSvg(
  dims: InventoryTileDimensions,
  rareza: StwInventoryRarityCode | null,
): string {
  const { width, height } = dims;
  const theme = getInventoryGameTheme(rareza);
  const rx = 2;
  const inset = 0;

  return `<svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <radialGradient id="invRadial" cx="50%" cy="44%" rx="78%" ry="82%" gradientUnits="objectBoundingBox">
      <stop offset="0%" stop-color="${theme.center}"/>
      <stop offset="38%" stop-color="${theme.mid}"/>
      <stop offset="72%" stop-color="${theme.edge}"/>
      <stop offset="100%" stop-color="${theme.edge}"/>
    </radialGradient>
    <linearGradient id="invBevel" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="rgba(255,255,255,0.11)"/>
      <stop offset="18%" stop-color="rgba(255,255,255,0.03)"/>
      <stop offset="45%" stop-color="rgba(255,255,255,0)"/>
      <stop offset="100%" stop-color="rgba(0,0,0,0)"/>
    </linearGradient>
    <radialGradient id="invEdgeDark" cx="50%" cy="50%" r="72%" gradientUnits="objectBoundingBox">
      <stop offset="62%" stop-color="rgba(0,0,0,0)"/>
      <stop offset="100%" stop-color="rgba(0,0,0,0.22)"/>
    </radialGradient>
  </defs>
  <rect width="${width}" height="${height}" rx="${rx}" fill="url(#invRadial)"/>
  <rect width="${width}" height="${height}" rx="${rx}" fill="url(#invBevel)"/>
  <rect width="${width}" height="${height}" rx="${rx}" fill="url(#invEdgeDark)"/>
  <rect x="1" y="1" width="${width - 2}" height="${height - 2}" rx="${Math.max(1, rx - 1)}" fill="none" stroke="rgba(255,255,255,0.07)" stroke-width="1"/>
  <rect x="0.5" y="0.5" width="${width - 1}" height="${height - 1}" rx="${rx}" fill="none" stroke="${theme.border}" stroke-width="1"/>
  <rect width="${width}" height="${height}" rx="${rx}" fill="none" stroke="rgba(0,0,0,0.55)" stroke-width="1"/>
</svg>`;
}

function renderPowerBadgeTopLeft(width: number, powerLevel: number): string {
  const text = String(powerLevel);
  const pad = 3;
  const innerPadX = 4;
  const maxBadgeWidth = width - pad * 2;
  const weight = stwSvgNumericWeight();
  const baseFontSize = Math.max(13, Math.round(width * 0.152));
  const minFontSize = Math.max(10, Math.round(width * 0.11));

  let fontSize = baseFontSize;
  let boltSize = Math.max(11, Math.round(fontSize * 0.92));
  let badgeW = 0;
  while (fontSize >= minFontSize) {
    boltSize = Math.max(11, Math.round(fontSize * 0.92));
    const textW = measureStwUiTextWidth(text, fontSize, weight);
    badgeW = Math.round(innerPadX * 2 + boltSize * 0.78 + textW);
    if (badgeW <= maxBadgeWidth) break;
    fontSize -= 1;
  }

  const boltScale = boltSize / 12;
  const badgeH = Math.round(fontSize * 1.22);
  const centerY = pad + badgeH / 2;
  const boltX = pad + innerPadX;
  const boltY = centerY - boltSize / 2;
  const textX = boltX + Math.round(boltSize * 0.78) + 1;

  return `
  <rect x="${pad}" y="${pad}" width="${badgeW}" height="${badgeH}" rx="2" fill="rgba(0,0,0,0.58)"/>
  <path fill="#ffffff" transform="translate(${boltX},${boltY}) scale(${boltScale})" d="${BOLT_PATH}"/>
  <text x="${textX}" y="${centerY}" dominant-baseline="middle" fill="#ffffff" font-family="${STW_SVG_FONT}" font-size="${fontSize}" font-weight="${weight}">${text}</text>`;
}

function renderQtyBottomRight(width: number, height: number, cantidad: number, stacks: number): string {
  if (cantidad <= 1 && stacks <= 1) return '';

  const baseFontSize = Math.max(13, Math.round(width * 0.17));
  const minFontSize = Math.max(9, Math.round(width * 0.1));
  const maxTextWidth = width - 8;
  const weight = stwSvgNumericWeight();
  const main = cantidad > 1 ? formatGameQty(cantidad) : '';
  const stacksSuffix = stacks > 1 ? ` (${stacks})` : '';
  const label = `${main}${stacksSuffix}`;
  if (!label) return '';

  const fontSize = fitStwFontSize(label, maxTextWidth, baseFontSize, minFontSize, weight);
  const x = width - 4;
  const y = height - 5;

  return `
  <defs>
    <filter id="qtyShadow" x="-20%" y="-20%" width="140%" height="140%">
      <feDropShadow dx="0" dy="1" stdDeviation="1.2" flood-color="#000" flood-opacity="0.85"/>
    </filter>
  </defs>
  <text x="${x}" y="${y}" fill="#ffffff" font-family="${STW_SVG_FONT}" font-size="${fontSize}" font-weight="${weight}" text-anchor="end" filter="url(#qtyShadow)">${escapeXml(label)}</text>`;
}

function renderMythicRim(width: number, height: number): string {
  const rx = 2;
  return `<rect x="1" y="1" width="${width - 2}" height="${height - 2}" rx="${rx}" fill="none" stroke="rgba(255,236,120,0.82)" stroke-width="1.5"/>`;
}

export function buildInventoryTileOverlaySvg(
  dims: InventoryTileDimensions,
  item: Pick<StwInventoryDisplayItem, 'categoria' | 'nivel' | 'cantidad' | 'stacks' | 'rareza'>,
  opts: { showPower: boolean },
): string {
  const { width, height } = dims;
  const power = opts.showPower && item.nivel > 0
    ? renderPowerBadgeTopLeft(width, item.nivel)
    : '';
  const qty = renderQtyBottomRight(width, height, item.cantidad, item.stacks);
  const mythic = item.rareza === 'ur' || item.rareza === 'er'
    ? renderMythicRim(width, height)
    : '';

  return `<svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">
  ${mythic}
  ${power}
  ${qty}
</svg>`;
}

export function computeInventoryGridCols(itemCount: number, _tileSize: number, maxCols = 12): number {
  if (itemCount <= maxCols) return Math.max(1, itemCount);
  const ideal = Math.ceil(Math.sqrt(itemCount * 1.1));
  return Math.min(maxCols, Math.max(7, ideal));
}

export function chunkItems<T>(items: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    chunks.push(items.slice(i, i + size));
  }
  return chunks;
}
