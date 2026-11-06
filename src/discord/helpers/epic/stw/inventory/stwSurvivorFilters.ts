import type { CampaignSurvivorItem } from '../collection/stwCampaignSurvivors.ts';
import {
  buildStwRarityFilterHint,
  matchesStwRarityFilters,
  type StwRarityMenuValue,
} from './stwRarityFilters.ts';

export type SurvivorTypeFilterOption =
  | 'survivor'
  | 'manager'
  | 'adventurous'
  | 'analytical'
  | 'competitive'
  | 'cooperative'
  | 'curious'
  | 'dependable'
  | 'dreamer'
  | 'pragmatic'
  | 'manager_doctor'
  | 'manager_engineer'
  | 'manager_explorer'
  | 'manager_gadgeteer'
  | 'manager_inventor'
  | 'manager_marksman'
  | 'manager_martialartist'
  | 'manager_personaltrainer';

export type SurvivorTypeMenuValue = SurvivorTypeFilterOption | 'all';

export const SURVIVOR_TYPE_FILTER_CHOICES: {
  value: SurvivorTypeFilterOption;
  en: string;
  es: string;
}[] = [
  { value: 'survivor', en: 'Survivors (non-lead)', es: 'Supervivientes' },
  { value: 'manager', en: 'All leads / managers', es: 'Todos los líderes' },
  { value: 'adventurous', en: 'Adventurous', es: 'Aventurero' },
  { value: 'analytical', en: 'Analytical', es: 'Analítico' },
  { value: 'competitive', en: 'Competitive', es: 'Competitivo' },
  { value: 'cooperative', en: 'Cooperative', es: 'Cooperativo' },
  { value: 'curious', en: 'Curious', es: 'Curioso' },
  { value: 'dependable', en: 'Dependable', es: 'Fiable' },
  { value: 'dreamer', en: 'Dreamer', es: 'Soñador' },
  { value: 'pragmatic', en: 'Pragmatic', es: 'Pragmático' },
  { value: 'manager_doctor', en: 'Lead: Doctor', es: 'Líder: Doctor' },
  { value: 'manager_engineer', en: 'Lead: Engineer', es: 'Líder: Ingeniero' },
  { value: 'manager_explorer', en: 'Lead: Explorer', es: 'Líder: Explorador' },
  { value: 'manager_gadgeteer', en: 'Lead: Gadgeteer', es: 'Líder: Gadgeteer' },
  { value: 'manager_inventor', en: 'Lead: Inventor', es: 'Líder: Inventor' },
  { value: 'manager_marksman', en: 'Lead: Marksman', es: 'Líder: Tirador' },
  { value: 'manager_martialartist', en: 'Lead: Martial Artist', es: 'Líder: Artista marcial' },
  { value: 'manager_personaltrainer', en: 'Lead: Personal Trainer', es: 'Líder: Entrenador' },
];

const PERSONALITIES = new Set<SurvivorTypeFilterOption>([
  'adventurous', 'analytical', 'competitive', 'cooperative', 'curious', 'dependable', 'dreamer', 'pragmatic',
]);

/** Epic `attributes.personality`, e.g. `Worker.Personality.IsCurious` → `curious`. */
export function parseSurvivorPersonalityAttr(personality: unknown): SurvivorTypeFilterOption | null {
  if (typeof personality !== 'string' || !personality.trim()) return null;
  const token = personality.split('.').pop()?.trim() ?? '';
  const name = token.startsWith('Is') ? token.slice(2) : token;
  const p = name.toLowerCase() as SurvivorTypeFilterOption;
  return PERSONALITIES.has(p) ? p : null;
}

function parsePersonalityFromPortrait(icon: string): SurvivorTypeFilterOption | null {
  const personalityMatch = icon.match(/WorkerPortrait-([A-Za-z]+)-/);
  if (!personalityMatch) return null;
  const p = personalityMatch[1].toLowerCase() as SurvivorTypeFilterOption;
  return PERSONALITIES.has(p) ? p : null;
}

export function resolveSurvivorFilterType(item: CampaignSurvivorItem & { personalityAttr?: unknown }): SurvivorTypeFilterOption | 'other' {
  const icon = item.portraitIconDef ?? '';

  if (item.isManager || icon.includes('ManagerPortrait')) {
    const roleMatch = icon.match(/ManagerPortrait-([A-Za-z]+)-/);
    if (roleMatch) {
      const role = roleMatch[1].toLowerCase();
      const key = `manager_${role}` as SurvivorTypeFilterOption;
      if (SURVIVOR_TYPE_FILTER_CHOICES.some((c) => c.value === key)) return key;
    }
    return 'manager';
  }

  const fromPortrait = parsePersonalityFromPortrait(icon);
  if (fromPortrait) return fromPortrait;

  const fromAttr = parseSurvivorPersonalityAttr(item.personalityAttr);
  if (fromAttr) return fromAttr;

  return 'survivor';
}

export function matchesSurvivorTypeFilter(
  filterType: SurvivorTypeFilterOption | 'other',
  option: SurvivorTypeFilterOption,
): boolean {
  if (option === 'survivor') {
    return filterType !== 'manager' && !String(filterType).startsWith('manager_');
  }
  if (option === 'manager') return filterType === 'manager' || String(filterType).startsWith('manager_');
  return filterType === option;
}

export function filterCampaignSurvivorsMulti(
  items: CampaignSurvivorItem[],
  filters: { types?: SurvivorTypeMenuValue[] | null; rarities?: StwRarityMenuValue[] | null },
): CampaignSurvivorItem[] {
  const typeOpts = (filters.types ?? []).filter((t): t is SurvivorTypeFilterOption => t !== 'all');

  return items.filter((item) => {
    if (!matchesStwRarityFilters(item.rarity, filters.rarities)) return false;
    if (!typeOpts.length) return true;
    const filterType = resolveSurvivorFilterType(item);
    return typeOpts.some((t) => matchesSurvivorTypeFilter(filterType, t));
  });
}

export function labelForSurvivorTypeMenuValue(value: SurvivorTypeMenuValue, lang: 'en' | 'es'): string {
  if (value === 'all') return lang === 'es' ? 'Todos los tipos' : 'All types';
  const row = SURVIVOR_TYPE_FILTER_CHOICES.find((c) => c.value === value);
  return row ? row[lang] : value;
}

export function buildSurvivorFilterHint(
  lang: 'en' | 'es',
  filters: { types?: SurvivorTypeMenuValue[]; rarities?: StwRarityMenuValue[] },
): string | null {
  const typeOpts = (filters.types ?? []).filter((t): t is SurvivorTypeFilterOption => t !== 'all');
  const parts: string[] = [];
  if (typeOpts.length) {
    parts.push(typeOpts.map((t) => labelForSurvivorTypeMenuValue(t, lang)).join(', '));
  }
  const rarityHint = buildStwRarityFilterHint(lang, filters.rarities ?? []);
  if (rarityHint) parts.push(rarityHint);
  if (!parts.length) return null;
  return parts.join(' · ');
}
