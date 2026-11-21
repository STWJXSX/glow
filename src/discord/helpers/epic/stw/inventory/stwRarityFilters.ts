import type { StwRarity } from '../shop/stwShopCatalog.ts';

export type StwRarityFilterOption = 'common' | 'uncommon' | 'rare' | 'epic' | 'legendary' | 'mythic';
export type StwRarityMenuValue = StwRarityFilterOption | 'all';

export const STW_RARITY_FILTER_CHOICES: {
  value: StwRarityFilterOption;
  en: string;
  es: string;
}[] = [
  { value: 'common', en: 'Common', es: 'Común' },
  { value: 'uncommon', en: 'Uncommon', es: 'Poco común' },
  { value: 'rare', en: 'Rare', es: 'Raro' },
  { value: 'epic', en: 'Epic', es: 'Épico' },
  { value: 'legendary', en: 'Legendary', es: 'Legendario' },
  { value: 'mythic', en: 'Mythic', es: 'Mítico' },
];

const RARITY_FILTER_TO_CODE: Record<StwRarityFilterOption, StwRarity> = {
  common: 'c',
  uncommon: 'uc',
  rare: 'r',
  epic: 'vr',
  legendary: 'sr',
  mythic: 'ur',
};

export function matchesStwRarityFilters(
  rarity: StwRarity,
  selected: StwRarityMenuValue[] | null | undefined,
): boolean {
  const opts = (selected ?? []).filter((r): r is StwRarityFilterOption => r !== 'all');
  if (!opts.length) return true;
  return opts.some((r) => rarity === RARITY_FILTER_TO_CODE[r]);
}

export function labelForStwRarityFilter(option: StwRarityFilterOption, lang: 'en' | 'es'): string {
  const row = STW_RARITY_FILTER_CHOICES.find((c) => c.value === option);
  return row ? row[lang] : option;
}

export function labelForStwRarityMenuValue(value: StwRarityMenuValue, lang: 'en' | 'es'): string {
  if (value === 'all') return lang === 'es' ? 'Todas las rarezas' : 'All rarities';
  return labelForStwRarityFilter(value, lang);
}

export function buildStwRarityFilterHint(
  lang: 'en' | 'es',
  rarities: StwRarityMenuValue[],
): string | null {
  const opts = rarities.filter((r): r is StwRarityFilterOption => r !== 'all');
  if (!opts.length) return null;
  return opts.map((r) => labelForStwRarityFilter(r, lang)).join(', ');
}

export function buildStwRarityMenuOptions(lang: 'en' | 'es'): { value: StwRarityMenuValue; label: string }[] {
  return [
    { value: 'all', label: labelForStwRarityMenuValue('all', lang) },
    ...STW_RARITY_FILTER_CHOICES.map((c) => ({
      value: c.value as StwRarityMenuValue,
      label: lang === 'es' ? c.es : c.en,
    })),
  ];
}
