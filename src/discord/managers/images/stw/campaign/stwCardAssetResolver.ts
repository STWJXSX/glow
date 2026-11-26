import fs from 'fs';
import path from 'path';
import { parseStwPortraitIconDef } from '#helpers/epic/stw/collection/stwCampaignSurvivors.ts';
import { resolveHeroPortrait } from '#helpers/epic/stw/loadouts/loadoutAssets.ts';
import { templateToCatalogId } from '#helpers/epic/stw/shop/stwShopAssets.ts';
import {
  resolveStwAssetFile,
  resolveStwCatalogRoot,
  resolveStwIconsRoot,
} from '#helpers/core/glowAssetPaths.ts';
import type { StwCardsCollectionType } from './types.ts';

/** Card icons: local files only (stw-catalog + heroes portraits + legacy). No CDN fetch. */
const CATALOG_ROOT = resolveStwCatalogRoot();
const LEGACY_ICONS = resolveStwIconsRoot();
const SURVIVOR_PORTRAITS_DIR = path.join(CATALOG_ROOT, 'survivors', 'portraits');

type CatalogMap = Record<string, Record<string, {
  name?: string;
  images?: { icon?: { file?: string; url?: string }; small_icon?: { url?: string } };
}>>;

const CATALOG_FILES: Record<StwCardsCollectionType, { file: string; mapKey: string }> = {
  heroes: { file: 'heroes/heroes.json', mapKey: 'heroes' },
  survivors: { file: 'survivors/survivors.json', mapKey: 'survivors' },
  schematics: { file: 'schematics/schematics.json', mapKey: 'schematics' },
  defenders: { file: 'defenders/defenders.json', mapKey: 'defenders' },
};

type PortraitMap = Record<string, { images?: { icon?: { file?: string; url?: string } } }>;

let catalogsCache: CatalogMap | null = null;
let portraitsCache: PortraitMap | null = null;
const catalogExactIndex = new Map<StwCardsCollectionType, Map<string, Record<string, unknown>>>();
const catalogTokenIndex = new Map<StwCardsCollectionType, Map<string, Record<string, unknown>>>();

function catalogMatchToken(id: string): string {
  return id.replace(/_t\d+$/i, '').toLowerCase().replace(/[^a-z0-9]/g, '');
}

function iconFileFromItem(item: Record<string, unknown> | null | undefined): string | null {
  const images = item?.images as {
    icon?: { file?: string };
    small_icon?: { file?: string };
  } | undefined;
  return images?.icon?.file ?? images?.small_icon?.file ?? null;
}

function ensureCatalogIndexes(catalogKey: StwCardsCollectionType): void {
  if (catalogExactIndex.has(catalogKey)) return;
  const map = loadCatalogs()[catalogKey];
  const exact = new Map<string, Record<string, unknown>>();
  const token = new Map<string, Record<string, unknown>>();
  for (const [id, item] of Object.entries(map)) {
    exact.set(id.toLowerCase(), item);
    const tokenKey = catalogMatchToken(id.replace(/_t\d+$/i, ''));
    const prev = token.get(tokenKey);
    if (!prev || (iconFileFromItem(item) && !iconFileFromItem(prev))) {
      token.set(tokenKey, item);
    }
  }
  catalogExactIndex.set(catalogKey, exact);
  catalogTokenIndex.set(catalogKey, token);
}

function findCatalogEntry(
  catalogKey: StwCardsCollectionType,
  catalogId: string,
  catalogs: CatalogMap,
): Record<string, unknown> | null {
  ensureCatalogIndexes(catalogKey);
  const exact = catalogExactIndex.get(catalogKey)!;

  const lower = catalogId.toLowerCase();
  if (exact.has(lower)) return exact.get(lower)!;

  const map = catalogs[catalogKey];
  if (!map) return null;

  const target = catalogMatchToken(catalogId.replace(/_t\d+$/i, ''));
  let best: { item: Record<string, unknown>; score: number } | null = null;
  for (const [id, item] of Object.entries(map)) {
    const candidate = catalogMatchToken(id.replace(/_t\d+$/i, ''));
    if (candidate !== target) continue;
    const idLower = id.toLowerCase();
    const tierMatch = idLower === lower ? 20 : idLower.startsWith(`${lower.replace(/_t\d+$/, '')}_`) ? 10 : 0;
    const hasIcon = iconFileFromItem(item) ? 5 : 0;
    const score = 100 + tierMatch + hasIcon;
    if (!best || score > best.score) best = { item, score };
  }
  return best?.item ?? null;
}

function loadCatalogs(): CatalogMap {
  if (catalogsCache) return catalogsCache;
  const catalogs = {} as CatalogMap;
  for (const [key, entry] of Object.entries(CATALOG_FILES)) {
    const jsonPath = path.join(CATALOG_ROOT, entry.file);
    if (!fs.existsSync(jsonPath)) {
      catalogs[key as StwCardsCollectionType] = {};
      continue;
    }
    const payload = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));
    catalogs[key as StwCardsCollectionType] = payload[entry.mapKey] ?? {};
  }
  catalogsCache = catalogs;
  return catalogs;
}

function loadPortraits(): PortraitMap {
  if (portraitsCache) return portraitsCache;
  const jsonPath = path.join(CATALOG_ROOT, 'survivors/portraits.json');
  if (!fs.existsSync(jsonPath)) {
    portraitsCache = {};
    return portraitsCache;
  }
  const payload = JSON.parse(fs.readFileSync(jsonPath, 'utf8')) as { portraits?: PortraitMap };
  portraitsCache = payload.portraits ?? {};
  return portraitsCache;
}

function resolveCatalogLocalPath(catalogKey: StwCardsCollectionType, catalogId: string): string | null {
  const catalogs = loadCatalogs();
  const item = findCatalogEntry(catalogKey, catalogId, catalogs);
  const file = iconFileFromItem(item);
  if (!file) return null;

  const rel = file.replace(/^\/+/, '');
  const local = resolveStwAssetFile(catalogKey, rel);
  if (local) return local;
  return null;
}

function resolveSurvivorPortraitLocal(iconDefId: string | undefined): string | null {
  if (!iconDefId) return null;

  const portraits = loadPortraits();
  const entry = portraits[iconDefId];
  const catalogFile = entry?.images?.icon?.file;
  if (catalogFile) {
    const rel = catalogFile.replace(/^\/+/, '');
    const local = resolveStwAssetFile('survivors', rel);
    if (local) return local;
  }

  for (const base of [SURVIVOR_PORTRAITS_DIR, path.join(CATALOG_ROOT, 'survivors', 'portraits')]) {
    for (const ext of ['.png', '.webp']) {
      const direct = path.join(base, `${iconDefId}${ext}`);
      if (fs.existsSync(direct)) return direct;
    }
  }

  return null;
}

function resolveLegacyLocalIcon(templateId: string): string | null {
  const key = templateId.replace(/^[^:]+:/, '').toLowerCase();
  const direct = path.join(LEGACY_ICONS, 'resources', `${key}.png`);
  return fs.existsSync(direct) ? direct : null;
}

export function resolveStwCardItemIcon(
  entry: { templateId: string; portrait?: unknown; portraitIconDef?: string },
  type: StwCardsCollectionType,
): string | null {
  const catalogId = templateToCatalogId(entry.templateId);

  if (type === 'heroes') {
    return (
      resolveHeroPortrait(entry.templateId)
      ?? resolveCatalogLocalPath('heroes', catalogId)
      ?? resolveLegacyLocalIcon(entry.templateId)
    );
  }

  if (type === 'survivors') {
    const portraitDef = entry.portraitIconDef ?? parseStwPortraitIconDef(entry.portrait);
    return (
      resolveSurvivorPortraitLocal(portraitDef ?? undefined)
      ?? resolveCatalogLocalPath('survivors', catalogId)
      ?? resolveLegacyLocalIcon(entry.templateId)
    );
  }

  if (type === 'defenders') {
    return resolveCatalogLocalPath('defenders', catalogId);
  }

  return resolveCatalogLocalPath('schematics', catalogId);
}

export function resolveStwCardItemName(templateId: string, fallback = ''): string {
  const catalogs = loadCatalogs();
  const type = templateId.split(':')[0]?.toLowerCase();
  let catalogKey: StwCardsCollectionType | null = null;
  if (type === 'hero') catalogKey = 'heroes';
  else if (type === 'worker') catalogKey = 'survivors';
  else if (type === 'schematic') catalogKey = 'schematics';
  else if (type === 'defender') catalogKey = 'defenders';
  if (!catalogKey) return fallback;

  const catalogId = templateToCatalogId(templateId);
  const item = findCatalogEntry(catalogKey, catalogId, catalogs) as { name?: string } | null;
  return item?.name ?? fallback;
}
