import fs from 'fs';
import path from 'path';

import { resolveStwCatalogRoot } from '#helpers/core/glowAssetPaths.ts';

const CATALOG_ROOT = resolveStwCatalogRoot();

type CatalogEntry = {
  id?: string;
  name?: string;
  images?: { icon?: { file?: string; url?: string } };
  image?: { file?: string; url?: string };
};

type IconRef = { path: string | null; url: string | null };

let difficultiesCache: Record<string, CatalogEntry> | null = null;
let resourcesCache: Record<string, CatalogEntry> | null = null;
let cardpacksCache: Record<string, CatalogEntry> | null = null;
let resourcesByToken: Map<string, string> | null = null;

function loadCatalog<T>(rel: string, key: string): T {
  const jsonPath = path.join(CATALOG_ROOT, rel);
  if (!fs.existsSync(jsonPath)) return {} as T;
  const payload = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));
  return (payload[key] ?? {}) as T;
}

function getResourcesCatalog(): Record<string, CatalogEntry> {
  if (!resourcesCache) {
    resourcesCache = loadCatalog<Record<string, CatalogEntry>>('resources/resources.json', 'resources');
    resourcesByToken = new Map();
    for (const [id, entry] of Object.entries(resourcesCache)) {
      resourcesByToken.set(normalizeToken(id), id);
    }
  }
  return resourcesCache;
}

function getCardpacksCatalog(): Record<string, CatalogEntry> {
  if (!cardpacksCache) {
    cardpacksCache = loadCatalog<Record<string, CatalogEntry>>('cardpacks/cardpacks.json', 'cardpacks');
  }
  return cardpacksCache;
}

function normalizeToken(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]/g, '');
}

function iconFromEntry(folder: string, entry: CatalogEntry | undefined): IconRef {
  const file = entry?.images?.icon?.file ?? entry?.image?.file;
  const url = entry?.images?.icon?.url ?? entry?.image?.url ?? null;
  if (file) {
    const full = path.join(CATALOG_ROOT, folder, file);
    if (fs.existsSync(full)) return { path: full, url: null };
  }
  return { path: null, url };
}

function suffixToPascal(suffix: string): string {
  return suffix
    .split('_')
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
    .join('_');
}

function toCardPackId(suffix: string): string {
  const body = suffix.startsWith('cardpack_') ? suffix.slice('cardpack_'.length) : suffix;
  return `CardPack_${body.split('_').map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase()).join('_')}`;
}

const TEMPLATE_ALIASES: Record<string, string> = {
  collectionresource_nodegatetoken01: 'Token_CollectionResource_NodeGateToken01',
  xpboost: 'Token_XpBoost',
  smallxpboost_gift: 'Token_XpBoost',
  currency_xrayllama: 'Currency_XRayLlama',
  eventcurrency_scaling: 'EventCurrency_Scaling',
  gold: 'EventCurrency_Scaling',
  schematicxp: 'SchematicXP',
  heroxp: 'HeroXP',
  peoplexp: 'PeopleXP',
  personnelxp: 'PeopleXP',
  phoenixxp: 'PhoenixXP',
  phoenixxp_reward: 'PhoenixXP',
};

function metaFromCatalog(
  catalogId: string,
  folder: 'resources' | 'cardpacks',
  catalog: Record<string, CatalogEntry>,
): { catalogId: string; label: string; iconPath: string | null; iconUrl: string | null } {
  const entry = catalog[catalogId];
  const icon = iconFromEntry(folder, entry);
  return {
    catalogId,
    label: entry?.name ?? catalogId,
    iconPath: icon.path,
    iconUrl: icon.url,
  };
}

export function resolveZoneDifficultyIcon(zoneKey: string): string | null {
  if (!difficultiesCache) {
    difficultiesCache = loadCatalog<Record<string, CatalogEntry>>('difficulties/difficulties.json', 'difficulties');
  }
  return iconFromEntry('difficulties', difficultiesCache[zoneKey]).path;
}

export function resolveResourceCatalogIcon(catalogId: string): string | null {
  const catalog = getResourcesCatalog();
  return iconFromEntry('resources', catalog[catalogId]).path;
}

export function resolveAccountResourceMeta(templateId: string): {
  catalogId: string;
  label: string;
  iconPath: string | null;
  iconUrl: string | null;
} {
  const suffix = (templateId.split(':').pop() ?? templateId).toLowerCase();
  const catalog = getResourcesCatalog();
  const tokenMap = resourcesByToken!;

  if (suffix.startsWith('cardpack_')) {
    const cardpackId = toCardPackId(suffix);
    const cardpacks = getCardpacksCatalog();
    if (cardpacks[cardpackId]) {
      return metaFromCatalog(cardpackId, 'cardpacks', cardpacks);
    }
  }

  const aliasId = TEMPLATE_ALIASES[suffix];
  if (aliasId && catalog[aliasId]) {
    return metaFromCatalog(aliasId, 'resources', catalog);
  }

  const pascal = suffixToPascal(suffix);
  if (catalog[pascal]) {
    return metaFromCatalog(pascal, 'resources', catalog);
  }

  const byToken = tokenMap.get(normalizeToken(suffix));
  if (byToken && catalog[byToken]) {
    return metaFromCatalog(byToken, 'resources', catalog);
  }

  for (const [id, entry] of Object.entries(catalog)) {
    if (normalizeToken(id).includes(normalizeToken(suffix)) || normalizeToken(suffix).includes(normalizeToken(id))) {
      const icon = iconFromEntry('resources', entry);
      return {
        catalogId: id,
        label: entry.name ?? id,
        iconPath: icon.path,
        iconUrl: icon.url,
      };
    }
  }

  return {
    catalogId: pascal,
    label: suffix.replace(/_/g, ' '),
    iconPath: null,
    iconUrl: null,
  };
}

export function resolveZoneEmblemIcon(zoneKey: string): string | null {
  const normalized = zoneKey.toLowerCase();
  const file = path.join(CATALOG_ROOT, 'zones', 'icon', `${normalized}.webp`);
  return fs.existsSync(file) ? file : null;
}

export function resolveStwAssetPath(relativePath: string): string | null {
  const candidates = [
    path.join(process.cwd(), relativePath),
    path.join(process.cwd(), 'apps/bots/glow', relativePath),
    path.join((import.meta.dirname ?? __dirname), '../../../../..', relativePath),
  ];
  return candidates.find((p) => fs.existsSync(p)) ?? null;
}

