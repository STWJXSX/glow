import fs from 'fs';
import path from 'path';

import { resolveLlamaIconPath } from '../llamas/llamasAssetResolver.ts';
import { resolveStwCardItemIcon } from '../campaign/stwCardAssetResolver.ts';
import type { StwCardsCollectionType } from '../campaign/types.ts';
import {
  resolveSectionGenericIconPath,
  resolveStwGenericVoucherIconPath,
} from '../stwGenericIconResolver.ts';
import {
  resolveAccountResourceMeta,
  resolveResourceCatalogIcon,
  resolveZoneDifficultyIcon,
} from '../resources/resourcesAssetResolver.ts';
import { resolveStwCatalogRoot } from '#helpers/core/glowAssetPaths.ts';

const CATALOG_ROOT = resolveStwCatalogRoot();

type SimpleCatalogEntry = {
  id?: string;
  image?: { file?: string };
};

type SimpleCatalogMap = Record<string, SimpleCatalogEntry>;

const simpleCatalogCache = new Map<string, SimpleCatalogMap>();

function loadSimpleCatalog(folder: 'world' | 'modifiers', mapKey: string): SimpleCatalogMap {
  const cacheKey = `${folder}::${mapKey}`;
  const cached = simpleCatalogCache.get(cacheKey);
  if (cached) return cached;

  const jsonPath = path.join(CATALOG_ROOT, folder, `${folder}.json`);
  if (!fs.existsSync(jsonPath)) {
    simpleCatalogCache.set(cacheKey, {});
    return {};
  }

  const payload = JSON.parse(fs.readFileSync(jsonPath, 'utf8').replace(/^\uFEFF/, '')) as Record<string, unknown>;
  const map = (payload[mapKey] ?? {}) as SimpleCatalogMap;
  simpleCatalogCache.set(cacheKey, map);
  return map;
}

function findCatalogEntry(map: SimpleCatalogMap, catalogId: string): SimpleCatalogEntry | null {
  if (!catalogId) return null;
  if (map[catalogId]) return map[catalogId];
  const lower = catalogId.toLowerCase();
  for (const [id, entry] of Object.entries(map)) {
    if (id.toLowerCase() === lower) return entry;
  }
  return null;
}

function resolveSimpleCatalogIcon(folder: 'world' | 'modifiers', catalogId: string): string | null {
  const map = loadSimpleCatalog(folder, folder);
  const entry = findCatalogEntry(map, catalogId);
  const file = entry?.image?.file;
  if (!file) return null;

  const iconPath = path.join(CATALOG_ROOT, folder, file.replace(/^\/+/, ''));
  return fs.existsSync(iconPath) ? iconPath : null;
}

function resolveWorkerGenericVoucherIcon(templateId: string): string | null {
  return resolveStwGenericVoucherIconPath(templateId);
}

function missionCatalogType(itemType: string): StwCardsCollectionType | null {
  const prefix = itemType.split(':')[0]?.toLowerCase() ?? '';
  if (prefix === 'hero') return 'heroes';
  if (prefix === 'defender') return 'defenders';
  if (prefix === 'schematic') return 'schematics';
  return null;
}

export function unwrapZcpCardPackTemplateId(itemType: string): string | null {
  const match = /^cardpack:(.+)$/i.exec(itemType.trim());
  if (!match) return null;

  let key = match[1].toLowerCase();
  if (!key.startsWith('zcp_')) return null;
  key = key.slice(4);

  key = key
    .replace(/_t\d+$/i, '')
    .replace(/_(verylow|low|medium|high|veryhigh|extreme)$/i, '');

  if (key.includes('eventscaling') || key === 'eventscaling') {
    return 'AccountResource:eventcurrency_scaling';
  }
  if (key.includes('personnelxp')) return 'AccountResource:personnelxp';
  if (key.includes('schematicxp')) return 'AccountResource:schematicxp';
  if (key.includes('heroxp')) return 'AccountResource:heroxp';
  if (key.includes('phoenixxp')) return 'AccountResource:phoenixxp';
  if (key.startsWith('reagent_')) return `AccountResource:${key}`;

  if (key.includes('voucher_basicpack')) return 'AccountResource:voucher_basicpack';
  if (key.includes('voucher_cardpack_jackpot')) return 'AccountResource:voucher_cardpack_jackpot';
  if (key.includes('voucher_cardpack_bronze')) return 'AccountResource:voucher_cardpack_bronze';
  if (key.startsWith('hordev')) return 'AccountResource:voucher_generic_hero_sr';

  return null;
}

const MISSION_WORLD_RULES: { test: (n: string) => boolean; id: string }[] = [
  { test: (n) => n.includes('ride the lightning'), id: 'rtl' },
  { test: (n) => n.includes('retrieve the data'), id: 'rtd' },
  { test: (n) => n.includes('deliver the bomb'), id: 'dtb' },
  { test: (n) => n.includes('destroy') && n.includes('encampment'), id: 'dte' },
  { test: (n) => n.includes('repair the shelter'), id: 'rts' },
  { test: (n) => n.includes('evacuate the shelter'), id: 'ets' },
  { test: (n) => n.includes('category 4'), id: 'atlas-c4' },
  { test: (n) => n.includes('category 3'), id: 'atlas-c3' },
  { test: (n) => n.includes('category 2'), id: 'atlas-c2' },
  { test: (n) => n.includes('fight the storm'), id: 'atlas' },
  { test: (n) => n.includes('radar'), id: 'radar' },
  { test: (n) => n.includes('rescue the survivor'), id: 'rescue' },
  { test: (n) => n.includes('refuel'), id: 'refuel' },
  { test: (n) => n.includes('resupply'), id: 'resupply' },
  { test: (n) => n.includes('eliminate and collect'), id: 'eac' },
  { test: (n) => n.includes('storm shield'), id: 'storm-shield' },
  { test: (n) => n.includes('hunt the titan') || n.includes('titan'), id: 'htm' },
  { test: (n) => n.includes('launch the rocket'), id: 'rocket' },
  {
    test: (n) => n.includes('stabilize the rift') || n.includes('hit the road') || n.includes('fight the gunslinger'),
    id: 'quest',
  },
];

export function resolveMissionWorldCatalogId(missionName: string): string {
  const n = missionName.toLowerCase();
  for (const rule of MISSION_WORLD_RULES) {
    if (rule.test(n)) return rule.id;
  }
  return 'quest';
}

export function resolveStwMissionIconPath(missionName: string): string | null {
  return resolveSimpleCatalogIcon('world', resolveMissionWorldCatalogId(missionName));
}

export function resolveStwModifierIconPath(modifierName: string): string | null {
  const normalized = modifierName.toLowerCase().replace(/[^a-z0-9]/g, '');
  const candidates = [
    normalized,
    normalized.replace(/^gm/, 'gm_'),
    modifierName.toLowerCase(),
    modifierName,
  ];

  for (const candidate of candidates) {
    const hit = resolveSimpleCatalogIcon('modifiers', candidate);
    if (hit) return hit;
  }

  const map = loadSimpleCatalog('modifiers', 'modifiers');
  for (const [id, entry] of Object.entries(map)) {
    if (id.replace(/[^a-z0-9]/g, '').includes(normalized) || normalized.includes(id.replace(/[^a-z0-9]/g, ''))) {
      const file = entry?.image?.file;
      if (!file) continue;
      const iconPath = path.join(CATALOG_ROOT, 'modifiers', file.replace(/^\/+/, ''));
      if (fs.existsSync(iconPath)) return iconPath;
    }
  }

  return null;
}

export function resolveSectionIconPath(options: {
  resourceId?: string;
  difficultyKey?: string;
  worldId?: string;
}): string | null {
  if (options.resourceId) {
    const generic = resolveSectionGenericIconPath(options.resourceId);
    if (generic) return generic;
    return resolveResourceCatalogIcon(options.resourceId);
  }
  if (options.difficultyKey) {
    return resolveZoneDifficultyIcon(options.difficultyKey);
  }
  if (options.worldId) {
    return resolveSimpleCatalogIcon('world', options.worldId);
  }
  return null;
}

export function resolveMissionRewardBaseIconPath(itemType: string): string | null {
  const lower = itemType.trim().toLowerCase();
  if (lower.includes('currency_mtxswap') || lower.includes('mtxswap')) {
    return resolveResourceCatalogIcon('Currency_MtxSwap');
  }

  if (lower.startsWith('worker:') || lower.startsWith('accountresource:voucher_generic_')) {
    const generic = resolveWorkerGenericVoucherIcon(itemType);
    if (generic) return generic;
  }

  const unwrapped = unwrapZcpCardPackTemplateId(itemType);
  if (unwrapped) {
    const icon = resolveMissionRewardBaseIconPath(unwrapped);
    if (icon) return icon;
  }

  const catalogType = missionCatalogType(itemType);
  if (catalogType) {
    const icon = resolveStwCardItemIcon({ templateId: itemType }, catalogType);
    if (icon) return icon;
  }

  const meta = resolveAccountResourceMeta(itemType);
  if (meta.iconPath) return meta.iconPath;

  const llama = resolveLlamaIconPath(itemType);
  if (llama) return llama;

  return null;
}

/** @deprecated Use resolveRewardDisplayIconPath from worldInfoRewardDisplay.ts */
export function resolveMissionRewardIconPath(itemType: string): string | null {
  return resolveMissionRewardBaseIconPath(itemType);
}

const ZONE_LETTER_BADGE: Record<string, { letter: string; color: string }> = {
  'Twine Peaks': { letter: 'T', color: '#9b59b6' },
  'Canny Valley': { letter: 'C', color: '#e67e22' },
  Plankerton: { letter: 'P', color: '#f39c12' },
  Stonewood: { letter: 'S', color: '#2ecc71' },
};

export function resolveZoneLetterBadge(zone: string): { letter: string; color: string } | null {
  return ZONE_LETTER_BADGE[zone] ?? null;
}

/** Image badge for Ventures / Events — launcher `getZoneBadge`. */
export function resolveZoneImageBadgePath(zone: string): string | null {
  if (ZONE_LETTER_BADGE[zone]) return null;

  const difficultyMap: Record<string, string> = {
    Ventures: 'ventures',
    Events: 'ventures',
    'Events or Campaign': 'ventures',
  };
  const difficultyKey = difficultyMap[zone];
  if (difficultyKey) {
    return resolveZoneDifficultyIcon(difficultyKey);
  }

  if (zone === 'V-Bucks') {
    return resolveResourceCatalogIcon('Currency_MtxSwap');
  }

  return resolveSimpleCatalogIcon('world', 'quest');
}

let powerIconPathCache: string | null | undefined;

export function resolveStwPowerIconPath(): string | null {
  if (powerIconPathCache !== undefined) return powerIconPathCache;

  const jsonPath = path.join(CATALOG_ROOT, 'zones', 'zones.json');
  if (!fs.existsSync(jsonPath)) {
    powerIconPathCache = null;
    return null;
  }

  const payload = JSON.parse(fs.readFileSync(jsonPath, 'utf8').replace(/^\uFEFF/, '')) as {
    zones?: Record<string, { image?: { file?: string } }>;
  };
  const file = payload.zones?.power?.image?.file;
  if (!file) {
    powerIconPathCache = null;
    return null;
  }

  const abs = path.join(CATALOG_ROOT, 'zones', file.replace(/^\/+/, ''));
  powerIconPathCache = fs.existsSync(abs) ? abs : null;
  return powerIconPathCache;
}
