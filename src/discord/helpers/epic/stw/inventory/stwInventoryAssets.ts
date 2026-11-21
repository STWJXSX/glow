import { existsSync, readFileSync } from 'fs';
import { join } from 'path';
import { loadStwAssetCatalogs, templateToCatalogId } from '../shop/stwShopAssets.ts';
import { resolveStwCatalogRoot } from '#helpers/core/glowAssetPaths.ts';
import {
  hasStwInventoryGameIcon,
  hasTheaterInventoryIcon,
  resolveStwInventoryItemIcon,
  resolveStwInventoryItemIconRemote,
  resolveTheaterInventoryIcon,
} from './stwTheaterInventoryAssets.ts';

export {
  hasStwInventoryGameIcon,
  hasTheaterInventoryIcon,
  resolveStwInventoryItemIcon,
  resolveStwInventoryItemIconRemote,
  resolveTheaterInventoryIcon,
};

type StwAssetCatalogs = ReturnType<typeof loadStwAssetCatalogs>;

const CATALOG_ROOT = resolveStwCatalogRoot();

let ingredientsCatalogCache: Record<string, { image?: { file?: string } }> | null = null;

export function loadStwIngredientsCatalog(): Record<string, { image?: { file?: string } }> {
  if (ingredientsCatalogCache) return ingredientsCatalogCache;

  const jsonPath = join(CATALOG_ROOT, 'ingredients/ingredients.json');
  let catalog: Record<string, { image?: { file?: string } }> = {};
  if (existsSync(jsonPath)) {
    const payload = JSON.parse(readFileSync(jsonPath, 'utf8'));
    catalog = payload.ingredients ?? {};
  }

  ingredientsCatalogCache = catalog;
  return catalog;
}

function catalogMatchToken(id: string): string {
  return id.replace(/_t\d+$/i, '').toLowerCase().replace(/[^a-z0-9]/g, '');
}

export function findSchematicEntryByResultId(
  resultId: string,
  catalogs: StwAssetCatalogs,
): Record<string, unknown> | null {
  const map = catalogs.schematics;
  if (!map) return null;

  const target = catalogMatchToken(resultId);
  const lower = resultId.toLowerCase();

  for (const item of Object.values(map)) {
    const rid = String((item as { result_id?: string })?.result_id ?? '');
    if (!rid) continue;
    if (rid.toLowerCase() === lower) return item as Record<string, unknown>;
    if (catalogMatchToken(rid) === target) return item as Record<string, unknown>;
  }

  return null;
}
