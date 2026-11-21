import type { StwRarity } from '#helpers/epic/stw/shop/stwShopCatalog.ts';
import type { CardDimensions, CardTheme } from './types.ts';

const BOLT_PATH = 'M7.2 0 3.4 7.4h2.4L4.8 14l5.8-8.2H8.2z';
export const FOOTER_TEXT_COLOR = '#f4f7fa';

const RARITY_ORDER: Record<string, number> = { er: 0, ur: 0, sr: 1, vr: 2, r: 3, uc: 4, c: 5 };

export function normalizeDisplayRarity(rarity: string): string {
  if (rarity === 'ur' || rarity === 'ssr') return 'er';
  return rarity || 'c';
}

export function getCardDimensions(cardWidth: number): CardDimensions {
  const width = Math.max(80, cardWidth);
  const portraitSize = width;
  const footerH = Math.max(40, Math.round(width * 0.4));
  return { width, height: portraitSize + footerH, portraitSize, footerH };
}

export function getStarSize(cardWidth: number, footerH?: number): number {
  const width = Math.max(80, cardWidth);
  const fh = footerH ?? Math.max(40, Math.round(width * 0.4));
  return Math.max(12, Math.min(Math.round(fh * 0.52), Math.round(width * 0.17)));
}

export function getStarStep(starSize: number, cardWidth: number, starCount = 5): number {
  const width = Math.max(80, cardWidth);
  const maxSpan = width - 10;
  const gaps = Math.max(1, starCount - 1);
  return Math.max(9, Math.min(Math.round(starSize * 0.9), Math.floor(maxSpan / gaps)));
}

/** Max evolution stars by rarity — Common 2, Uncommon 3, Rare 4, Epic+ 5. */
export function getMaxStarsForRarity(rarity: string): number {
  switch (normalizeDisplayRarity(rarity)) {
    case 'c':
      return 2;
    case 'uc':
      return 3;
    case 'r':
      return 4;
    default:
      return 5;
  }
}

export function getStarCenterXs(cardWidth: number, footerH?: number, starCount = 5): number[] {
  const count = Math.max(1, Math.min(5, starCount));
  const width = Math.max(80, cardWidth);
  const fh = footerH ?? Math.max(40, Math.round(width * 0.4));
  const starSize = getStarSize(width, fh);
  const step = getStarStep(starSize, width, count);
  const span = step * (count - 1);
  const start = (width - span) / 2;
  return Array.from({ length: count }, (_, index) => start + index * step);
}

export function getFooterFontSize(cardWidth: number): number {
  return Math.max(10, Math.round(Math.max(80, cardWidth) * 0.105));
}

/** Supercharged items (blue stars) only apply above level 50, not at exactly 50. */
export function isStwSuperchargedLevel(level: number): boolean {
  return level > 50;
}

const FAVORITE_BLUE = '#0140D6';

/** PegLeg-style blue favorite tab, top-right of the portrait area. */
export function renderFavoriteBadgeSvg(cardWidth: number): string {
  const width = Math.max(80, cardWidth);
  const badgeW = Math.max(14, Math.round(width * 0.19));
  const badgeH = Math.max(16, Math.round(badgeW * 1.12));
  const x = width - badgeW - 3;
  const y = 3;
  const notch = Math.round(badgeH * 0.28);
  const path = `M${x} ${y} h${badgeW} v${badgeH - notch} l${-badgeW / 2} ${notch} l${-badgeW / 2} ${-notch} z`;
  return `<path d="${path}" fill="${FAVORITE_BLUE}" stroke="rgba(0,0,0,0.35)" stroke-width="0.6"/>`;
}

export function renderPowerFooterSvg(portraitSize: number, cardWidth: number, powerLevel: number): string {
  if (!(powerLevel > 0)) return '';
  const fontSize = getFooterFontSize(cardWidth);
  const textY = portraitSize + 15;
  const boltSize = Math.max(8, fontSize);
  const boltScale = boltSize / 12;
  const boltX = 7;
  const boltY = portraitSize + Math.round(fontSize * 0.15);
  const textX = boltX + Math.round(boltSize * 0.75) + 3;
  return `
    <path fill="${FOOTER_TEXT_COLOR}" transform="translate(${boltX},${boltY}) scale(${boltScale})" d="${BOLT_PATH}"/>
    <text x="${textX}" y="${textY}" fill="${FOOTER_TEXT_COLOR}" font-family="Segoe UI,sans-serif" font-size="${fontSize}" font-weight="800">${powerLevel}</text>`;
}

export function getStarBaselineY(portraitSize: number, footerH: number, cardHeight: number, starSize: number): number {
  const textRowBottom = portraitSize + Math.round(footerH * 0.38);
  const zoneMid = (textRowBottom + cardHeight - 2) / 2;
  return zoneMid + starSize * 0.34;
}

export function getFortniteCardTheme(rarity: string): CardTheme {
  const key = normalizeDisplayRarity(rarity);
  const themes: Record<string, CardTheme> = {
    er: {
      top: '#FFF8B8', mid: '#F0D040', bottom: '#9A7209', glow: '#FFFDE8', border: '#FFF4A0',
      accent: '#fff8d0', vignette: '#2a1e00', sheen: 'rgba(255,252,210,0.36)', footer: 'rgba(8,6,0,0.9)',
    },
    sr: {
      top: '#FF9A3C', mid: '#D45A08', bottom: '#6B2800', glow: '#FFB060', border: '#FF8C28',
      accent: '#ffc890', vignette: '#1a0800', sheen: 'rgba(255,170,90,0.28)', footer: 'rgba(14,5,0,0.92)',
    },
    vr: {
      top: '#E090FF', mid: '#8E2FD4', bottom: '#3A0A72', glow: '#F0C0FF', border: '#E8B0FF',
      accent: '#f0c8ff', vignette: '#12041f', sheen: 'rgba(230,180,255,0.22)', footer: 'rgba(8,0,14,0.9)',
    },
    r: {
      top: '#5AD4FF', mid: '#1782D6', bottom: '#0A3F87', glow: '#9AE8FF', border: '#D4F4FF',
      accent: '#b8ecff', vignette: '#041428', sheen: 'rgba(150,220,255,0.22)', footer: 'rgba(0,8,20,0.9)',
    },
    uc: {
      top: '#9AE856', mid: '#3FA821', bottom: '#145018', glow: '#C8FF98', border: '#E4FFB8',
      accent: '#d4ffb0', vignette: '#061408', sheen: 'rgba(180,255,140,0.2)', footer: 'rgba(4,12,4,0.9)',
    },
    c: {
      top: '#D5DEE8', mid: '#8A98A8', bottom: '#3A4552', glow: '#EEF3F8', border: '#FFFFFF',
      accent: '#eef3f8', vignette: '#101418', sheen: 'rgba(255,255,255,0.16)', footer: 'rgba(8,10,14,0.9)',
    },
  };
  return themes[key] ?? themes.c;
}

export function extractTier(templateId: string): number {
  const match = String(templateId).match(/_t(\d+)$/i);
  if (!match) return 1;
  return Math.min(5, Math.max(1, Number.parseInt(match[1], 10) || 1));
}

export function sortByRarityThenLevel<T extends { rarity: StwRarity; level: number; templateId: string; favorite?: boolean }>(
  a: T,
  b: T,
): number {
  const favA = a.favorite === true ? 1 : 0;
  const favB = b.favorite === true ? 1 : 0;
  if (favA !== favB) return favB - favA;

  const ra = RARITY_ORDER[normalizeDisplayRarity(a.rarity)] ?? 9;
  const rb = RARITY_ORDER[normalizeDisplayRarity(b.rarity)] ?? 9;
  if (ra !== rb) return ra - rb;
  if (b.level !== a.level) return b.level - a.level;
  return String(a.templateId).localeCompare(String(b.templateId));
}

export function computeBalancedGridCols(
  itemCount: number,
  cardWidth: number,
  cardGap: number,
  requested = 0,
  headerH = 72,
  maxCols = 42,
): number {
  if (requested > 0) return Math.min(requested, itemCount || 1);
  if (itemCount <= 1) return 1;

  const cap = Math.max(6, maxCols);
  const dims = getCardDimensions(cardWidth);
  const cellW = dims.width + cardGap;
  const cellH = dims.height + cardGap;
  const targetAspect = 1.0;
  let bestCols = Math.ceil(Math.sqrt((itemCount * cellH * targetAspect) / cellW));
  bestCols = Math.max(6, Math.min(cap, bestCols));

  let bestScore = Infinity;
  const scanMin = Math.max(6, bestCols - 8);
  const scanMax = Math.min(cap, bestCols + 8);
  for (let cols = scanMin; cols <= scanMax; cols++) {
    const rows = Math.ceil(itemCount / cols);
    const w = cols * cellW;
    const h = rows * cellH + headerH;
    const score = Math.abs(w / h - targetAspect);
    if (score < bestScore) {
      bestScore = score;
      bestCols = cols;
    }
  }
  return bestCols;
}

export const STW_CARD_RENDER_DEFAULTS = {
  cardSize: 120,
  cardGap: 4,
  maxGridCols: 40,
  maxGridWidth: 5200,
  rowConcurrency: 8,
} as const;

export function computeGridCols(itemCount: number, cardWidth: number, requested = 0): number {
  const { cardGap, maxGridCols, maxGridWidth } = STW_CARD_RENDER_DEFAULTS;
  const dims = getCardDimensions(cardWidth);
  const cellW = dims.width + cardGap;
  let cols = computeBalancedGridCols(itemCount, cardWidth, cardGap, requested, 80, maxGridCols);
  while (cols > 6 && cols * cellW > maxGridWidth) cols -= 1;
  return cols;
}
