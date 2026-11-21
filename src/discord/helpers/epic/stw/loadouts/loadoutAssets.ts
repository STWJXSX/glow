/**
 * Shared STW loadout asset resolvers (portraits, team perks, gadgets, hero info).
 * Used by /loadouts, stwLoadoutImageGenerator, and hero perk catalogs.
 */

import fs from 'fs';
import path from 'path';
import { findHeroCatalogEntry } from '../gameplay/stwHeroesGameplay.ts';
import { resolveGlowProjectRoot, resolveStwHeroesAllRoot, resolveStwIconsRoot } from '#helpers/core/glowAssetPaths.ts';

const GLOW_ROOT = resolveGlowProjectRoot();
export const HEROES_ROOT = resolveStwHeroesAllRoot();
export const STW_ICONS_ROOT = resolveStwIconsRoot();
export const GADGET_ICONS_ROOT = path.join(GLOW_ROOT, 'assets/icons');
export const GADGET_DISCORD_ICONS_ROOT = path.join(resolveStwIconsRoot(), 'gadgets/discord');

export const CLASS_MAP: Record<string, { folder: string; cid: string; display: string; label: string }> = {
  commando:    { folder: 'Soldier',     cid: 'Commando',    display: 'Soldier',     label: 'Soldier'     },
  ninja:       { folder: 'Ninja',       cid: 'Ninja',       display: 'Ninja',       label: 'Ninja'       },
  constructor: { folder: 'Constructor', cid: 'Constructor', display: 'Constructor', label: 'Constructor' },
  outlander:   { folder: 'Outlander',   cid: 'Outlander',   display: 'Outlander',   label: 'Outlander'   },
};

export const RARITY_VARIANT: Record<string, string> = {
  sr: 'VariantLegendary', ssr: 'VariantMythic', vr: 'VariantEpic',
  r: 'VariantRare', uc: 'VariantUncommon', c: 'VariantUncommon',
};

export const RARITY_DISPLAY: Record<string, string> = {
  sr: 'Legendary',
  ssr: 'Mythic',
  ur: 'Mythic',
  er: 'Mythic',
  vr: 'Epic',
  r: 'Rare',
  uc: 'Uncommon',
  c: 'Common',
};

const HERO_RARITY_LABEL_TO_CODE: Record<string, string> = {
  mythic: 'ur',
  legendary: 'sr',
  epic: 'vr',
  rare: 'r',
  uncommon: 'uc',
  common: 'c',
};

const TEMPLATE_RARITY_RE =
  /^hero:hid_([a-z]+)_(.+?)_(ur|er|ssr|sr|vr|r|uc|c)_t(\d+)$/i;

export const RARITY_BAR: Record<string, string> = {
  sr: '#D4AF37', ssr: '#E52222', vr: '#9B59B6', r: '#3498DB', uc: '#2ECC71', c: '#95A5A6',
};

export const RARITY_PORTRAIT_BG: Record<string, string> = {
  sr: '#CE7C11', ssr: '#CE7C11', vr: '#8C32B1', r: '#2E6DB4', uc: '#3D8B40', c: '#6B6B6B',
};

const TEAM_PERK_ICONS: Record<string, string> = {
  blakebeardstreasure: 'Icon-TeamPerk-BlakebeardsTreasure-128.png',
  boombase:            'Icon-TeamPerk-BoomBase-128.png',
  boombbase:           'Icon-TeamPerk-BoomBase-128.png',
  dangerdanger:        'Icon-TeamPerk-DangerDanger-128.png',
  endlessshadow:       'Icon-TeamPerk-EndlessShadow-128.png',
  happyholidays:       'Icon-TeamPerk-HappyHolidays-128.png',
  holidaycheer:        'Icon-TeamPerk-HappyHolidays-128.png',
  huntersinstinct:     'Icon-TeamPerk-HuntersInstinct-128.png',
  phaseblaster:        'Icon-TeamPerk-PhaseBlaster-128.png',
  preemptivestrike:    'Icon-TeamPerk-PreemptiveStrike-128.png',
  roundtrip:           'Icon-TeamPerk-RoundTrip-128.png',
  shakeitoff:          'Icon-TeamPerk-ShakeItOff-128.png',
  totallygnarly:       'Icon-TeamPerk-TotallyGnarly-128.png',
  trickandtreat:       'Icon-TeamPerk-TrickAndTreat-128.png',
  blastfromthepast:    'Perk-TeamPerk-BlastFromThePast-128.png',
  soaringmantis:       'Icon-Ninja-SoaringMantis-128.png',
};

export const TEAM_PERK_NAMES: Record<string, string> = {
  blakebeardstreasure: "Blakebeard's Treasure",
  boombase:            'BOOM-B.A.S.E.',
  dangerdanger:        'Z.A.P.',
  endlessshadow:       'Endless Shadow',
  happyholidays:       'Happy Holidays',
  holidaycheer:        'Happy Holidays',
  huntersinstinct:     "Hunter's Instinct",
  phaseblaster:        'Phase Blaster',
  preemptivestrike:    'Preemptive Strike',
  roundtrip:           'Round Trip',
  shakeitoff:          'Shake It Off',
  totallygnarly:       'Totally Gnarly',
  trickandtreat:       'Trick and Treat',
  blastfromthepast:    'Blast from the Past',
  soaringmantis:       'Soaring Mantis',
};

const GADGET_ICON_FILES: Record<string, string> = {
  g_generic_banner:        'banner.png',
  g_generic_adrenalinerush: 'airstrike.png',
  g_airstrike_onboarding:  'airstrike.png',
};

/** Populated from scripts/emojis/gadget-emoji-map.json (mapped + localOnly). */
const GADGET_ICON_FROM_MAP: Record<string, string> = {};

function loadGadgetIconMap(): void {
  if (Object.keys(GADGET_ICON_FROM_MAP).length > 0) return;
  try {
    const mapPath = path.resolve((import.meta.dirname ?? __dirname), '../../../../../scripts/emojis/gadget-emoji-map.json');
    if (!fs.existsSync(mapPath)) return;
    const parsed = JSON.parse(fs.readFileSync(mapPath, 'utf8')) as {
      mapped?: Array<{ slug: string; localIconPath?: string }>;
      localOnly?: Array<{ slug: string; localIconPath?: string }>;
    };
    const root = path.resolve((import.meta.dirname ?? __dirname), '../../../../../');
    for (const row of [...(parsed.mapped ?? []), ...(parsed.localOnly ?? [])]) {
      if (!row.slug || !row.localIconPath) continue;
      const key = row.slug.startsWith('g_') ? row.slug : `g_${row.slug}`;
      GADGET_ICON_FROM_MAP[key] = path.join(root, row.localIconPath);
    }
  } catch {
    /* optional */
  }
}

function snakeToPascal(snake: string): string {
  return snake
    .split('_')
    .filter(Boolean)
    .map((p) => p.charAt(0).toUpperCase() + p.slice(1))
    .join('');
}

const HERO_POWER: Record<string, Record<number, number>> = {
  c: Object.fromEntries(Array.from({ length: 50 }, (_, i) => [i + 1, Math.min(10 + i, 47)])),
  uc: Object.fromEntries(Array.from({ length: 50 }, (_, i) => [i + 1, Math.min(5 + i * 2, 112)])),
  r: Object.fromEntries(Array.from({ length: 50 }, (_, i) => [i + 1, Math.min(10 + i, 122)])),
  vr: Object.fromEntries(Array.from({ length: 60 }, (_, i) => [i + 1, Math.min(9 + i, 142)])),
  sr: {
    1: 12, 2: 14, 3: 15, 4: 17, 5: 18, 6: 20, 7: 21, 8: 23, 9: 24, 10: 26,
    11: 36, 12: 38, 13: 39, 14: 41, 15: 42, 16: 44, 17: 45, 18: 47, 19: 48, 20: 50,
    21: 60, 22: 62, 23: 63, 24: 65, 25: 66, 26: 68, 27: 69, 28: 71, 29: 72, 30: 74,
    31: 84, 32: 86, 33: 87, 34: 89, 35: 90, 36: 92, 37: 93, 38: 95, 39: 96, 40: 98,
    41: 116, 42: 118, 43: 119, 44: 121, 45: 122, 46: 124, 47: 125, 48: 127, 49: 128, 50: 130,
    52: 133, 54: 136, 56: 139, 58: 142, 60: 144,
  },
};

export interface HeroInfo {
  displayName: string;
  classType: string;
  classLabel: string;
  rarity: string;
  rarityDisplay: string;
  tier: number;
}

/** Evolution stars shown in loadout UI (tier from template id, 1–5). */
export function getHeroStarCount(info: HeroInfo): number {
  if (info.rarity === 'ur' || info.rarity === 'er' || info.rarity === 'ssr') return 5;
  return Math.min(5, Math.max(1, info.tier || 1));
}

export function isMythicRarity(rarity: string): boolean {
  return rarity === 'ur' || rarity === 'er' || rarity === 'ssr';
}

export function rarityCssClass(rarity: string): string {
  if (isMythicRarity(rarity)) return 'mythic';
  if (rarity === 'sr') return 'legendary';
  if (rarity === 'vr') return 'epic';
  if (rarity === 'r') return 'rare';
  return 'uncommon';
}

export function commanderBannerColor(rarity: string): string {
  if (isMythicRarity(rarity)) return '#c9ae2d';
  if (rarity === 'sr') return '#ec831f';
  if (rarity === 'vr') return '#9b59b6';
  if (rarity === 'r') return '#2e6db4';
  return '#6b6b6b';
}

/** Rareza real desde heroes.json (p. ej. SR_T05 con rarity "Mythic"). */
export function resolveHeroRarityFromCatalog(templateId: string): string | null {
  const entry = findHeroCatalogEntry(templateId);
  if (!entry?.rarity) return null;
  return HERO_RARITY_LABEL_TO_CODE[String(entry.rarity).toLowerCase()] ?? null;
}

export function getHeroPower(rarity: string, level: number): number {
  const powerKey = isMythicRarity(rarity) || rarity === 'ssr' ? 'sr' : rarity;
  const table = HERO_POWER[powerKey];
  if (!table) return level;
  if (table[level] !== undefined) return table[level];
  const keys = Object.keys(table).map(Number).sort((a, b) => a - b);
  let closest = keys[0];
  for (const k of keys) { if (k <= level) closest = k; else break; }
  return table[closest] ?? level;
}

/** Normalized hero key for catalog lookup: hid_ninja_019 */
export function heroCatalogKey(templateId: string): string | null {
  const m = templateId.toLowerCase().match(/^hero:hid_([a-z]+)_(.+?)_(sr|ssr|vr|r|uc|c)_t\d+$/);
  if (!m) return null;
  const [, classType, middle] = m;
  const idPart = middle.split('_').filter((p) => !/^[fm]$|^[fm]_/i.test(p) && p.length > 1);
  const numericOrName = idPart.find((p) => /^\d+$/.test(p)) ?? idPart[0];
  if (!numericOrName) return null;
  return `hid_${classType}_${numericOrName.toLowerCase()}`;
}

export function resolveHeroPortrait(templateId: string): string | null {
  const m = templateId.toLowerCase().match(/^hero:hid_([a-z]+)_(.+?)_(sr|ssr|vr|r|uc|c)_t\d+$/);
  if (!m) return null;

  const [, classType, middlePart, rarity] = m;
  const cls = CLASS_MAP[classType];
  if (!cls) return null;

  const folder = path.join(HEROES_ROOT, cls.folder, 'Portrait');
  if (!fs.existsSync(folder)) return null;

  let files: string[];
  try { files = fs.readdirSync(folder); } catch { return null; }

  const norm = (s: string) =>
    s.toLowerCase().replace(/[^a-z0-9]/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '');

  const noHeadgear = (f: string) => !/headgear/i.test(f);
  const noSmall    = (f: string) => !f.endsWith('-L.png');

  const searchKey = norm(`hid-${classType}-${middlePart.replace(/_/g, '-')}-${rarity}`);
  const hidCandidates = files.filter((f) => norm(f).includes(searchKey));
  if (hidCandidates.length > 0) {
    return path.join(folder,
      hidCandidates.find((f) => noHeadgear(f) && noSmall(f)) ??
      hidCandidates.find((f) => noHeadgear(f)) ??
      hidCandidates[0],
    );
  }

  const middleSlug = norm(middlePart.replace(/_/g, '-'));
  const classSlug = norm(`${classType}-${middlePart.replace(/_/g, '-')}`);

  const scorePortrait = (fileName: string): number => {
    const fl = norm(fileName);
    let score = 0;
    if (fl.includes(searchKey)) score += 1000;
    if (fl.includes(middleSlug)) score += 500 + middleSlug.length;
    if (fl.includes(classSlug)) score += 400 + classSlug.length;

    const parts = middlePart.split('_').filter((p) => p.length > 1 && !/^[fm]$/i.test(p));
    const matchedParts = parts.filter((p) => fl.includes(norm(p))).length;
    score += matchedParts * 40;

    // Weak match: only the numeric id (e.g. "013") — avoid unless nothing else matches
    const numericOnly = parts.length > 1 && /^\d+$/.test(parts[0]) && matchedParts <= 1;
    if (numericOnly) score = Math.min(score, 30);

    return score;
  };

  const scored = files
    .map((file) => ({ file, score: scorePortrait(file) }))
    .filter((entry) => entry.score >= 80)
    .sort((a, b) => b.score - a.score);

  if (!scored.length) return null;

  const variant = RARITY_VARIANT[rarity] ?? 'VariantLegendary';
  const pick = (predicate: (f: string) => boolean) => scored.find((entry) => predicate(entry.file))?.file;

  return path.join(folder,
    pick((f) => f.includes(variant) && noHeadgear(f) && !noSmall(f)) ??
    pick((f) => noHeadgear(f) && !noSmall(f)) ??
    pick((f) => noHeadgear(f)) ??
    scored[0].file,
  );
}

export function resolveTeamPerkIcon(templateId: string): { filePath: string; name: string } | null {
  const key = templateId
    .replace(/^TeamPerk:/i, '')
    .replace(/^tpid_/, '')
    .replace(/^pit_/, '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');

  const iconFile = TEAM_PERK_ICONS[key];
  if (!iconFile) {
    const classPerkPath = findPerkIconBySlug(key);
    if (classPerkPath) return { filePath: classPerkPath, name: TEAM_PERK_NAMES[key] ?? slugToDisplayName(key) };
    return null;
  }

  const teamPath = path.join(HEROES_ROOT, 'TeamPerk', iconFile);
  if (fs.existsSync(teamPath)) return { filePath: teamPath, name: TEAM_PERK_NAMES[key] ?? key };

  const alt = findPerkIconBySlug(key.replace(/s$/, ''));
  if (alt) return { filePath: alt, name: TEAM_PERK_NAMES[key] ?? slugToDisplayName(key) };

  return null;
}

export function slugToDisplayName(slug: string): string {
  const base = slug.replace(/Plus$/, '').replace(/([A-Z])/g, ' $1').trim();
  const withPlus = slug.endsWith('Plus') ? `${base} +` : base;
  return withPlus.toUpperCase();
}

let perkIconIndex: Map<string, string> | null = null;

function buildPerkIconIndex(): Map<string, string> {
  const index = new Map<string, string>();
  if (!fs.existsSync(HEROES_ROOT)) return index;

  const walk = (dir: string) => {
    let entries: fs.Dirent[];
    try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }
    for (const ent of entries) {
      const full = path.join(dir, ent.name);
      if (ent.isDirectory()) walk(full);
      else if (/Icon-(Constructor|Ninja|Soldier|Outlander|Global)-.+-128\.png$/i.test(ent.name)) {
        const slug = ent.name.replace(/^Icon-(?:Constructor|Ninja|Soldier|Outlander|Global)-/i, '').replace(/-128\.png$/i, '');
        index.set(slug.toLowerCase(), full);
      } else if (/Icon-TeamPerk-.+-128\.png$/i.test(ent.name)) {
        const slug = ent.name.replace(/^Icon-TeamPerk-/i, '').replace(/-128\.png$/i, '');
        index.set(slug.toLowerCase(), full);
      }
    }
  };
  walk(HEROES_ROOT);
  walk(path.join(HEROES_ROOT, 'TeamPerk'));
  return index;
}

export function findPerkIconBySlug(slug: string): string | null {
  if (!perkIconIndex) perkIconIndex = buildPerkIconIndex();
  const key = slug.replace(/Plus$/i, '').toLowerCase();
  return perkIconIndex.get(key) ?? perkIconIndex.get(slug.toLowerCase()) ?? null;
}

const ICON_CID: Record<string, string> = {
  commando: 'Soldier',
  ninja: 'Ninja',
  constructor: 'Constructor',
  outlander: 'Outlander',
};

export function findAbilityIcon(classType: string, abilitySlug: string): string | null {
  const cls = CLASS_MAP[classType];
  if (!cls) return findPerkIconBySlug(abilitySlug);
  const iconCid = ICON_CID[classType] ?? cls.cid;
  const candidates = [
    path.join(HEROES_ROOT, cls.folder, `Icon-${iconCid}-${abilitySlug}-128.png`),
    path.join(HEROES_ROOT, cls.folder, 'Perks', `Icon-${iconCid}-${abilitySlug}-128.png`),
    path.join(HEROES_ROOT, cls.folder, `Icon-${cls.cid}-${abilitySlug}-128.png`),
  ];
  for (const p of candidates) {
    if (fs.existsSync(p)) return p;
  }
  return findPerkIconBySlug(abilitySlug);
}

export function resolveGadgetIcon(templateId: string): string | null {
  loadGadgetIconMap();

  const raw = templateId.replace(/^Gadget:/i, '').replace(/^g_/i, '').toLowerCase();
  const rawKey = raw.startsWith('g_') ? raw : `g_${raw}`;

  const fromJson = GADGET_ICON_FROM_MAP[rawKey];
  if (fromJson && fs.existsSync(fromJson)) return fromJson;

  const mapped = GADGET_ICON_FILES[rawKey] ?? GADGET_ICON_FILES[raw] ?? GADGET_ICON_FILES[raw.replace(/_t\d+$/, '')];
  if (mapped) {
    const p = path.join(GADGET_ICONS_ROOT, mapped);
    if (fs.existsSync(p)) return p;
  }

  const discordSlug = raw.replace(/[^a-z0-9_]/gi, '_').slice(0, 48);
  for (const ext of ['.png', '.gif', '.webp']) {
    const discordPath = path.join(GADGET_DISCORD_ICONS_ROOT, `${discordSlug}${ext}`);
    if (fs.existsSync(discordPath)) return discordPath;
  }

  const parts = raw.split('_').filter(Boolean);
  const classKeys = Object.keys(CLASS_MAP);
  if (parts.length >= 2 && classKeys.includes(parts[0])) {
    const abilitySlug = snakeToPascal(parts.slice(1).join('_'));
    const classIcon = findAbilityIcon(parts[0], abilitySlug);
    if (classIcon) return classIcon;
  }

  const perk = findPerkIconBySlug(raw.split('_').slice(-1)[0] ?? raw);
  if (perk) return perk;
  return null;
}

export function classIconPath(classType: string): string | null {
  const cls = CLASS_MAP[classType];
  if (!cls) return null;
  const local = path.join(STW_ICONS_ROOT, 'classes', `Icon-Class-${cls.cid}-L.png`);
  if (fs.existsSync(local)) return local;
  return null;
}

export const CLASS_ICON_CDN: Record<string, string> = {
  commando: 'https://b2.fortnitedb.com/file/peepoT/Icon-Class-Soldier-L.png',
  ninja: 'https://b2.fortnitedb.com/file/peepoT/Icon-Class-Ninja-L.png',
  constructor: 'https://b2.fortnitedb.com/file/peepoT/Icon-Class-Constructor-L.png',
  outlander: 'https://b2.fortnitedb.com/file/peepoT/Icon-Class-Outlander-L.png',
};

export function parseHeroInfo(templateId: string, displayName: string): HeroInfo {
  const m = templateId.match(TEMPLATE_RARITY_RE);
  if (!m) {
    const cls = Object.keys(CLASS_MAP).find((k) => templateId.toLowerCase().includes(`hid_${k}_`));
    const catalogRarity = resolveHeroRarityFromCatalog(templateId);
    return {
      displayName,
      classType: cls ?? 'commando',
      classLabel: cls ? CLASS_MAP[cls].label : 'Unknown',
      rarity: catalogRarity ?? 'r',
      rarityDisplay: catalogRarity ? (RARITY_DISPLAY[catalogRarity] ?? 'Rare') : 'Rare',
      tier: 1,
    };
  }
  const [, classType, , templateRarity, tierStr] = m;
  const cls = CLASS_MAP[classType];
  const catalogRarity = resolveHeroRarityFromCatalog(templateId);
  const rarity = catalogRarity ?? templateRarity.toLowerCase();
  return {
    displayName,
    classType,
    classLabel: cls?.label ?? classType,
    rarity,
    rarityDisplay: RARITY_DISPLAY[rarity] ?? 'Rare',
    tier: parseInt(tierStr, 10),
  };
}
