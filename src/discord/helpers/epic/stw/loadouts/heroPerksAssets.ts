import fs from 'fs';
import path from 'path';
import { findAbilityIcon, findPerkIconBySlug } from './loadoutAssets.ts';
import { resolveHeroPerksRoot } from '#helpers/core/glowAssetPaths.ts';

const HERO_PERKS_ROOT = resolveHeroPerksRoot();
const EXTRACTED_ROOT = path.join(HERO_PERKS_ROOT, 'extracted');
/** PNG planos por Kit id: extracted/png_por_id/{abilities|hero_perk|commander_perk}/Kit_*.png */
const PNG_BY_ID_ROOT = path.join(EXTRACTED_ROOT, 'png_por_id');
const CATALOG_PATH = path.join(HERO_PERKS_ROOT, 'hero-perks.json');
const EXTRACTED_CATALOG_PATH = path.join(EXTRACTED_ROOT, 'extracted-catalog.json');
const ICON_ROOT = path.join(HERO_PERKS_ROOT, 'icon');

export type HeroPerkExtractSlot = 'abilities' | 'hero_perk' | 'commander_perk';

const CLASS_TO_ICON_FOLDER: Record<string, string> = {
  commando: 'soldier',
  ninja: 'ninja',
  constructor: 'constructor',
  outlander: 'outlander',
};

const ABILITY_SLUG_ALIASES: Record<string, string> = {
  FragGrenade: 'Grenade',
  MountedTurret: 'CampaignOfTheROSIE',
  MountedCannonTurret: 'CampaignOfTheROSIE',
  GroundWave: 'SeismicImpact',
  KunaiStorm: 'KunaiThrow',
};

interface HeroPerkImageRef {
  file?: string;
}

interface HeroPerkEntry {
  id: string;
  slug: string;
  classType?: string | null;
  image?: HeroPerkImageRef | null;
}

interface HeroPerksCatalog {
  perks: Record<string, HeroPerkEntry>;
}

interface ExtractedCatalogEntry {
  id: string;
  slot: HeroPerkExtractSlot;
  classType: string;
  file?: string;
}

let perkById: Map<string, string> | null = null;
let slugByClass: Map<string, string> | null = null;
let extractedById: Map<string, string> | null = null;

function normalizeKey(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]/g, '');
}

function iconFolderForClass(classType: string): string | null {
  return CLASS_TO_ICON_FOLDER[classType] ?? null;
}

function resolveImageFile(relFile: string): string | null {
  const full = path.join(HERO_PERKS_ROOT, relFile.replace(/\\/g, '/'));
  return fs.existsSync(full) ? full : null;
}

function loadExtractedIndex(): Map<string, string> {
  if (extractedById) return extractedById;
  extractedById = new Map();

  const addFile = (kitId: string, absPath: string) => {
    if (!fs.existsSync(absPath)) return;
    extractedById!.set(kitId, absPath);
    extractedById!.set(kitId.toLowerCase(), absPath);
  };

  if (fs.existsSync(EXTRACTED_CATALOG_PATH)) {
    try {
      const raw = JSON.parse(fs.readFileSync(EXTRACTED_CATALOG_PATH, 'utf8')) as {
        entries?: ExtractedCatalogEntry[];
      };
      for (const entry of raw.entries ?? []) {
        if (!entry.id || !entry.file) continue;
        addFile(entry.id, path.join(HERO_PERKS_ROOT, entry.file.replace(/\\/g, '/')));
      }
    } catch {
      /* scan dirs below */
    }
  }

  for (const slot of ['abilities', 'hero_perk', 'commander_perk'] as const) {
    const slotDir = path.join(EXTRACTED_ROOT, slot);
    if (!fs.existsSync(slotDir)) continue;
    for (const classFolder of fs.readdirSync(slotDir, { withFileTypes: true })) {
      if (!classFolder.isDirectory()) continue;
      const dir = path.join(slotDir, classFolder.name);
      for (const name of fs.readdirSync(dir)) {
        if (!name.toLowerCase().endsWith('.png')) continue;
        addFile(name.replace(/\.png$/i, ''), path.join(dir, name));
      }
    }
  }

  return extractedById;
}

function loadCatalogIndexes(): void {
  if (perkById && slugByClass) return;
  perkById = new Map();
  slugByClass = new Map();

  if (!fs.existsSync(CATALOG_PATH)) return;

  try {
    const raw = JSON.parse(fs.readFileSync(CATALOG_PATH, 'utf8')) as HeroPerksCatalog;
    for (const entry of Object.values(raw.perks ?? {})) {
      if (!entry.id || !entry.image?.file) continue;
      const full = resolveImageFile(entry.image.file);
      if (!full) continue;

      perkById.set(entry.id, full);
      perkById.set(entry.id.toLowerCase(), full);

      if (entry.slug && entry.classType) {
        const folder = iconFolderForClass(entry.classType);
        if (folder) {
          const key = `${folder}:${normalizeKey(entry.slug)}`;
          if (!slugByClass.has(key)) slugByClass.set(key, full);
        }
      }
    }
  } catch {
    perkById = new Map();
    slugByClass = new Map();
  }
}

function abilitySlugCandidates(segment: string): string[] {
  const primary = ABILITY_SLUG_ALIASES[segment] ?? segment;
  return [...new Set([primary, segment])];
}

function resolveFromPngPorId(kitId: string, slot: HeroPerkExtractSlot): string | null {
  const flat = path.join(PNG_BY_ID_ROOT, slot, `${kitId}.png`);
  return fs.existsSync(flat) ? flat : null;
}

function resolveFromOrganizedExtracted(
  kitId: string,
  classType: string,
  slot: HeroPerkExtractSlot,
): string | null {
  const folder = iconFolderForClass(classType);
  if (!folder) return null;
  const byClass = path.join(EXTRACTED_ROOT, slot, folder, `${kitId}.png`);
  return fs.existsSync(byClass) ? byClass : null;
}

function resolveFromExtractedCatalog(kitId: string): string | null {
  const index = loadExtractedIndex();
  return index.get(kitId) ?? index.get(kitId.toLowerCase()) ?? null;
}

/** 1) png_por_id  2) extracted/{slot}/{class}  3) extracted-catalog.json */
function resolveFromExtractedPath(
  kitId: string,
  classType: string,
  slot: HeroPerkExtractSlot,
): string | null {
  return (
    resolveFromPngPorId(kitId, slot) ??
    resolveFromOrganizedExtracted(kitId, classType, slot) ??
    resolveFromExtractedCatalog(kitId)
  );
}

/** Icono por Kit id (extracted local, sin CDN). */
export function resolvePerkIconByKitId(
  kitId: string | null | undefined,
  classType: string,
  slot: HeroPerkExtractSlot,
): string | null {
  if (!kitId) return null;

  const fromExtracted = resolveFromExtractedPath(kitId, classType, slot);
  if (fromExtracted) return fromExtracted;

  loadCatalogIndexes();
  const fromCatalog = perkById?.get(kitId) ?? perkById?.get(kitId.toLowerCase());
  if (fromCatalog) return fromCatalog;

  if (slot === 'abilities') {
    return resolveClassAbilityIcon(kitId, classType);
  }

  const slugMatch = kitId.match(/^Kit_Perk_H_(.+?)_T0[12]$/i);
  if (slugMatch) {
    return resolveHeroPerkIcon(slugMatch[1]);
  }

  return findPerkIconBySlug(kitId);
}

function resolveFromIconDir(classType: string, segment: string): string | null {
  const folder = iconFolderForClass(classType);
  if (!folder) return null;

  const dir = path.join(ICON_ROOT, folder);
  if (!fs.existsSync(dir)) return null;

  for (const slug of abilitySlugCandidates(segment)) {
    const direct = path.join(dir, `${slug}.png`);
    if (fs.existsSync(direct)) return direct;

    const norm = normalizeKey(slug);
    for (const name of fs.readdirSync(dir)) {
      if (!name.endsWith('.png')) continue;
      const stem = name.replace(/\.png$/i, '');
      if (normalizeKey(stem) === norm) return path.join(dir, name);
    }
  }

  return null;
}

function resolveFromSlugIndex(classType: string, segment: string): string | null {
  loadCatalogIndexes();
  const folder = iconFolderForClass(classType);
  if (!folder || !slugByClass) return null;

  for (const slug of abilitySlugCandidates(segment)) {
    const hit = slugByClass.get(`${folder}:${normalizeKey(slug)}`);
    if (hit) return hit;
  }
  return null;
}

export function resolveHeroPerkIcon(slug: string | null | undefined): string | null {
  if (!slug) return null;
  loadCatalogIndexes();

  const fromId = perkById?.get(slug) ?? perkById?.get(slug.toLowerCase());
  if (fromId) return fromId;

  const base = slug.replace(/Plus$/i, '').toLowerCase();
  if (slugByClass) {
    for (const folder of Object.values(CLASS_TO_ICON_FOLDER)) {
      const hit = slugByClass.get(`${folder}:${normalizeKey(base)}`);
      if (hit) return hit;
    }
  }

  return findPerkIconBySlug(slug);
}

export function resolveClassAbilityIcon(kitId: string, classType: string): string | null {
  const fromExtracted = resolveFromExtractedPath(kitId, classType, 'abilities');
  if (fromExtracted) return fromExtracted;

  loadCatalogIndexes();
  const fromCatalog = perkById?.get(kitId) ?? perkById?.get(kitId.toLowerCase());
  if (fromCatalog) return fromCatalog;

  const kitMatch = kitId.match(/^Kit_(?:Commando|Constructor|Ninja|Outlander)_(.+)$/i);
  if (!kitMatch) {
    return resolveHeroPerkIcon(kitId) ?? findPerkIconBySlug(kitId);
  }

  const segment = kitMatch[1];

  for (const slug of abilitySlugCandidates(segment)) {
    const fromIndex = resolveFromSlugIndex(classType, slug);
    if (fromIndex) return fromIndex;

    const fromDir = resolveFromIconDir(classType, slug);
    if (fromDir) return fromDir;

    const legacy = findAbilityIcon(classType, slug);
    if (legacy) return legacy;

    const perk = resolveHeroPerkIcon(slug);
    if (perk) return perk;
  }

  return null;
}
