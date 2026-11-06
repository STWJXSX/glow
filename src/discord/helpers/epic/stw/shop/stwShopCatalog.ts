import { resolveSchematicRarityFromCatalog } from '../inventory/stwTheaterInventoryAssets.ts';

export type StwRarity = 'c' | 'uc' | 'r' | 'vr' | 'sr' | 'er' | 'ur';

export interface StwRarityTheme {
  top: string;
  mid: string;
  bottom: string;
  glow: string;
  border: string;
}

/** Epic profile `attributes.starting_rarity` (e.g. Mythic lead survivors still use `_sr_` in templateId). */
const STARTING_RARITY_TO_CODE: Record<string, StwRarity> = {
  common: 'c',
  uncommon: 'uc',
  rare: 'r',
  epic: 'vr',
  legendary: 'sr',
  mythic: 'ur',
};

export function extractStwRarity(templateId: string): StwRarity {
  const t = templateId.toLowerCase();
  if (/_ur_|_ur\.|_ur$/.test(t)) return 'ur';
  if (/_er_|_er\.|_er$|_ssr_|_ssr\.|_ssr$/.test(t)) return 'er';
  if (/_sr_|_sr\.|_sr$/.test(t)) return 'sr';
  if (/_vr_|_vr\.|_vr$/.test(t)) return 'vr';
  if (/_uc_|_uc\.|_uc$/.test(t)) return 'uc';
  if (/_r_|_r\.|_r$/.test(t)) return 'r';
  if (/_c_|_c\.|_c$/.test(t)) return 'c';
  return 'c';
}

/**
 * Resolves display rarity for collection images.
 * Prefer `starting_rarity` from QueryProfile (Mythic ≠ Legendary even when templateId has `_sr_`).
 */
export function resolveStwRarity(
  templateId: string,
  startingRarity?: string | null,
): StwRarity {
  if (startingRarity) {
    const fromAttr = STARTING_RARITY_TO_CODE[startingRarity.trim().toLowerCase()];
    if (fromAttr) return fromAttr;
  }
  const fromCatalog = resolveSchematicRarityFromCatalog(templateId);
  if (fromCatalog) return fromCatalog;
  return extractStwRarity(templateId);
}

export function getStwRarityTheme(rarity: StwRarity): StwRarityTheme {
  const themes: Record<StwRarity, StwRarityTheme> = {
    c: { top: '#D5DEE8', mid: '#8A98A8', bottom: '#3A4552', glow: '#EEF3F8', border: '#FFFFFF' },
    uc: { top: '#9AE856', mid: '#3FA821', bottom: '#145018', glow: '#C8FF98', border: '#E4FFB8' },
    r: { top: '#5AD4FF', mid: '#1782D6', bottom: '#0A3F87', glow: '#9AE8FF', border: '#D4F4FF' },
    vr: { top: '#DA73FF', mid: '#8724DB', bottom: '#3F0E7A', glow: '#EDAAFF', border: '#F5D4FF' },
    sr: { top: '#FFC542', mid: '#D87910', bottom: '#6B3200', glow: '#FFD978', border: '#FFE9A8' },
    er: { top: '#FFE76A', mid: '#D19316', bottom: '#563400', glow: '#FFF1A8', border: '#FFF8D0' },
    ur: { top: '#FFF9C4', mid: '#F0C030', bottom: '#8B5A12', glow: '#FFFDE0', border: '#FFF3A0' },
  };
  return themes[rarity] || themes.c;
}
