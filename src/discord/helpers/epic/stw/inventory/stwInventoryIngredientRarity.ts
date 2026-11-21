import fs from 'fs';
import path from 'path';
import type { StwInventoryRarityCode } from './stwInventoryData.ts';
import { resolveStwCatalogRoot } from '#helpers/core/glowAssetPaths.ts';

const CATALOG_ROOT = resolveStwCatalogRoot();

/** Epic templateId suffix → catalog id in ingredients.json */
export const INGREDIENT_CATALOG_ALIASES: Record<string, string> = {
  ore_malachite: 'malachite',
  ore_obsidian: 'obsidian',
  blastpowder: 'blast_powder',
};

const LABEL_TO_CODE: Record<string, StwInventoryRarityCode> = {
  common: 'c',
  uncommon: 'uc',
  rare: 'r',
  epic: 'vr',
  legendary: 'sr',
  mythic: 'ur',
};

/**
 * STW backpack ingredient colors — overrides stale catalog labels.
 * Source: in-game ingredients tab (not ingredients.json export).
 */
const INGREDIENT_RARITY_OVERRIDES: Record<string, StwInventoryRarityCode> = {
  flowers: 'c',
  nuts_bolts: 'c',
  planks: 'c',
  herbs: 'c',
  bacon: 'c',
  batteries: 'c',
  ore_alloy: 'c',
  resin: 'uc',
  duct_tape: 'uc',
  ore_coal: 'uc',
  rare_powercell: 'vr',
  blast_powder: 'uc',
  rare_mechanism: 'r',
  improvised: 'r',
  honey: 'r',
  crystal_quartz: 'uc',
  powder_t01: 'c',
  powder_t02: 'c',
  powder_t03: 'c',
  powder_t04: 'c',
  powder_t05: 'c',
  powder_t06: 'c',
  twine_t01: 'uc',
  twine_t02: 'uc',
  twine_t03: 'uc',
  twine_t04: 'uc',
  twine_t05: 'uc',
  twine_t06: 'uc',
  mechanical_parts_t01: 'r',
  mechanical_parts_t02: 'r',
  mechanical_parts_t03: 'r',
  mechanical_parts_t04: 'r',
  mechanical_parts_t05: 'r',
  mechanical_parts_t06: 'r',
  malachite: 'vr',
  obsidian: 'vr',
  ore_copper: 'vr',
  ore_silver: 'vr',
  ore_brightcore: 'vr',
  ore_spectrolite: 'vr',
  crystal_moonglow: 'vr',
  crystal_rainbow: 'vr',
  crystal_shadowshard: 'vr',
  crystal_sunbeam: 'vr',
};

const WORLD_ITEM_RARITY: Record<string, StwInventoryRarityCode> = {
  wooditemdata: 'c',
  stoneitemdata: 'c',
  metalitemdata: 'c',
};

let rarityByCatalogId: Map<string, StwInventoryRarityCode> | null = null;

function loadIngredientRarityMap(): Map<string, StwInventoryRarityCode> {
  if (rarityByCatalogId) return rarityByCatalogId;

  const map = new Map<string, StwInventoryRarityCode>();
  const jsonPath = path.join(CATALOG_ROOT, 'ingredients/ingredients.json');

  if (fs.existsSync(jsonPath)) {
    const payload = JSON.parse(fs.readFileSync(jsonPath, 'utf8')) as {
      ingredients?: Record<string, { rarity?: string }>;
    };
    for (const [id, entry] of Object.entries(payload.ingredients ?? {})) {
      const label = String(entry?.rarity ?? '').trim().toLowerCase();
      const code = LABEL_TO_CODE[label];
      if (code) map.set(id, code);
    }
  }

  for (const [id, code] of Object.entries(INGREDIENT_RARITY_OVERRIDES)) {
    map.set(id, code);
  }

  rarityByCatalogId = map;
  return map;
}

export function normalizeIngredientCatalogId(rawId: string): string {
  return rawId.toLowerCase().replace(/^ingredient_/, '');
}

export function resolveIngredientCatalogKey(normalizedId: string): string {
  return INGREDIENT_CATALOG_ALIASES[normalizedId] ?? normalizedId;
}

export function resolveIngredientRarityFromCatalog(normalizedId: string): StwInventoryRarityCode | null {
  const map = loadIngredientRarityMap();
  const key = resolveIngredientCatalogKey(normalizedId);
  return map.get(key) ?? map.get(normalizedId) ?? null;
}

export function resolveWorldItemRarity(rawId: string): StwInventoryRarityCode {
  const key = rawId.toLowerCase().replace(/^athena_/, '');
  return WORLD_ITEM_RARITY[key] ?? 'c';
}
