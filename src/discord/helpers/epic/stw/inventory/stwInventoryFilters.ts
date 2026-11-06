import type { StwInventoryCategory, StwInventoryItem, StwInventoryRarityCode, StwInventorySource } from './stwInventoryData.ts';

export type StwInventorySourceMenuValue = StwInventorySource | 'all';
export type StwInventoryCategoryMenuValue = StwInventoryCategory | 'all';
export type StwInventoryRarityMenuValue = StwInventoryRarityCode | 'all';

export const INVENTORY_SOURCE_CHOICES: { value: StwInventorySource; en: string; es: string }[] = [
  { value: 'campaign', en: 'Campaign inventory', es: 'Inventario de campaña' },
  { value: 'venture', en: 'Venture inventory', es: 'Inventario de aventura' },
  { value: 'storage', en: 'Storm shield storage', es: 'Almacén del refugio' },
];

export const INVENTORY_CATEGORY_CHOICES: { value: StwInventoryCategory; en: string; es: string }[] = [
  { value: 'weapons', en: 'Weapons', es: 'Armas' },
  { value: 'traps', en: 'Traps', es: 'Trampas' },
  { value: 'ammo', en: 'Ammo', es: 'Munición' },
  { value: 'materials', en: 'Basic materials', es: 'Materiales básicos' },
  { value: 'ingredients', en: 'Ingredients', es: 'Ingredientes' },
];

export const INVENTORY_RARITY_CHOICES: { value: StwInventoryRarityCode; en: string; es: string }[] = [
  { value: 'c', en: 'Common', es: 'Común' },
  { value: 'uc', en: 'Uncommon', es: 'Poco común' },
  { value: 'r', en: 'Rare', es: 'Raro' },
  { value: 'vr', en: 'Epic', es: 'Épico' },
  { value: 'sr', en: 'Legendary', es: 'Legendario' },
];

export function labelInventorySource(value: StwInventorySourceMenuValue, lang: 'en' | 'es'): string {
  if (value === 'all') return lang === 'es' ? 'Todos los inventarios' : 'All inventories';
  const row = INVENTORY_SOURCE_CHOICES.find((c) => c.value === value);
  return row ? row[lang] : value;
}

export function labelInventoryCategory(value: StwInventoryCategoryMenuValue, lang: 'en' | 'es'): string {
  if (value === 'all') return lang === 'es' ? 'Todas las categorías' : 'All categories';
  const row = INVENTORY_CATEGORY_CHOICES.find((c) => c.value === value);
  return row ? row[lang] : value;
}

export function labelInventoryRarity(value: StwInventoryRarityMenuValue, lang: 'en' | 'es'): string {
  if (value === 'all') return lang === 'es' ? 'Todas las rarezas' : 'All rarities';
  const row = INVENTORY_RARITY_CHOICES.find((c) => c.value === value);
  return row ? row[lang] : value;
}

export interface StwInventoryFilterState {
  source: StwInventorySource;
  categories: StwInventoryCategoryMenuValue[];
  rarities: StwInventoryRarityMenuValue[];
}

export function filterInventoryItems(
  items: StwInventoryItem[],
  state: Pick<StwInventoryFilterState, 'categories' | 'rarities'>,
): StwInventoryItem[] {
  const catOpts = state.categories.filter((c): c is StwInventoryCategory => c !== 'all');
  const rarOpts = state.rarities.filter((r): r is StwInventoryRarityCode => r !== 'all');

  return items.filter((item) => {
    if (catOpts.length && !catOpts.includes(item.categoria)) return false;
    if (!rarOpts.length) return true;
    if (!item.rareza) return false;
    return rarOpts.includes(item.rareza);
  });
}

export function hasActiveInventoryFilters(
  state: Pick<StwInventoryFilterState, 'categories' | 'rarities'>,
): boolean {
  const categoriesAll = state.categories.length === 0
    || (state.categories.length === 1 && state.categories[0] === 'all');
  const raritiesAll = state.rarities.length === 0
    || (state.rarities.length === 1 && state.rarities[0] === 'all');
  return !categoriesAll || !raritiesAll;
}

export function buildInventoryFilterHint(lang: 'en' | 'es', state: StwInventoryFilterState): string | null {
  const parts: string[] = [labelInventorySource(state.source, lang)];

  const cats = state.categories.filter((c): c is StwInventoryCategory => c !== 'all');
  if (cats.length) {
    parts.push(cats.map((c) => labelInventoryCategory(c, lang)).join(', '));
  }

  const rars = state.rarities.filter((r): r is StwInventoryRarityCode => r !== 'all');
  if (rars.length) {
    parts.push(rars.map((r) => labelInventoryRarity(r, lang)).join(', '));
  }

  return parts.length ? parts.join(' · ') : null;
}
