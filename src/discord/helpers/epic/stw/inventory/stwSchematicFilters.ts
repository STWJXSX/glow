import type { StwRarity } from '../shop/stwShopCatalog.ts';
import { loadStwAssetCatalogs, templateToCatalogId } from '../shop/stwShopAssets.ts';

export type SchematicFilterType =
  | 'assault'
  | 'pistol'
  | 'sniper'
  | 'shotgun'
  | 'smg'
  | 'explosive'
  | 'melee_sword'
  | 'melee_hammer'
  | 'melee_axe'
  | 'melee_spear'
  | 'melee_bat'
  | 'melee_scythe'
  | 'trap_floor'
  | 'trap_wall'
  | 'trap_ceiling'
  | 'other';

/** Slash option values for `/schematics image type`. */
export type SchematicTypeFilterOption =
  | 'assault'
  | 'pistol'
  | 'sniper'
  | 'shotgun'
  | 'smg'
  | 'explosive'
  | 'melee'
  | 'trap'
  | 'trap_floor'
  | 'trap_wall'
  | 'trap_ceiling';

export type SchematicRarityFilterOption = 'common' | 'uncommon' | 'rare' | 'epic' | 'legendary' | 'mythic';

const RARITY_FILTER_TO_CODE: Record<SchematicRarityFilterOption, StwRarity> = {
  common: 'c',
  uncommon: 'uc',
  rare: 'r',
  epic: 'vr',
  legendary: 'sr',
  mythic: 'ur',
};

export const SCHEMATIC_TYPE_FILTER_CHOICES: {
  value: SchematicTypeFilterOption;
  en: string;
  es: string;
}[] = [
  { value: 'assault', en: 'Assault / LMG', es: 'Asalto / LMG' },
  { value: 'pistol', en: 'Pistol', es: 'Pistola' },
  { value: 'sniper', en: 'Sniper', es: 'Francotirador' },
  { value: 'shotgun', en: 'Shotgun', es: 'Escopeta' },
  { value: 'smg', en: 'SMG', es: 'SMG' },
  { value: 'explosive', en: 'Explosive / Launcher', es: 'Explosivo / Lanzador' },
  { value: 'melee', en: 'All melee', es: 'Todo cuerpo a cuerpo' },
  { value: 'trap', en: 'All traps', es: 'Todas las trampas' },
  { value: 'trap_floor', en: 'Floor traps', es: 'Trampas de suelo' },
  { value: 'trap_wall', en: 'Wall traps', es: 'Trampas de pared' },
  { value: 'trap_ceiling', en: 'Ceiling traps', es: 'Trampas de techo' },
];

export const SCHEMATIC_RARITY_FILTER_CHOICES: {
  value: SchematicRarityFilterOption;
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

const MELEE_TYPES: SchematicFilterType[] = [
  'melee_sword', 'melee_hammer', 'melee_axe', 'melee_spear', 'melee_bat', 'melee_scythe',
];

const TRAP_TYPES: SchematicFilterType[] = ['trap_floor', 'trap_wall', 'trap_ceiling'];

function subclassToFilterType(className: string, subclass: string): SchematicFilterType | null {
  const cls = className.toLowerCase();
  const sub = subclass.toLowerCase();

  if (cls === 'trap') {
    if (sub === 'floor') return 'trap_floor';
    if (sub === 'wall') return 'trap_wall';
    if (sub === 'ceiling') return 'trap_ceiling';
    return 'trap_floor';
  }

  if (cls === 'melee') {
    if (sub === 'sword') return 'melee_sword';
    if (sub === 'hammer') return 'melee_hammer';
    if (sub === 'axe') return 'melee_axe';
    if (sub === 'spear') return 'melee_spear';
    if (sub === 'bat') return 'melee_bat';
    if (sub === 'scythe') return 'melee_scythe';
    return 'melee_sword';
  }

  if (cls === 'ranged') {
    if (sub === 'assault') return 'assault';
    if (sub === 'pistol') return 'pistol';
    if (sub === 'sniper') return 'sniper';
    if (sub === 'shotgun') return 'shotgun';
    if (sub === 'smg') return 'smg';
    if (sub === 'explosive') return 'explosive';
    return 'assault';
  }

  return null;
}

function filterTypeFromTemplateId(templateId: string): SchematicFilterType {
  const t = templateId.toLowerCase();

  if (t.includes('ceiling_')) return 'trap_ceiling';
  if (t.includes('wall_')) return 'trap_wall';
  if (t.includes('floor_')) return 'trap_floor';

  if (
    t.includes('trap') ||
    t.includes('campfire') ||
    t.includes('healing') ||
    t.includes('teleporter') ||
    t.includes('placeable')
  ) {
    return 'trap_floor';
  }

  if (t.includes('shotgun')) return 'shotgun';
  if (t.includes('sniper')) return 'sniper';
  if (t.includes('pistol')) return 'pistol';
  if (t.includes('smg')) return 'smg';
  if (t.includes('assault') || t.includes('lmg') || t.includes('minigun')) return 'assault';
  if (
    t.includes('launcher') ||
    t.includes('grenade') ||
    t.includes('rocket') ||
    t.includes('explosive') ||
    t.includes('bow') ||
    t.includes('crossbow')
  ) {
    return 'explosive';
  }

  if (t.includes('scythe')) return 'melee_scythe';
  if (t.includes('sword') || t.includes('edged')) return 'melee_sword';
  if (t.includes('hammer') || t.includes('blunt')) return 'melee_hammer';
  if (t.includes('axe')) return 'melee_axe';
  if (t.includes('spear')) return 'melee_spear';
  if (t.includes('bat') || t.includes('club')) return 'melee_bat';

  return 'other';
}

export function resolveSchematicFilterType(templateId: string): SchematicFilterType {
  const catalogs = loadStwAssetCatalogs();
  const catalogId = templateToCatalogId(templateId);
  const map = catalogs.schematics;
  let entry: Record<string, any> | null = map[catalogId] ?? null;

  if (!entry) {
    const lower = catalogId.toLowerCase();
    for (const [id, item] of Object.entries(map)) {
      if (id.toLowerCase() === lower) {
        entry = item;
        break;
      }
    }
  }

  if (!entry) {
    const base = catalogId.toLowerCase().replace(/_t\d+$/i, '');
    for (const [id, item] of Object.entries(map)) {
      const idBase = id.toLowerCase().replace(/_t\d+$/i, '');
      if (idBase === base || id.toLowerCase().startsWith(`${base}_`)) {
        entry = item;
        break;
      }
    }
  }

  if (entry?.class && entry?.subclass) {
    const fromCatalog = subclassToFilterType(String(entry.class), String(entry.subclass));
    if (fromCatalog) return fromCatalog;
  }

  return filterTypeFromTemplateId(templateId);
}

export function matchesSchematicTypeFilter(
  filterType: SchematicFilterType,
  option: SchematicTypeFilterOption | null | undefined,
): boolean {
  if (!option) return true;
  if (option === 'melee') return MELEE_TYPES.includes(filterType);
  if (option === 'trap') return TRAP_TYPES.includes(filterType);
  if (option.startsWith('trap_')) return filterType === option;
  return filterType === option;
}

export type SchematicTypeMenuValue = SchematicTypeFilterOption | 'all';
export type SchematicRarityMenuValue = SchematicRarityFilterOption | 'all';

export function filterSchematicItems<T extends { rarity: StwRarity; filterType: SchematicFilterType }>(
  items: T[],
  filters: {
    type?: SchematicTypeFilterOption | null;
    rarity?: SchematicRarityFilterOption | null;
  },
): T[] {
  const types = filters.type ? [filters.type] : [];
  const rarities = filters.rarity ? [filters.rarity] : [];
  return filterSchematicItemsMulti(items, { types, rarities });
}

export function filterSchematicItemsMulti<T extends { rarity: StwRarity; filterType: SchematicFilterType }>(
  items: T[],
  filters: {
    types?: SchematicTypeMenuValue[] | null;
    rarities?: SchematicRarityMenuValue[] | null;
  },
): T[] {
  const typeOpts = (filters.types ?? []).filter((t): t is SchematicTypeFilterOption => t !== 'all');
  const rarityOpts = (filters.rarities ?? []).filter((r): r is SchematicRarityFilterOption => r !== 'all');

  return items.filter((item) => {
    if (rarityOpts.length && !rarityOpts.some((r) => item.rarity === RARITY_FILTER_TO_CODE[r])) {
      return false;
    }
    if (typeOpts.length && !typeOpts.some((t) => matchesSchematicTypeFilter(item.filterType, t))) {
      return false;
    }
    return true;
  });
}

export function labelForTypeFilter(
  option: SchematicTypeFilterOption,
  lang: 'en' | 'es',
): string {
  const row = SCHEMATIC_TYPE_FILTER_CHOICES.find((c) => c.value === option);
  return row ? row[lang] : option;
}

export function labelForRarityFilter(
  option: SchematicRarityFilterOption,
  lang: 'en' | 'es',
): string {
  const row = SCHEMATIC_RARITY_FILTER_CHOICES.find((c) => c.value === option);
  return row ? row[lang] : option;
}

export function buildSchematicFilterHint(
  lang: 'en' | 'es',
  filters: { type?: SchematicTypeFilterOption | null; rarity?: SchematicRarityFilterOption | null },
): string | null {
  return buildSchematicFilterHintMulti(lang, {
    types: filters.type ? [filters.type] : [],
    rarities: filters.rarity ? [filters.rarity] : [],
  });
}

export function buildSchematicFilterHintMulti(
  lang: 'en' | 'es',
  filters: { types?: SchematicTypeMenuValue[]; rarities?: SchematicRarityMenuValue[] },
): string | null {
  const typeOpts = (filters.types ?? []).filter((t): t is SchematicTypeFilterOption => t !== 'all');
  const rarityOpts = (filters.rarities ?? []).filter((r): r is SchematicRarityFilterOption => r !== 'all');

  const parts: string[] = [];
  if (typeOpts.length) {
    parts.push(typeOpts.map((t) => labelForTypeFilter(t, lang)).join(', '));
  }
  if (rarityOpts.length) {
    parts.push(rarityOpts.map((r) => labelForRarityFilter(r, lang)).join(', '));
  }
  if (!parts.length) return null;
  return parts.join(' · ');
}

export function labelForTypeMenuValue(value: SchematicTypeMenuValue, lang: 'en' | 'es'): string {
  if (value === 'all') return lang === 'es' ? 'Todos los tipos' : 'All types';
  return labelForTypeFilter(value, lang);
}

export function labelForRarityMenuValue(value: SchematicRarityMenuValue, lang: 'en' | 'es'): string {
  if (value === 'all') return lang === 'es' ? 'Todas las rarezas' : 'All rarities';
  return labelForRarityFilter(value, lang);
}
