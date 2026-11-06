import { existsSync, readFileSync } from 'fs';
import { join } from 'path';
import {
  resolveStwAssetFile,
  resolveStwCatalogRoot,
  resolveStwIconsRoot,
} from '#helpers/core/glowAssetPaths.ts';

const CATALOG_ROOT = resolveStwCatalogRoot();
const LEGACY_ICONS = resolveStwIconsRoot();
const STW_PORTRAIT_CDN = 'https://olitracker.com/cdn/export/portraits';
const PORTRAITS_DIR = join(CATALOG_ROOT, 'survivors', 'portraits');

const CATALOG_FILES = [
  { key: 'resources', file: 'resources/resources.json', mapKey: 'resources' },
  { key: 'heroes', file: 'heroes/heroes.json', mapKey: 'heroes' },
  { key: 'schematics', file: 'schematics/schematics.json', mapKey: 'schematics' },
  { key: 'survivors', file: 'survivors/survivors.json', mapKey: 'survivors' },
  { key: 'defenders', file: 'defenders/defenders.json', mapKey: 'defenders' },
  { key: 'cardpacks', file: 'cardpacks/cardpacks.json', mapKey: 'cardpacks' },
] as const;

type CatalogKey = (typeof CATALOG_FILES)[number]['key'];
type AssetCatalogs = Record<CatalogKey, Record<string, any>>;

export function templateToCatalogId(templateId: string): string {
  const [typeRaw, rawId] = templateId.split(':');
  const typeLower = (typeRaw || '').toLowerCase();
  const parts = (rawId || '').toLowerCase().split('_');

  const pascalParts = parts.map((part) => {
    if (/^(hid|sid|wid|cid|tid)$/i.test(part)) return part.toUpperCase();
    if (/^(sr|ssr|vr|r|uc|c|ore|ur|er|br|hw|v1|v2)$/i.test(part)) return part.toUpperCase();
    if (/^t\d+$/i.test(part)) return part.toUpperCase();
    return part.charAt(0).toUpperCase() + part.slice(1);
  });

  if (typeLower === 'cardpack') {
    const rest = pascalParts.slice(1).join('_');
    return rest ? `CardPack_${rest}` : `CardPack_${pascalParts.join('_')}`;
  }

  return pascalParts.join('_');
}

function catalogTypeForTemplate(templateId: string): CatalogKey | null {
  const prefix = templateId.split(':')[0]?.toLowerCase() ?? '';
  if (prefix === 'hero') return 'heroes';
  if (prefix === 'schematic') return 'schematics';
  if (prefix === 'worker') return 'survivors';
  if (prefix === 'defender') return 'defenders';
  if (prefix === 'cardpack') return 'cardpacks';
  if (prefix === 'accountresource' || prefix === 'token' || prefix === 'currency') return 'resources';
  return null;
}

function iconFileFromItem(item: any): string | null {
  return item?.images?.icon?.file || item?.images?.small_icon?.file || null;
}

let catalogsCache: AssetCatalogs | null = null;
type PortraitCatalog = Record<string, { images?: { icon?: { file?: string } } }>;

let portraitsCatalogCache: PortraitCatalog | null = null;

function loadStwPortraitsCatalog(): PortraitCatalog {
  if (portraitsCatalogCache) return portraitsCatalogCache;

  const jsonPath = join(CATALOG_ROOT, 'survivors', 'portraits.json');
  if (!existsSync(jsonPath)) {
    portraitsCatalogCache = {};
    return portraitsCatalogCache;
  }

  const payload = JSON.parse(readFileSync(jsonPath, 'utf8'));
  const catalog: PortraitCatalog = payload.portraits ?? {};
  portraitsCatalogCache = catalog;
  return catalog;
}

export function loadStwAssetCatalogs(): AssetCatalogs {
  if (catalogsCache) return catalogsCache;

  const catalogs = {} as AssetCatalogs;
  for (const entry of CATALOG_FILES) {
    const jsonPath = join(CATALOG_ROOT, entry.file);
    if (!existsSync(jsonPath)) {
      catalogs[entry.key] = {};
      continue;
    }
    const payload = JSON.parse(readFileSync(jsonPath, 'utf8'));
    catalogs[entry.key] = payload[entry.mapKey] ?? {};
  }

  catalogsCache = catalogs;
  return catalogs;
}

/** Case/format insensitive key: GunTough_M_4thJuly == guntough_m_4thjuly */
function catalogMatchToken(id: string): string {
  return id.replace(/_t\d+$/i, '').toLowerCase().replace(/[^a-z0-9]/g, '');
}

function findCatalogEntry(
  catalogKey: CatalogKey,
  catalogId: string,
  catalogs: AssetCatalogs,
): Record<string, any> | null {
  const map = catalogs[catalogKey];
  if (!map) return null;

  if (map[catalogId]) return map[catalogId];

  const lower = catalogId.toLowerCase();
  for (const [id, item] of Object.entries(map)) {
    if (id.toLowerCase() === lower) return item;
  }

  const target = catalogMatchToken(catalogId.replace(/_t\d+$/i, ''));
  let best: { item: Record<string, any>; score: number } | null = null;

  for (const [id, item] of Object.entries(map)) {
    const candidate = catalogMatchToken(id.replace(/_t\d+$/i, ''));
    if (candidate !== target) continue;

    const idLower = id.toLowerCase();
    const tierMatch = idLower === lower ? 20 : idLower.startsWith(`${lower.replace(/_t\d+$/, '')}_`) ? 10 : 0;
    const score = 100 + tierMatch;
    if (!best || score > best.score) best = { item, score };
  }

  if (best) return best.item;

  // Legacy fallback for schematics/resources (prefix match by base id)
  if (catalogKey !== 'heroes' && catalogKey !== 'survivors') {
    const base = lower.replace(/_t\d+$/, '');
    for (const [id, item] of Object.entries(map)) {
      const idLower = id.toLowerCase();
      if (idLower === lower || idLower.startsWith(`${base}_`) || idLower.replace(/_t\d+$/, '') === base) {
        return item;
      }
    }
  }

  return null;
}

function resolveFromCatalog(catalogKey: CatalogKey, catalogId: string, catalogs: AssetCatalogs): string | null {
  const item = findCatalogEntry(catalogKey, catalogId, catalogs);
  if (!item) return null;
  const file = iconFileFromItem(item);
  return file ? resolveStwAssetFile(catalogKey, file) : null;
}

function resolveCatalogIconRemoteUrl(
  catalogKey: CatalogKey,
  templateId: string,
  catalogs: AssetCatalogs,
): string | null {
  const catalogId = templateToCatalogId(templateId);
  const item = findCatalogEntry(catalogKey, catalogId, catalogs);
  if (!item?.images) return null;
  return item.images.small_icon?.url ?? item.images.icon?.url ?? null;
}

export function resolveStwHeroIconRemoteUrl(
  templateId: string,
  catalogs = loadStwAssetCatalogs(),
): string | null {
  return resolveCatalogIconRemoteUrl('heroes', templateId, catalogs);
}

export function resolveStwWorkerIconRemoteUrl(
  templateId: string,
  catalogs = loadStwAssetCatalogs(),
): string | null {
  return resolveCatalogIconRemoteUrl('survivors', templateId, catalogs);
}

export function resolveStwDefenderIconRemoteUrl(
  templateId: string,
  catalogs = loadStwAssetCatalogs(),
): string | null {
  return resolveCatalogIconRemoteUrl('defenders', templateId, catalogs);
}

export function resolveStwSchematicIconRemoteUrl(
  templateId: string,
  catalogs = loadStwAssetCatalogs(),
): string | null {
  return resolveCatalogIconRemoteUrl('schematics', templateId, catalogs);
}

export function resolveStwPortraitIconLocalPath(iconDefId: string): string | null {
  const direct = join(PORTRAITS_DIR, `${iconDefId}.png`);
  if (existsSync(direct)) return direct;

  const catalogFile = loadStwPortraitsCatalog()[iconDefId]?.images?.icon?.file;
  if (catalogFile) {
    const fromCatalog = resolveStwAssetFile('survivors', catalogFile.replace(/^\/+/, ''));
    if (existsSync(fromCatalog!)) return fromCatalog;
  }

  return null;
}

export function resolveStwPortraitIconRemoteUrl(iconDefId: string): string {
  return `${STW_PORTRAIT_CDN}/${iconDefId}.png`;
}

/** Per-instance face from QueryProfile attributes.portrait (workerbasic, managers, etc.). */
export function resolveStwSurvivorPortraitIconSrc(
  portraitIconDef: string | undefined,
  preferLocal: boolean,
): string | null {
  if (!portraitIconDef) return null;

  const local = fileToDataUrl(resolveStwPortraitIconLocalPath(portraitIconDef));
  if (local) return local;
  if (!preferLocal) return resolveStwPortraitIconRemoteUrl(portraitIconDef);

  // Large grids use preferLocal to avoid hundreds of CDN hits; still prefer portrait CDN over generic workerbasic.
  return resolveStwPortraitIconRemoteUrl(portraitIconDef);
}

export function resolveStwCatalogItemName(templateId: string, catalogs: AssetCatalogs, fallback = ''): string {
  const catalogKey = catalogTypeForTemplate(templateId);
  const catalogId = templateToCatalogId(templateId);

  if (catalogKey && catalogs[catalogKey]?.[catalogId]?.name) {
    return catalogs[catalogKey][catalogId].name;
  }

  if (catalogKey) {
    const base = catalogId.toLowerCase().replace(/_t\d+$/, '');
    for (const [id, item] of Object.entries(catalogs[catalogKey] || {})) {
      if (id.toLowerCase().replace(/_t\d+$/, '') === base && item?.name) {
        return item.name;
      }
    }
  }

  return fallback || catalogId.replace(/_/g, ' ');
}

export function resolveStwItemIcon(templateId: string, catalogs = loadStwAssetCatalogs()): string | null {
  const key = templateId.toLowerCase();

  if (key === 'token:accountinventorybonus') {
    const armory = join(LEGACY_ICONS, 'armory_slot.png');
    if (existsSync(armory)) return armory;
  }

  if (key.startsWith('campaignheroloadout:')) {
    const loadout = resolveStwAssetFile('hero-loadout', 'icon/T-Icon-NewLoadoutConfiguration-128x.png');
    if (existsSync(loadout!)) return loadout;
  }

  const catalogKey = catalogTypeForTemplate(templateId);
  const catalogId = templateToCatalogId(templateId);

  if (catalogKey) {
    const resolved = resolveFromCatalog(catalogKey, catalogId, catalogs);
    if (resolved) return resolved;
  }

  const legacyKey = templateId.replace(/^[^:]+:/, '').toLowerCase();
  const legacy = join(LEGACY_ICONS, 'resources', `${legacyKey}.png`);
  if (existsSync(legacy)) return legacy;

  return null;
}

export function fileToDataUrl(filePath: string | null): string | null {
  if (!filePath || !existsSync(filePath)) return null;
  const ext = filePath.split('.').pop()?.toLowerCase() || 'png';
  const mime = ext === 'jpg' ? 'jpeg' : ext;
  const b64 = readFileSync(filePath).toString('base64');
  return `data:image/${mime};base64,${b64}`;
}

/** Fetch remote icon into a data URL for Puppeteer (avoids broken CDN images in screenshots). */
export async function httpUrlToDataUrl(url: string): Promise<string | null> {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(12_000) });
    if (!res.ok) return null;
    const mime = res.headers.get('content-type')?.split(';')[0] ?? 'image/png';
    const b64 = Buffer.from(await res.arrayBuffer()).toString('base64');
    return `data:${mime};base64,${b64}`;
  } catch {
    return null;
  }
}

export function resolveStwGoldIconDataUrl(): string | null {
  return fileToDataUrl(resolveStwItemIcon('AccountResource:eventcurrency_scaling'));
}

export function resolveStwShopBackgroundDataUrl(): string | null {
  return fileToDataUrl(join(process.cwd(), 'assets/backgrounds/stwshop.png'));
}
