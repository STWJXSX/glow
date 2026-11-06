/**
 * STW loadout catalog resolver — stw-catalog assets + maps/translations.
 * Ported from scripts/stw/render-loadout-catalog.mjs (catalog/translation logic only).
 */

import fs from 'fs';
import path from 'path';
import type { SupportedLanguage } from '#helpers/locales/index.ts';
import {
  translateLoadoutClassLabel,
  translateLoadoutRarityLabel,
} from './stwLoadoutPanelI18n.ts';

export {
  getHeroPower,
  getHeroStarCount,
  rarityCssClass,
  type HeroInfo,
} from './loadoutAssets.ts';

import type { HeroInfo } from './loadoutAssets.ts';
import { resolveStwCatalogRoot } from '#helpers/core/glowAssetPaths.ts';

const CATALOG_ROOT = resolveStwCatalogRoot();
const TRANSLATIONS = path.join(process.cwd(), 'src/discord/helpers/data/maps/translations');

const HERO_PERKS_ROOT = path.join(CATALOG_ROOT, 'hero-perks');
const EXTRACTED_CATALOG_PATH = path.join(HERO_PERKS_ROOT, 'extracted/extracted-catalog.json');
const PNG_BY_ID_ROOT = path.join(HERO_PERKS_ROOT, 'extracted/png_por_id');
const GADGETS_ROOT = path.join(CATALOG_ROOT, 'gadgets');
const GADGET_DISCORD_ROOT = path.join(GADGETS_ROOT, 'discord');

const TEMPLATE_RARITY_RE =
  /^hero:hid_([a-z]+)_(.+?)_(ur|er|ssr|sr|vr|r|uc|c)_t(\d+)$/i;

const HERO_RARITY_LABEL_TO_CODE: Record<string, string> = {
  mythic: 'ur',
  legendary: 'sr',
  epic: 'vr',
  rare: 'r',
  uncommon: 'uc',
  common: 'c',
};

const CLASS_ICON_FOLDER: Record<string, string> = {
  commando: 'soldier',
  soldier: 'soldier',
  ninja: 'ninja',
  constructor: 'constructor',
  outlander: 'outlander',
};

/** tpid_* from profile → slug in team-perks.json */
export const TEAM_PERK_TPID_ALIASES: Record<string, string> = {
  holidaycheer: 'HappyHolidays',
  happyholidays: 'HappyHolidays',
  blakebeardsstash: 'BlakebeardsTreasure',
  blakebeardstreasure: 'BlakebeardsTreasure',
  boombbase: 'BoomBase',
  bioenergysource: 'Bio-EnergySource',
  soaringmantis: 'SoaringMantis',
};

export const ABILITY_SLUG_ALIASES: Record<string, string> = {
  FragGrenade: 'Grenade',
  KunaiStorm: 'KunaiThrow',
  MountedTurret: 'CampaignOfTheROSIE',
  MountedCannonTurret: 'CampaignOfTheROSIE',
  GroundWave: 'SeismicImpact',
};

export const GADGET_NAME_FALLBACK_KEYS: Record<string, string[]> = {
  generic_adrenalinerush: ['HomebaseNode:skilltree_adrenalinerush'],
  airstrike: ['Gadget:g_airstrike_onboarding', 'HomebaseNode:skilltree_airstrike'],
};

const GAME_GADGET_PASCAL_TO_SLUG: Record<string, string> = {
  adrenalinerush: 'generic_adrenalinerush',
  airstrike: 'airstrike',
  banner: 'generic_banner',
  proximitymine: 'generic_proximitymines',
  slowfield: 'generic_slowfield',
  supplydrop: 'supplydrop',
  teleporter: 'teleporter',
  turretbot: 'generic_botturret',
};

const DISCORD_SLUG_TO_GADGET: Record<string, string> = {
  perk_c_constructor_base_t01: 'g_constructor_base',
};

const GADGET_CLASS: Record<string, string> = {
  commando: 'Commando',
  ninja: 'Ninja',
  constructor: 'Constructor',
  outlander: 'Outlander',
};

interface CatalogHeroImage {
  file?: string;
}

interface CatalogHeroImages {
  icon?: CatalogHeroImage;
  small_icon?: CatalogHeroImage;
}

interface CatalogAbility {
  id: string;
  name?: string;
}

interface CatalogGameplayDefinition {
  commander_perk?: { id?: string; name?: string };
  hero_perk?: { id?: string; name?: string };
  abilities?: CatalogAbility[];
}

interface CatalogHeroEntry {
  name?: string;
  rarity?: string;
  tier?: number;
  type?: string;
  hero_outfit_definition?: { id?: string };
  hero_gameplay_definition?: CatalogGameplayDefinition;
  images?: CatalogHeroImages;
}

interface CatalogHeroPerkEntry {
  slug?: string;
  image?: { file?: string };
  classType?: string;
}

interface CatalogTeamPerkEntry {
  slug?: string;
  name?: string;
  templateId?: string;
  image?: { file?: string };
  commanderHeroPerkSlugs?: string[];
}

interface ExtractedCatalogFile {
  entries?: Array<{ id?: string; file?: string }>;
}

const catalogs: {
  heroes: Record<string, CatalogHeroEntry> | null;
  heroPerks: Record<string, CatalogHeroPerkEntry> | null;
  heroPerksBySlug: Record<string, CatalogHeroPerkEntry> | null;
  teamPerks: Record<string, CatalogTeamPerkEntry> | null;
} = {
  heroes: null,
  heroPerks: null,
  heroPerksBySlug: null,
  teamPerks: null,
};

let extractedByKitId: Map<string, string> | null = null;
let gadgetIndex: { byTemplate: Map<string, string>; bySlug: Map<string, string> } | null = null;

const translations: { primary: Record<string, string> | null; fallback: Record<string, string> | null } = {
  primary: null,
  fallback: null,
};

let loadedTranslationLang: SupportedLanguage | null = null;

export interface ResolvedLoadoutPerks {
  commanderPerkName: string;
  commanderPerkIcon: string | null;
  supportPerkName: string;
  supportPerkIcon: string | null;
  abilities: Array<{ slug: string; name: string; icon: string | null }>;
  activePerkName: string;
  activePerkIcon: string | null;
}

function normalizeKey(value: string): string {
  return String(value || '').toLowerCase().replace(/[^a-z0-9]/g, '');
}

function readJson<T>(filePath: string): T {
  const raw = fs.readFileSync(filePath, 'utf8').replace(/^\uFEFF/, '');
  return JSON.parse(raw) as T;
}

function loadCatalogs(): void {
  if (!catalogs.heroes) {
    catalogs.heroes = readJson<{ heroes: Record<string, CatalogHeroEntry> }>(
      path.join(CATALOG_ROOT, 'heroes/heroes.json'),
    ).heroes;
    const heroPerksRaw = readJson<{
      perks: Record<string, CatalogHeroPerkEntry>;
      bySlug?: Record<string, CatalogHeroPerkEntry>;
    }>(path.join(CATALOG_ROOT, 'hero-perks/hero-perks.json'));
    catalogs.heroPerks = heroPerksRaw.perks;
    catalogs.heroPerksBySlug = heroPerksRaw.bySlug ?? {};
    catalogs.teamPerks = readJson<{ teamPerks: Record<string, CatalogTeamPerkEntry> }>(
      path.join(CATALOG_ROOT, 'team-perks/team-perks.json'),
    ).teamPerks;
  }
}

function loadTranslations(lang: SupportedLanguage): void {
  if (loadedTranslationLang === lang && translations.primary && translations.fallback) return;

  loadedTranslationLang = lang;
  const file = path.join(TRANSLATIONS, `${lang}.json`);
  const enFile = path.join(TRANSLATIONS, 'en.json');
  translations.primary = fs.existsSync(file) ? readJson<Record<string, string>>(file) : readJson(enFile);
  translations.fallback = readJson<Record<string, string>>(enFile);
}

function t(key: string, fallback = ''): string {
  const v = translations.primary?.[key] ?? translations.fallback?.[key];
  return v && v !== key ? v : fallback;
}

export function setLoadoutTranslationLang(lang: SupportedLanguage): void {
  loadTranslations(lang);
}

function ensureLang(lang: SupportedLanguage): void {
  loadTranslations(lang);
}

/** Kit_Commando_Shockwave → Gadget:g_commando_shockwave (class actives in translations) */
export function kitIdToGadgetKey(kitId: string): string | null {
  if (!kitId) return null;
  const m = kitId.match(/^Kit_(Commando|Ninja|Constructor|Outlander)_(.+)$/i);
  if (!m) return null;
  const cls = m[1].toLowerCase();
  let ability = m[2];
  if (ABILITY_SLUG_ALIASES[ability]) ability = ABILITY_SLUG_ALIASES[ability];
  const snake = ability.replace(/([a-z])([A-Z])/g, '$1_$2').toLowerCase().replace(/_/g, '');
  return `Gadget:g_${cls}_${snake}`;
}

export function translateKitDisplayName(kitId: string, englishFallback = ''): string {
  const gadgetKey = kitIdToGadgetKey(kitId);
  if (gadgetKey) {
    const hit = t(gadgetKey, '');
    if (hit) return hit;
  }
  return englishFallback;
}

/** Hero/support perks — no Kit_Perk_* keys in maps/translations today */
export function translatePerkName(kitId: string, englishName: string): string {
  if (!englishName) return '';
  if (!kitId) return englishName;
  const direct = t(kitId, '') || t(kitId.toLowerCase(), '');
  if (direct) return direct;
  return englishName;
}

function gadgetTranslationKeys(templateId: string): string[] {
  const raw = templateId.replace(/^Gadget:/i, '');
  const slug = raw.replace(/^g_/i, '').toLowerCase();
  const keys = [
    templateId,
    templateId.toLowerCase(),
    `Gadget:g_${slug}`,
    `Gadget:${raw}`,
    `Gadget:g_${raw.toLowerCase()}`,
  ];
  const fallbacks =
    GADGET_NAME_FALLBACK_KEYS[slug] ??
    GADGET_NAME_FALLBACK_KEYS[raw.toLowerCase()] ??
    [];
  return [...new Set([...keys, ...fallbacks])];
}

export function templateToCatalogId(templateId: string): string {
  const [typeRaw, rawId] = templateId.split(':');
  const parts = (rawId || '').toLowerCase().split('_');
  const pascalParts = parts.map((part) => {
    if (/^(hid|sid|wid|cid|tid)$/i.test(part)) return part.toUpperCase();
    if (/^(sr|vr|r|uc|c|ore)$/i.test(part)) return part.toUpperCase();
    if (/^t\d+$/i.test(part)) return part.toUpperCase();
    return part.charAt(0).toUpperCase() + part.slice(1);
  });
  if ((typeRaw || '').toLowerCase() === 'cardpack') {
    const rest = pascalParts.slice(1).join('_');
    return rest ? `CardPack_${rest}` : `CardPack_${pascalParts.join('_')}`;
  }
  return pascalParts.join('_');
}

export function catalogMatchToken(id: string): string {
  return id.replace(/_t\d+$/i, '').toLowerCase().replace(/[^a-z0-9]/g, '');
}

export function findHeroEntry(templateId: string): CatalogHeroEntry | null {
  loadCatalogs();
  const heroes = catalogs.heroes!;
  const id = templateToCatalogId(templateId);
  if (heroes[id]) return heroes[id];
  const lower = id.toLowerCase();
  for (const [key, entry] of Object.entries(heroes)) {
    if (key.toLowerCase() === lower) return entry;
  }
  const target = catalogMatchToken(id);
  for (const [key, entry] of Object.entries(heroes)) {
    if (catalogMatchToken(key) === target) return entry;
  }
  return null;
}

function catalogHeroIconPath(templateId: string): string | null {
  const entry = findHeroEntry(templateId);
  const catalogId = templateToCatalogId(templateId);

  const tryRel = (rel: string | undefined): string | null => {
    if (!rel) return null;
    const abs = path.join(CATALOG_ROOT, 'heroes', rel.replace(/\\/g, '/'));
    return fs.existsSync(abs) ? abs : null;
  };

  const fromEntry = tryRel(entry?.images?.icon?.file) ?? tryRel(entry?.images?.small_icon?.file);
  if (fromEntry) return fromEntry;

  for (const sub of ['icon', 'smallicon']) {
    const dir = path.join(CATALOG_ROOT, 'heroes', sub);
    if (!fs.existsSync(dir)) continue;
    const target = catalogMatchToken(catalogId);
    for (const name of fs.readdirSync(dir)) {
      if (!/\.(png|webp|jpe?g)$/i.test(name)) continue;
      const stem = name.replace(/\.[^.]+$/i, '');
      if (
        stem.toLowerCase() === catalogId.toLowerCase() ||
        catalogMatchToken(stem) === target
      ) {
        return path.join(dir, name);
      }
    }
  }

  return null;
}

export function catalogHeroPortraitPath(templateId: string): string | null {
  return catalogHeroIconPath(templateId);
}

export function buildExtractedIndex(): Map<string, string> {
  if (extractedByKitId) return extractedByKitId;
  extractedByKitId = new Map();

  const register = (kitId: string, absPath: string): void => {
    if (!kitId || !absPath || !fs.existsSync(absPath)) return;
    if (!extractedByKitId!.has(kitId)) extractedByKitId!.set(kitId, absPath);
    const lower = kitId.toLowerCase();
    if (!extractedByKitId!.has(lower)) extractedByKitId!.set(lower, absPath);
  };

  if (fs.existsSync(EXTRACTED_CATALOG_PATH)) {
    try {
      const raw = readJson<ExtractedCatalogFile>(EXTRACTED_CATALOG_PATH);
      for (const entry of raw.entries ?? []) {
        if (!entry?.id || !entry?.file) continue;
        register(entry.id, path.join(HERO_PERKS_ROOT, entry.file.replace(/\\/g, '/')));
      }
    } catch {
      /* scan dirs below */
    }
  }

  for (const slot of ['abilities', 'hero_perk', 'commander_perk'] as const) {
    const slotDir = path.join(PNG_BY_ID_ROOT, slot);
    if (!fs.existsSync(slotDir)) continue;
    for (const name of fs.readdirSync(slotDir)) {
      if (!/\.(png|webp|jpe?g)$/i.test(name)) continue;
      register(name.replace(/\.[^.]+$/i, ''), path.join(slotDir, name));
    }
    for (const classDir of fs.readdirSync(slotDir, { withFileTypes: true })) {
      if (!classDir.isDirectory()) continue;
      const dir = path.join(slotDir, classDir.name);
      for (const name of fs.readdirSync(dir)) {
        if (!/\.(png|webp|jpe?g)$/i.test(name)) continue;
        register(name.replace(/\.[^.]+$/i, ''), path.join(dir, name));
      }
    }
  }

  return extractedByKitId;
}

function resolveExtractedIcon(kitId: string): string | null {
  if (!kitId) return null;
  const index = buildExtractedIndex();
  return index.get(kitId) ?? index.get(kitId.toLowerCase()) ?? null;
}

function perkImageAbs(relFile: string | undefined): string | null {
  if (!relFile) return null;
  const abs = path.join(CATALOG_ROOT, 'hero-perks', relFile.replace(/\\/g, '/'));
  return fs.existsSync(abs) ? abs : null;
}

function kitIdToPerkSlug(kitId: string): string | null {
  let m = kitId.match(/^Kit_Perk_H_(.+?)_T0[12]$/i);
  if (m) return m[1];
  m = kitId.match(/^Kit_Perk_H_(.+?)T0[12]$/i);
  if (m) return m[1];
  return null;
}

function findIconInClassFolder(classType: string | undefined, slug: string): string | null {
  const folder = CLASS_ICON_FOLDER[classType?.toLowerCase() ?? ''];
  if (!folder || !slug) return null;
  const iconDir = path.join(CATALOG_ROOT, 'hero-perks/icon', folder);
  if (!fs.existsSync(iconDir)) return null;
  const target = normalizeKey(slug);
  for (const name of fs.readdirSync(iconDir)) {
    if (!/\.(png|webp|jpe?g)$/i.test(name)) continue;
    const stem = name.replace(/\.[^.]+$/i, '');
    if (normalizeKey(stem) === target) return path.join(iconDir, name);
  }
  return null;
}

function resolvePerkIconFromSlug(slug: string, classType: string | undefined): string | null {
  if (!slug) return null;
  loadCatalogs();
  const norm = normalizeKey(slug);

  const bySlugEntry = catalogs.heroPerksBySlug![norm];
  if (bySlugEntry?.image?.file) {
    const hit = perkImageAbs(bySlugEntry.image.file);
    if (hit) return hit;
  }

  for (const entry of Object.values(catalogs.heroPerks!)) {
    if (normalizeKey(entry.slug ?? '') !== norm) continue;
    const hit = perkImageAbs(entry.image?.file);
    if (hit) return hit;
    if (classType) {
      const fromDisk = findIconInClassFolder(classType, entry.slug || slug);
      if (fromDisk) return fromDisk;
    }
  }

  return classType ? findIconInClassFolder(classType, slug) : null;
}

export function catalogPerkIconPath(kitId: string, classType?: string): string | null {
  if (!kitId) return null;
  loadCatalogs();

  const fromExtracted = resolveExtractedIcon(kitId);
  if (fromExtracted) return fromExtracted;

  const heroPerks = catalogs.heroPerks!;
  const direct =
    heroPerks[kitId] ??
    heroPerks[Object.keys(heroPerks).find((k) => k.toLowerCase() === kitId.toLowerCase()) ?? ''];
  const fromDirect = perkImageAbs(direct?.image?.file);
  if (fromDirect) return fromDirect;

  const perkSlug = kitIdToPerkSlug(kitId) ?? direct?.slug;
  const fromSlug = resolvePerkIconFromSlug(perkSlug ?? '', classType ?? direct?.classType);
  if (fromSlug) return fromSlug;

  const abilityMatch = kitId.match(/^Kit_(Commando|Constructor|Ninja|Outlander)_(.+)$/i);
  if (abilityMatch) {
    const cls = abilityMatch[1].toLowerCase() === 'commando' ? 'commando' : abilityMatch[1].toLowerCase();
    const segment = abilityMatch[2];
    const candidates = [segment, ABILITY_SLUG_ALIASES[segment]].filter(Boolean) as string[];
    for (const slug of candidates) {
      const hit = findIconInClassFolder(cls, slug);
      if (hit) return hit;
    }
  }

  return null;
}

function teamPerkKeyFromTemplate(templateId: string): string {
  return templateId
    .replace(/^TeamPerk:/i, '')
    .replace(/^tpid_/i, '')
    .replace(/^pit_/i, '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');
}

function findTeamPerkEntry(templateId: string): CatalogTeamPerkEntry | null {
  loadCatalogs();
  const key = teamPerkKeyFromTemplate(templateId);
  if (!key) return null;

  const teamPerks = catalogs.teamPerks!;
  const aliasSlug = TEAM_PERK_TPID_ALIASES[key];
  if (aliasSlug && teamPerks[aliasSlug]) {
    return teamPerks[aliasSlug];
  }

  for (const [catalogKey, entry] of Object.entries(teamPerks)) {
    const slugNorm = normalizeKey(entry.slug || catalogKey);
    const tidNorm = normalizeKey(String(entry.templateId || '').replace(/^TeamPerk:/i, ''));
    if (slugNorm === key || tidNorm === key || normalizeKey(catalogKey) === key) {
      return entry;
    }
  }

  for (const entry of Object.values(teamPerks)) {
    const slugNorm = normalizeKey(entry.slug ?? '');
    if (slugNorm.includes(key) || key.includes(slugNorm)) return entry;
  }

  return null;
}

function findTeamPerkIconFile(templateId: string, entry: CatalogTeamPerkEntry | null): string | null {
  const rel = entry?.image?.file;
  if (rel) {
    const abs = path.join(CATALOG_ROOT, 'team-perks', rel);
    if (fs.existsSync(abs)) return abs;
  }

  const key = teamPerkKeyFromTemplate(templateId);
  const teamIconDir = path.join(CATALOG_ROOT, 'team-perks/icon/team');
  if (fs.existsSync(teamIconDir)) {
    for (const name of fs.readdirSync(teamIconDir)) {
      if (!/\.(png|webp|jpe?g)$/i.test(name)) continue;
      const stem = normalizeKey(name.replace(/\.[^.]+$/i, ''));
      if (stem === key || (entry?.slug && stem === normalizeKey(entry.slug))) {
        return path.join(teamIconDir, name);
      }
    }
  }

  if (entry?.slug === 'SoaringMantis') {
    const mantis = findIconInClassFolder('ninja', 'SoaringMantis');
    if (mantis) return mantis;
  }

  for (const perk of entry?.commanderHeroPerkSlugs ?? []) {
    const hit = resolvePerkIconFromSlug(perk, undefined);
    if (hit) return hit;
  }

  return null;
}

function slugFromGadgetTemplate(templateId: string): string {
  return templateId.replace(/^Gadget:/i, '').replace(/^g_/i, '');
}

function pascalToSnake(pascal: string): string {
  return pascal.replace(/([a-z])([A-Z])/g, '$1_$2').toLowerCase();
}

function buildGadgetIndex(): { byTemplate: Map<string, string>; bySlug: Map<string, string> } {
  if (gadgetIndex) return gadgetIndex;

  const byTemplate = new Map<string, string>();
  const bySlug = new Map<string, string>();

  const register = (templateId: string, filePath: string): void => {
    const key = templateId.toLowerCase();
    if (!byTemplate.has(key)) byTemplate.set(key, filePath);
  };

  const walk = (dir: string): void => {
    if (!fs.existsSync(dir)) return;
    for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, ent.name);
      if (ent.isDirectory()) {
        walk(full);
        continue;
      }
      if (!/\.(png|webp|jpe?g|gif)$/i.test(ent.name)) continue;

      const base = ent.name.replace(/\.[^.]+$/, '');
      const slug = base.toLowerCase();
      bySlug.set(slug, full);
      register(`Gadget:g_${slug}`, full);

      const mappedGadget = DISCORD_SLUG_TO_GADGET[slug];
      if (mappedGadget) register(`Gadget:${mappedGadget}`, full);

      if (/-bg-/i.test(base)) continue;

      const gameMatch = base.match(/Icon-Gadget-([A-Za-z0-9]+)-128/i);
      if (gameMatch) {
        const pascalNorm = normalizeKey(gameMatch[1]);
        const mappedSlug = GAME_GADGET_PASCAL_TO_SLUG[pascalNorm];
        if (mappedSlug) register(`Gadget:g_${mappedSlug}`, full);
        register(`Gadget:g_generic_${pascalToSnake(gameMatch[1])}`, full);
      }
    }
  };

  walk(GADGET_DISCORD_ROOT);
  walk(path.join(GADGETS_ROOT, 'Plugins'));

  gadgetIndex = { byTemplate, bySlug };
  return gadgetIndex;
}

function gadgetToKitId(templateId: string): string | null {
  const raw = slugFromGadgetTemplate(templateId).toLowerCase();
  if (raw.startsWith('generic_')) return null;
  const parts = raw.split('_');
  const cls = GADGET_CLASS[parts[0]];
  if (!cls) return null;
  const ability = parts
    .slice(1)
    .map((p) => p.charAt(0).toUpperCase() + p.slice(1))
    .join('');
  return ability ? `Kit_${cls}_${ability}` : null;
}

function resolveGadgetIconPath(templateId: string): string | null {
  const index = buildGadgetIndex();
  const tid = templateId.toLowerCase();

  const fromIndex = index.byTemplate.get(tid);
  if (fromIndex && fs.existsSync(fromIndex)) return fromIndex;

  const slug = slugFromGadgetTemplate(templateId).toLowerCase();
  const fromSlug = index.bySlug.get(slug);
  if (fromSlug && fs.existsSync(fromSlug)) return fromSlug;

  for (const ext of ['.png', '.webp', '.gif']) {
    const discordPath = path.join(GADGET_DISCORD_ROOT, `${slug}${ext}`);
    if (fs.existsSync(discordPath)) return discordPath;
  }

  const kitId = gadgetToKitId(templateId);
  if (kitId) {
    const perkPath = catalogPerkIconPath(kitId);
    if (perkPath) return perkPath;
  }

  return null;
}

function parseHeroInfo(templateId: string, displayName: string, lang: SupportedLanguage): HeroInfo {
  const entry = findHeroEntry(templateId);
  const catalogRarity = entry?.rarity
    ? HERO_RARITY_LABEL_TO_CODE[String(entry.rarity).toLowerCase()]
    : null;
  const m = templateId.match(TEMPLATE_RARITY_RE);
  if (!m) {
    const cls = (['commando', 'ninja', 'constructor', 'outlander'] as const).find((k) =>
      templateId.toLowerCase().includes(`hid_${k}_`),
    );
    const rarity = catalogRarity ?? 'r';
    return {
      displayName,
      classType: cls ?? 'commando',
      classLabel: cls ? translateLoadoutClassLabel(cls, lang) : 'Unknown',
      rarity,
      rarityDisplay: translateLoadoutRarityLabel(rarity, lang),
      tier: entry?.tier ?? 1,
    };
  }
  const [, classType, , templateRarity, tierStr] = m;
  const rarity = catalogRarity ?? templateRarity.toLowerCase();
  return {
    displayName,
    classType,
    classLabel: translateLoadoutClassLabel(classType, lang),
    rarity,
    rarityDisplay: translateLoadoutRarityLabel(rarity, lang),
    tier: entry?.tier ?? parseInt(tierStr, 10),
  };
}

function translateHeroName(templateId: string): string {
  const direct =
    t(templateId, '') ||
    t(templateId.toLowerCase(), '') ||
    findHeroEntry(templateId)?.name;
  if (direct) return direct;

  const entry = findHeroEntry(templateId);
  const cid = entry?.hero_outfit_definition?.id;
  if (cid) {
    const cidKey = `AthenaCharacter:${String(cid).replace(/^CID_/i, 'cid_').toLowerCase()}`;
    const fromCid = t(cidKey, '');
    if (fromCid) return fromCid;
  }

  return templateId.replace(/^Hero:/i, '').replace(/_/g, ' ');
}

function resolveHeroPerks(
  templateId: string,
  asCommander: boolean,
): ResolvedLoadoutPerks {
  const entry = findHeroEntry(templateId);
  const classType =
    String(entry?.type || '').toLowerCase() ||
    parseHeroInfo(templateId, '', 'en').classType;
  const gameplay = entry?.hero_gameplay_definition;
  if (!gameplay) {
    return {
      commanderPerkName: '',
      commanderPerkIcon: null,
      supportPerkName: '',
      supportPerkIcon: null,
      abilities: [],
      activePerkName: '',
      activePerkIcon: null,
    };
  }

  const commanderKit = gameplay.commander_perk;
  const supportKit = gameplay.hero_perk;
  const abilities = (gameplay.abilities ?? []).map((a) => ({
    slug: a.id,
    name: translateKitDisplayName(a.id, a.name || a.id),
    icon: catalogPerkIconPath(a.id, classType),
  }));

  const commanderName = translatePerkName(commanderKit?.id ?? '', commanderKit?.name ?? '');
  const supportName = translatePerkName(supportKit?.id ?? '', supportKit?.name ?? '');

  return {
    commanderPerkName: commanderName,
    commanderPerkIcon: catalogPerkIconPath(commanderKit?.id ?? '', classType),
    supportPerkName: supportName,
    supportPerkIcon: catalogPerkIconPath(supportKit?.id ?? '', classType),
    abilities,
    activePerkName: asCommander ? commanderName : supportName,
    activePerkIcon: asCommander
      ? catalogPerkIconPath(commanderKit?.id ?? '', classType)
      : catalogPerkIconPath(supportKit?.id ?? '', classType),
  };
}

function resolveTeamPerk(templateId: string): { templateId: string; name: string; iconPath: string | null } {
  const key = teamPerkKeyFromTemplate(templateId);
  const match = findTeamPerkEntry(templateId);
  const name =
    t(templateId, '') ||
    t(templateId.toLowerCase(), '') ||
    match?.name ||
    key.replace(/_/g, ' ');
  return {
    templateId,
    name,
    iconPath: findTeamPerkIconFile(templateId, match),
  };
}

function resolveGadget(templateId: string): { templateId: string; name: string; iconPath: string | null } {
  let name = '';
  for (const key of gadgetTranslationKeys(templateId)) {
    name = t(key, '');
    if (name) break;
  }
  if (!name) {
    const slug = slugFromGadgetTemplate(templateId).replace(/_/g, ' ');
    name = slug;
  }
  return {
    templateId,
    name,
    iconPath: resolveGadgetIconPath(templateId),
  };
}

export function translateHeroNameForLoadout(templateId: string, lang: SupportedLanguage): string {
  ensureLang(lang);
  return translateHeroName(templateId);
}

export function parseHeroInfoForLoadout(
  templateId: string,
  displayName: string,
  lang: SupportedLanguage,
): HeroInfo {
  ensureLang(lang);
  return parseHeroInfo(templateId, displayName, lang);
}

export function resolveHeroPerksForLoadout(
  templateId: string,
  asCommander: boolean,
  lang: SupportedLanguage,
): ResolvedLoadoutPerks {
  ensureLang(lang);
  return resolveHeroPerks(templateId, asCommander);
}

export function resolveTeamPerkForLoadout(
  templateId: string,
  lang: SupportedLanguage,
): { templateId: string; name: string; iconPath: string | null } {
  ensureLang(lang);
  return resolveTeamPerk(templateId);
}

export function resolveGadgetForLoadout(
  templateId: string,
  lang: SupportedLanguage,
): { templateId: string; name: string; iconPath: string | null } {
  ensureLang(lang);
  return resolveGadget(templateId);
}
