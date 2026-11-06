import fs from 'fs';
import path from 'path';
import { INGREDIENT_CATALOG_ALIASES } from './stwInventoryIngredientRarity.ts';
import { templateToCatalogId } from '../shop/stwShopAssets.ts';
import {
  resolveStwAssetFile,
  resolveStwCatalogRoot,
  resolveStwIconsRoot,
} from '#helpers/core/glowAssetPaths.ts';

const CATALOG_ROOT = resolveStwCatalogRoot();
const LEGACY_ICONS = resolveStwIconsRoot();

type CatalogMap = Record<string, { images?: { icon?: { file?: string }; small_icon?: { file?: string } }; image?: { file?: string } }>;

let schematicsCache: CatalogMap | null = null;
let ingredientsCache: CatalogMap | null = null;
let resourcesCache: CatalogMap | null = null;
const schematicTokenIndex = new Map<string, string>();
const ingredientTokenIndex = new Map<string, string>();

function catalogMatchToken(id: string): string {
  return id.replace(/_t\d+$/i, '').toLowerCase().replace(/[^a-z0-9]/g, '');
}

function loadJsonCatalog<T>(relPath: string, mapKey: string): T {
  const jsonPath = path.join(CATALOG_ROOT, relPath);
  if (!fs.existsSync(jsonPath)) return {} as T;
  const payload = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));
  return (payload[mapKey] ?? {}) as T;
}

function loadSchematics(): CatalogMap {
  if (!schematicsCache) {
    const catalog = loadJsonCatalog<CatalogMap>('schematics/schematics.json', 'schematics');
    schematicsCache = catalog;
    for (const [id, item] of Object.entries(catalog)) {
      const resultId = String((item as { result_id?: string })?.result_id ?? id);
      schematicTokenIndex.set(catalogMatchToken(resultId), id);
      schematicTokenIndex.set(catalogMatchToken(id), id);
    }
  }
  return schematicsCache;
}

function loadIngredients(): CatalogMap {
  if (!ingredientsCache) {
    const catalog = loadJsonCatalog<CatalogMap>('ingredients/ingredients.json', 'ingredients');
    ingredientsCache = catalog;
    for (const id of Object.keys(catalog)) {
      ingredientTokenIndex.set(catalogMatchToken(id), id);
    }
  }
  return ingredientsCache;
}

function loadResources(): CatalogMap {
  if (!resourcesCache) {
    resourcesCache = loadJsonCatalog<CatalogMap>('resources/resources.json', 'resources');
  }
  return resourcesCache;
}

function iconFileFromItem(item: Record<string, unknown> | null | undefined): string | null {
  const images = item?.images as { icon?: { file?: string }; small_icon?: { file?: string } } | undefined;
  const image = item?.image as { file?: string } | undefined;
  return images?.icon?.file ?? images?.small_icon?.file ?? image?.file ?? null;
}

function resolveCatalogIcon(folder: string, item: Record<string, unknown> | null | undefined): string | null {
  const file = iconFileFromItem(item);
  if (!file) return null;
  const full = path.join(CATALOG_ROOT, folder, file);
  return fs.existsSync(full) ? full : null;
}

const SCHEMATIC_RARITY_TO_CODE: Record<string, 'c' | 'uc' | 'r' | 'vr' | 'sr' | 'ur'> = {
  common: 'c',
  uncommon: 'uc',
  rare: 'r',
  epic: 'vr',
  legendary: 'sr',
  mythic: 'ur',
};

function findSchematicEntry(templateId: string): Record<string, unknown> | null {
  const catalog = loadSchematics();
  const catalogId = templateToCatalogId(templateId);
  const token = catalogMatchToken(catalogId);

  const byToken = schematicTokenIndex.get(token);
  if (byToken && catalog[byToken]) return catalog[byToken] as Record<string, unknown>;

  const lower = catalogId.toLowerCase();
  for (const [id, item] of Object.entries(catalog)) {
    if (id.toLowerCase() === lower) return item as Record<string, unknown>;
    const rid = String((item as { result_id?: string })?.result_id ?? '');
    if (rid && catalogMatchToken(rid) === token) return item as Record<string, unknown>;
  }
  return null;
}

/** schematics.json rarity — mythic weapons often use `_sr_` in templateId. */
export function resolveSchematicRarityFromCatalog(templateId: string): 'c' | 'uc' | 'r' | 'vr' | 'sr' | 'ur' | null {
  const [typeRaw] = templateId.split(':');
  const type = typeRaw.toLowerCase();
  if (type !== 'weapon' && type !== 'trap' && type !== 'schematic') return null;

  const entry = findSchematicEntry(templateId);
  if (!entry?.rarity) return null;
  const label = String(entry.rarity).trim().toLowerCase();
  return SCHEMATIC_RARITY_TO_CODE[label] ?? null;
}

function matchIngredientId(rawId: string): string | null {
  const catalog = loadIngredients();
  const normalized = rawId
    .toLowerCase()
    .replace(/^athena_/, '')
    .replace(/^worldresource/, '')
    .replace(/itemdata$/, '')
    .replace(/^ingredient_/, '');

  const aliasKey = INGREDIENT_CATALOG_ALIASES[normalized];
  if (aliasKey && catalog[aliasKey]) return aliasKey;

  if (catalog[normalized]) return normalized;

  const token = catalogMatchToken(normalized);
  if (ingredientTokenIndex.has(token)) return ingredientTokenIndex.get(token)!;

  let best: string | null = null;
  let bestLen = 0;
  for (const key of Object.keys(catalog)) {
    if (normalized === key || normalized.endsWith(key) || key.endsWith(normalized)) {
      if (key.length > bestLen) {
        best = key;
        bestLen = key.length;
      }
    }
  }
  return best;
}

const BUILDING_MAT_KEYS: Record<string, string> = {
  wooditemdata: 'wooditemdata',
  athena_wooditemdata: 'wooditemdata',
  stoneitemdata: 'stoneitemdata',
  athena_stoneitemdata: 'stoneitemdata',
  metalitemdata: 'metalitemdata',
  athena_metalitemdata: 'metalitemdata',
};

const WORLD_ITEM_ALIASES: Record<string, string> = {
  blugloworlditemdata: 'improvised',
  blugloonboardingworlditemdata: 'improvised',
};

function resolveLegacyResourceIcon(rawId: string): string | null {
  const lower = rawId.toLowerCase();
  const legacy = path.join(LEGACY_ICONS, 'resources', `${lower}.png`);
  if (fs.existsSync(legacy)) return legacy;
  const matKey = BUILDING_MAT_KEYS[lower] ?? lower;
  const mat = path.join(LEGACY_ICONS, 'resources', `${matKey}.png`);
  return fs.existsSync(mat) ? mat : null;
}

function resolveResourceCatalogIcon(rawId: string): string | null {
  const catalog = loadResources();
  const candidates = [
    rawId,
    rawId.replace(/^athena_/i, ''),
    templateToCatalogId(`AccountResource:${rawId}`),
  ];
  for (const id of candidates) {
    const item = catalog[id] ?? catalog[id.toLowerCase()];
    if (item) {
      const resolved = resolveCatalogIcon('resources', item as Record<string, unknown>);
      if (resolved) return resolved;
    }
  }
  return null;
}

/** Local stw-catalog icon for theater inventory tiles. */
export function resolveTheaterInventoryIcon(templateId: string): string | null {
  const [typeRaw, rawId = ''] = templateId.split(':');
  const type = typeRaw.toLowerCase();
  const idLower = rawId.toLowerCase();

  if (type === 'ammo') {
    const ammoAliases: Record<string, string> = {
      ammodataproximitymines: 'ammodataproximitymine',
    };
    const ammoKey = ammoAliases[idLower] ?? idLower;
    const direct = path.join(CATALOG_ROOT, 'ammo', `${ammoKey}.webp`);
    if (fs.existsSync(direct)) return direct;
    const assetsAmmo = resolveStwAssetFile('ammo', `${ammoKey}.png`)
      ?? path.join(LEGACY_ICONS, 'ammo', `${ammoKey}.png`);
    if (fs.existsSync(assetsAmmo)) return assetsAmmo;
  }

  if (type === 'weapon' || type === 'trap') {
    const entry = findSchematicEntry(templateId);
    const pathFromSchematic = resolveCatalogIcon('schematics', entry);
    if (pathFromSchematic) return pathFromSchematic;
  }

  if (type === 'ingredient') {
    const ingId = matchIngredientId(idLower);
    if (ingId) {
      const resolved = resolveCatalogIcon('ingredients', loadIngredients()[ingId] as Record<string, unknown>);
      if (resolved) return resolved;
    }
  }

  if (type === 'worlditem') {
    const legacy = resolveLegacyResourceIcon(idLower);
    if (legacy) return legacy;

    const alias = WORLD_ITEM_ALIASES[idLower];
    if (alias) {
      const ingId = matchIngredientId(alias);
      if (ingId) {
        const resolved = resolveCatalogIcon('ingredients', loadIngredients()[ingId] as Record<string, unknown>);
        if (resolved) return resolved;
      }
    }

    const ingId = matchIngredientId(idLower);
    if (ingId) {
      const resolved = resolveCatalogIcon('ingredients', loadIngredients()[ingId] as Record<string, unknown>);
      if (resolved) return resolved;
    }

    const resource = resolveResourceCatalogIcon(idLower);
    if (resource) return resource;
  }

  return resolveLegacyResourceIcon(idLower);
}

export function hasTheaterInventoryIcon(templateId: string): boolean {
  return Boolean(resolveTheaterInventoryIcon(templateId));
}

export function resolveStwInventoryItemIcon(
  templateId: string,
  _catalogs?: unknown,
): string | null {
  return resolveTheaterInventoryIcon(templateId);
}

export function hasStwInventoryGameIcon(
  templateId: string,
  _catalogs?: unknown,
): boolean {
  return hasTheaterInventoryIcon(templateId);
}

export function resolveStwInventoryItemIconRemote(
  _templateId?: string,
  _catalogs?: unknown,
): string | null {
  return null;
}
