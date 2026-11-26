/**
 * StormyChecker tile backgrounds — vertical linear gradient.
 * Bright saturated top → dark tinted black bottom (top-to-bottom only).
 */
interface LinearRarityTheme {
  top: string;
  upper: string;
  lower: string;
  bottom: string;
}

export interface ModernCardTheme {
  top: string;
  mid: string;
  bottom: string;
  border: string;
  name: string;
}

export const LOCKER_CARD_THEMES: Record<string, ModernCardTheme> = {
  mythic: { top: '#e5a100', mid: '#b26a00', bottom: '#381c00', border: '#ffd591', name: 'Mítico' },
  exclusive: { top: '#ffe53b', mid: '#ca8a04', bottom: '#3f2500', border: '#fff385', name: 'Exclusivo' },
  legendary: { top: '#ea7a1e', mid: '#9e4600', bottom: '#2d1200', border: '#ffbb96', name: 'Legendario' },
  epic: { top: '#9b51e0', mid: '#611f99', bottom: '#1e0833', border: '#d3adf7', name: 'Épico' },
  rare: { top: '#2d9cdb', mid: '#0d5d99', bottom: '#031f3d', border: '#91caff', name: 'Raro' },
  uncommon: { top: '#56c02b', mid: '#2c730e', bottom: '#0d2b03', border: '#b7eb8f', name: 'Poco Común' },
  common: { top: '#8c8c8c', mid: '#4a4a4a', bottom: '#1a1a1a', border: '#bfbfbf', name: 'Común' },
  marvel: { top: '#e02424', mid: '#8a0914', bottom: '#2e0206', border: '#ffa39e', name: 'Marvel' },
  dc: { top: '#2563eb', mid: '#0e3ea8', bottom: '#031445', border: '#85a5ff', name: 'DC' },
  starwars: { top: '#6b7280', mid: '#374151', bottom: '#111827', border: '#9ca3af', name: 'Star Wars' },
  gaminglegends: { top: '#06b6d4', mid: '#0e7490', bottom: '#082f49', border: '#67e8f9', name: 'Gaming Legends' },
  icon: { top: '#22d3ee', mid: '#0891b2', bottom: '#083344', border: '#a5f3fc', name: 'Icon Series' },
  dark: { top: '#8b5cf6', mid: '#581c87', bottom: '#1e0836', border: '#c4b5fd', name: 'Dark' },
  shadow: { top: '#4b5563', mid: '#1f2937', bottom: '#0b0f17', border: '#6b7280', name: 'Shadow' },
  slurp: { top: '#38bdf8', mid: '#0284c7', bottom: '#03254c', border: '#7dd3fc', name: 'Slurp' },
  frozen: { top: '#60a5fa', mid: '#1d4ed8', bottom: '#091e52', border: '#93c5fd', name: 'Frozen' },
  lava: { top: '#f97316', mid: '#c2410c', bottom: '#3c1202', border: '#fdba74', name: 'Lava' },
};

export const FAVORITE_BLUE = '#004de6';

export function buildSquareCardBaseSvg(themeKey: string, size: number): Buffer {
  const t = LOCKER_CARD_THEMES[themeKey] ?? LOCKER_CARD_THEMES.common;
  const uid = `card-${themeKey}-${size}`;

  const svg = `<svg width="${size}" height="${size}" xmlns="http://www.w3.org/2000/svg">
    <defs>
      <linearGradient id="bg-${uid}" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stop-color="${t.top}"/>
        <stop offset="42%" stop-color="${t.mid}"/>
        <stop offset="100%" stop-color="${t.bottom}"/>
      </linearGradient>
      <radialGradient id="flare-${uid}" cx="50%" cy="30%" r="70%">
        <stop offset="0%" stop-color="#ffffff" stop-opacity="0.32"/>
        <stop offset="50%" stop-color="#ffffff" stop-opacity="0.06"/>
        <stop offset="100%" stop-color="#000000" stop-opacity="0.38"/>
      </radialGradient>
    </defs>
    <rect width="${size}" height="${size}" fill="url(#bg-${uid})"/>
    <rect width="${size}" height="${size}" fill="url(#flare-${uid})"/>
    <path d="M -${size * 0.4} 0 L ${size * 1.4} ${size * 1.8}" stroke="rgba(255,255,255,0.07)" stroke-width="2.5"/>
    <rect width="${size - 1}" height="${size - 1}" x="0.5" y="0.5" fill="none" stroke="${t.border}" stroke-width="1" stroke-opacity="0.55"/>
  </svg>`;

  return Buffer.from(svg);
}

export function buildSquareCardOverlaySvg(
  item: { name: string; isFavorite?: boolean },
  size: number,
): Buffer {
  const maxChars = 12;
  let name = item.name.trim();
  if (name.length > maxChars) {
    name = name.slice(0, maxChars - 1) + '…';
  }

  let favoriteRibbon = '';
  if (item.isFavorite) {
    const badgeW = 17;
    const badgeH = 23;
    const x = size - badgeW - 2;
    const y = 0;
    const notch = 6;
    const path = `M ${x} ${y} h ${badgeW} v ${badgeH} l ${-badgeW / 2} ${-notch} l ${-badgeW / 2} ${notch} z`;
    favoriteRibbon = `
      <g style="filter: drop-shadow(0px 1px 2px rgba(0,0,0,0.5));">
        <path d="${path}" fill="${FAVORITE_BLUE}" stroke="rgba(0,0,0,0.35)" stroke-width="0.7"/>
        <path d="M ${x + 2} ${y} v ${badgeH - notch - 1}" stroke="rgba(255,255,255,0.3)" stroke-width="0.8"/>
      </g>
    `;
  }

  const svg = `<svg width="${size}" height="${size}" xmlns="http://www.w3.org/2000/svg">
    <defs>
      <linearGradient id="text-fade" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stop-color="#000000" stop-opacity="0"/>
        <stop offset="35%" stop-color="#050811" stop-opacity="0.28"/>
        <stop offset="80%" stop-color="#03060c" stop-opacity="0.65"/>
        <stop offset="100%" stop-color="#020408" stop-opacity="0.82"/>
      </linearGradient>
    </defs>
    <rect y="${size - 32}" width="${size}" height="32" fill="url(#text-fade)"/>
    ${favoriteRibbon}
    <text x="${size / 2}" y="${size - 7}" text-anchor="middle" 
      font-family="'Segoe UI', 'Outfit', 'Montserrat', Arial, sans-serif" 
      font-size="10" font-weight="800" fill="#ffffff" letter-spacing="0.2"
      style="filter: drop-shadow(0px 1px 2px rgba(0,0,0,0.9));">
      ${name.toUpperCase().replace(/[<>&"]/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;' }[c]!))}
    </text>
  </svg>`;

  return Buffer.from(svg);
}

const THEMES: Record<string, LinearRarityTheme> = {
  legendary: { top: '#EA7A1E', upper: '#9E4600', lower: '#6B3A0A', bottom: '#2B1404' },
  epic: { top: '#C86CF5', upper: '#9B3AD4', lower: '#4A1888', bottom: '#1A0628' },
  rare: { top: '#4DB8F5', upper: '#2B88D4', lower: '#123C68', bottom: '#061828' },
  uncommon: { top: '#7AE548', upper: '#4BB028', lower: '#1E5810', bottom: '#0A2408' },
  common: { top: '#B0B8C0', upper: '#787F88', lower: '#404548', bottom: '#1A1C1E' },
  exclusive: { top: '#FFE53B', upper: '#CA8A04', lower: '#A87808', bottom: '#3F2500' },
  marvel: { top: '#E84838', upper: '#C02018', lower: '#680808', bottom: '#280404' },
  dc: { top: '#5088F8', upper: '#2050C8', lower: '#102060', bottom: '#080E28' },
  starwars: { top: '#909090', upper: '#585858', lower: '#303030', bottom: '#101010' },
  gaminglegends: { top: '#58D0C8', upper: '#288898', lower: '#143840', bottom: '#081820' },
  icon: { top: '#78E8FF', upper: '#30B8E0', lower: '#086888', bottom: '#042838' },
  dark: { top: '#9870B8', upper: '#604088', lower: '#301850', bottom: '#140820' },
  shadow: { top: '#686868', upper: '#404040', lower: '#282828', bottom: '#0E0E0E' },
  slurp: { top: '#48D8FF', upper: '#18A8F0', lower: '#0858A0', bottom: '#042840' },
  frozen: { top: '#A8E8FF', upper: '#68C0F0', lower: '#2878B0', bottom: '#103850' },
  lava: { top: '#FF8838', upper: '#E04010', lower: '#881008', bottom: '#380404' },
};

export function buildLockerTileBgSvg(size: number, themeKey: string): string {
  const theme = THEMES[themeKey] ?? THEMES.common;
  const uid = `lg-${themeKey}-${size}`;
  return `<svg width="${size}" height="${size}" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="${uid}" x1="0%" y1="0%" x2="0%" y2="100%">
      <stop offset="0%" stop-color="${theme.top}"/>
      <stop offset="14%" stop-color="${theme.top}"/>
      <stop offset="38%" stop-color="${theme.upper}"/>
      <stop offset="62%" stop-color="${theme.lower}"/>
      <stop offset="82%" stop-color="${theme.bottom}"/>
      <stop offset="100%" stop-color="${theme.bottom}"/>
    </linearGradient>
    <linearGradient id="${uid}-sheen" x1="0%" y1="0%" x2="0%" y2="45%">
      <stop offset="0%" stop-color="rgba(255,255,255,0.10)"/>
      <stop offset="55%" stop-color="rgba(255,255,255,0.02)"/>
      <stop offset="100%" stop-color="rgba(255,255,255,0)"/>
    </linearGradient>
  </defs>
  <rect width="${size}" height="${size}" fill="url(#${uid})"/>
  <rect width="${size}" height="${size}" fill="url(#${uid}-sheen)"/>
</svg>`;
}

export function buildLockerNameBarSvg(width: number, barH: number): string {
  return `<svg width="${width}" height="${barH}" xmlns="http://www.w3.org/2000/svg">
  <rect width="${width}" height="${barH}" fill="#000000"/>
</svg>`;
}

/** Fortnite locker category icon — flat white t-shirt with short sleeves. */
export function getCategoryIconSvg(type: string, size: number): string {
  if (type !== 'outfit') {
    return getLegacyCategoryIconSvg(type, size);
  }

  const s = size;
  const body = `<path fill="#ffffff" d="
    M ${s * 0.34} ${s * 0.20}
    C ${s * 0.34} ${s * 0.13} ${s * 0.42} ${s * 0.10} ${s * 0.50} ${s * 0.10}
    C ${s * 0.58} ${s * 0.10} ${s * 0.66} ${s * 0.13} ${s * 0.66} ${s * 0.20}
    L ${s * 0.78} ${s * 0.26}
    L ${s * 0.90} ${s * 0.30}
    L ${s * 0.86} ${s * 0.40}
    L ${s * 0.74} ${s * 0.36}
    L ${s * 0.74} ${s * 0.88}
    L ${s * 0.26} ${s * 0.88}
    L ${s * 0.26} ${s * 0.36}
    L ${s * 0.14} ${s * 0.40}
    L ${s * 0.10} ${s * 0.30}
    Z"/>`;

  return `<svg width="${s}" height="${s}" viewBox="0 0 ${s} ${s}" xmlns="http://www.w3.org/2000/svg">${body}</svg>`;
}

function getLegacyCategoryIconSvg(type: string, size: number): string {
  const s = size;
  const icons: Record<string, string> = {
    backpack: `<rect x="${s * 0.28}" y="${s * 0.34}" width="${s * 0.44}" height="${s * 0.5}" rx="${s * 0.05}" fill="#ffffff"/>
      <path fill="#ffffff" d="M${s * 0.36} ${s * 0.34} V${s * 0.22} Q${s * 0.5} ${s * 0.12} ${s * 0.64} ${s * 0.22} V${s * 0.34}"/>`,
    pickaxe: `<path fill="#ffffff" d="M${s * 0.18} ${s * 0.82} L${s * 0.52} ${s * 0.46} L${s * 0.72} ${s * 0.26} L${s * 0.8} ${s * 0.34} L${s * 0.58} ${s * 0.56} L${s * 0.26} ${s * 0.9} Z"/>`,
    glider: `<path fill="#ffffff" d="M${s * 0.1} ${s * 0.56} Q${s * 0.5} ${s * 0.18} ${s * 0.9} ${s * 0.56} L${s * 0.74} ${s * 0.7} Q${s * 0.5} ${s * 0.56} ${s * 0.26} ${s * 0.7} Z"/>`,
    emote: `<circle cx="${s * 0.5}" cy="${s * 0.38}" r="${s * 0.18}" fill="#ffffff"/>
      <path fill="#ffffff" d="M${s * 0.28} ${s * 0.78} Q${s * 0.5} ${s * 0.62} ${s * 0.72} ${s * 0.78} L${s * 0.72} ${s * 0.86} Q${s * 0.5} ${s * 0.72} ${s * 0.28} ${s * 0.86} Z"/>`,
  };
  const body = icons[type] ?? icons.emote;
  return `<svg width="${s}" height="${s}" viewBox="0 0 ${s} ${s}" xmlns="http://www.w3.org/2000/svg">${body}</svg>`;
}
