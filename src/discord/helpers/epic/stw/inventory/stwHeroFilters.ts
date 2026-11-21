import type { CampaignHeroItem } from '../collection/stwCampaignHeroes.ts';
import {
  buildStwRarityFilterHint,
  matchesStwRarityFilters,
  type StwRarityMenuValue,
} from './stwRarityFilters.ts';

export type HeroClassFilterOption = 'commando' | 'ninja' | 'constructor' | 'outlander' | 'unknown';
export type HeroClassMenuValue = HeroClassFilterOption | 'all';

export const HERO_CLASS_FILTER_CHOICES: {
  value: HeroClassFilterOption;
  en: string;
  es: string;
}[] = [
  { value: 'commando', en: 'Soldier / Commando', es: 'Soldado / Comando' },
  { value: 'ninja', en: 'Ninja', es: 'Ninja' },
  { value: 'constructor', en: 'Constructor', es: 'Constructor' },
  { value: 'outlander', en: 'Outlander', es: 'Explorador' },
];

export function labelForHeroClassMenuValue(value: HeroClassMenuValue, lang: 'en' | 'es'): string {
  if (value === 'all') return lang === 'es' ? 'Todas las clases' : 'All classes';
  const row = HERO_CLASS_FILTER_CHOICES.find((c) => c.value === value);
  return row ? row[lang] : value;
}

export function filterCampaignHeroesMulti(
  items: CampaignHeroItem[],
  filters: { types?: HeroClassMenuValue[] | null; rarities?: StwRarityMenuValue[] | null },
): CampaignHeroItem[] {
  const typeOpts = (filters.types ?? []).filter((t): t is HeroClassFilterOption => t !== 'all');

  return items.filter((item) => {
    if (!matchesStwRarityFilters(item.rarity, filters.rarities)) return false;
    if (!typeOpts.length) return true;
    return typeOpts.includes(item.classType as HeroClassFilterOption);
  });
}

export function buildHeroFilterHint(
  lang: 'en' | 'es',
  filters: { types?: HeroClassMenuValue[]; rarities?: StwRarityMenuValue[]; bulk?: boolean },
): string | null {
  const typeOpts = (filters.types ?? []).filter((t): t is HeroClassFilterOption => t !== 'all');
  const parts: string[] = [];
  if (typeOpts.length) {
    parts.push(typeOpts.map((t) => labelForHeroClassMenuValue(t, lang)).join(', '));
  }
  const rarityHint = buildStwRarityFilterHint(lang, filters.rarities ?? []);
  if (rarityHint) parts.push(rarityHint);
  if (filters.bulk) {
    parts.push(lang === 'es' ? 'Vista por rareza' : 'Rarity grid view');
  }
  if (!parts.length) return null;
  return parts.join(' · ');
}
