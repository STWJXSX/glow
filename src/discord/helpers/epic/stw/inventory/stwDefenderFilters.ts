import type { CampaignDefenderItem, DefenderWeaponType } from '../collection/stwCampaignDefenders.ts';
import {
  buildStwRarityFilterHint,
  matchesStwRarityFilters,
  type StwRarityMenuValue,
} from './stwRarityFilters.ts';

export type DefenderTypeFilterOption = DefenderWeaponType;
export type DefenderTypeMenuValue = DefenderTypeFilterOption | 'all';

export const DEFENDER_TYPE_FILTER_CHOICES: {
  value: DefenderTypeFilterOption;
  en: string;
  es: string;
}[] = [
  { value: 'sniper', en: 'Sniper', es: 'Francotirador' },
  { value: 'assault', en: 'Assault', es: 'Asalto' },
  { value: 'shotgun', en: 'Shotgun', es: 'Escopeta' },
  { value: 'pistol', en: 'Pistol', es: 'Pistola' },
  { value: 'melee', en: 'Melee', es: 'Cuerpo a cuerpo' },
];

export function filterCampaignDefendersMulti(
  items: CampaignDefenderItem[],
  filters: { types?: DefenderTypeMenuValue[] | null; rarities?: StwRarityMenuValue[] | null },
): CampaignDefenderItem[] {
  const typeOpts = (filters.types ?? []).filter((t): t is DefenderTypeFilterOption => t !== 'all');

  return items.filter((item) => {
    if (!matchesStwRarityFilters(item.rarity, filters.rarities)) return false;
    if (!typeOpts.length) return true;
    return typeOpts.includes(item.weaponType);
  });
}

export function labelForDefenderTypeMenuValue(value: DefenderTypeMenuValue, lang: 'en' | 'es'): string {
  if (value === 'all') return lang === 'es' ? 'Todos los tipos' : 'All types';
  const row = DEFENDER_TYPE_FILTER_CHOICES.find((c) => c.value === value);
  return row ? row[lang] : value;
}

export function buildDefenderFilterHint(
  lang: 'en' | 'es',
  filters: { types?: DefenderTypeMenuValue[]; rarities?: StwRarityMenuValue[] },
): string | null {
  const typeOpts = (filters.types ?? []).filter((t): t is DefenderTypeFilterOption => t !== 'all');
  const parts: string[] = [];
  if (typeOpts.length) {
    parts.push(typeOpts.map((t) => labelForDefenderTypeMenuValue(t, lang)).join(', '));
  }
  const rarityHint = buildStwRarityFilterHint(lang, filters.rarities ?? []);
  if (rarityHint) parts.push(rarityHint);
  if (!parts.length) return null;
  return parts.join(' · ');
}
