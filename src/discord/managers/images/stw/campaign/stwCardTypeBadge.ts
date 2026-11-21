import fs from 'fs';
import path from 'path';
import { parseDefenderWeaponType } from '#helpers/epic/stw/collection/stwCampaignDefenders.ts';
import { resolveSchematicFilterType } from '#helpers/epic/stw/inventory/stwSchematicFilters.ts';
import { resolveSurvivorFilterType } from '#helpers/epic/stw/inventory/stwSurvivorFilters.ts';
import { resolveStwIconsRoot } from '#helpers/core/glowAssetPaths.ts';
import { getFooterFontSize } from './stwFortniteCard.ts';
import type { StwCardsCollectionType } from './types.ts';

const STW_ICONS_ROOT = resolveStwIconsRoot();

const ITEM_TYPES = path.join(STW_ICONS_ROOT, 'ItemTypes');
const ITEM_CATEGORIES = path.join(STW_ICONS_ROOT, 'ItemCategories');
const LEADER_TYPE = path.join(STW_ICONS_ROOT, 'LeaderType');

const GENERIC_TRAP_ICON = 'ItemCategories/T-Icon-Traps-CARD_T-Icon-Traps-CARD.png';

/** White weapon silhouettes (STW UI style) — not Survivor-*-CARD defender portraits. */
const WEAPON_TYPE_ICONS = {
  assault: 'ItemTypes/T-Icon-Assault-Weapon_T-Icon-Assault-Weapon.png',
  sniper: 'ItemTypes/T-Icon-Sniper-Weapon_T-Icon-Sniper-Weapon.png',
  shotgun: 'ItemTypes/T-Icon-Shotgun-Weapon_T-Icon-Shotgun-Weapon.png',
  pistol: 'ItemTypes/T-Icon-Pistol-Weapon_T-Icon-Pistol-Weapon.png',
  smg: 'ItemTypes/T-Icon-SMG-Weapon_T-Icon-SMG-Weapon.png',
  melee: 'ItemTypes/T-Icon-Melee-Weapon_T-Icon-Melee-Weapon.png',
  explosive: 'ItemTypes/T-Icon-Explosive-CARD_T-Icon-Explosive-CARD.png',
} as const;

function weaponIcon(...keys: (keyof typeof WEAPON_TYPE_ICONS)[]): string[] {
  return keys.map((key) => WEAPON_TYPE_ICONS[key]);
}

function icon(...parts: string[]): string {
  return path.join(STW_ICONS_ROOT, ...parts);
}

function pickFirstExisting(...candidates: string[]): string | null {
  for (const candidate of candidates) {
    if (candidate && fs.existsSync(candidate)) return candidate;
  }
  return null;
}

const HERO_CLASS_ICONS: Record<string, string> = {
  commando: 'T-Icon-Hero-Soldier-CARD_T-Icon-Hero-Soldier-CARD.png',
  ninja: 'T-Icon-Hero-Ninja-CARD_T-Icon-Hero-Ninja-CARD.png',
  constructor: 'T-Icon-Hero-Constructor-CARD_T-Icon-Hero-Constructor-CARD.png',
  outlander: 'T-Icon-Hero-Outlander-CARD_T-Icon-Hero-Outlander-CARD.png',
};

const SCHEMATIC_TYPE_ICONS: Record<string, string[]> = {
  assault: weaponIcon('assault'),
  pistol: weaponIcon('pistol'),
  sniper: weaponIcon('sniper'),
  shotgun: weaponIcon('shotgun'),
  smg: weaponIcon('smg'),
  explosive: weaponIcon('explosive'),
  melee_sword: ['ItemTypes/T-Icon-Sword-CARD_T-Icon-Sword-CARD.png'],
  melee_hammer: ['ItemTypes/T-Icon-Blunt-CARD_T-Icon-Blunt-CARD.png'],
  melee_axe: ['ItemTypes/T-Icon-Axe-CARD_T-Icon-Axe-CARD.png'],
  melee_scythe: ['ItemTypes/T-Icon-Scythe-CARD_T-Icon-Scythe-CARD.png'],
  melee_spear: ['ItemTypes/T-Icon-Spear-CARD_T-Icon-Spear-CARD.png'],
  melee_bat: ['ItemTypes/T-Icon-Club-128_T-Icon-Club-128.png', 'ItemTypes/T-Icon-Blunt-CARD_T-Icon-Blunt-CARD.png'],
  other: ['ItemCategories/T-Icon-Schematic-CARD_T-Icon-Schematic-CARD.png'],
};

const DEFENDER_TYPE_ICONS: Record<string, string[]> = {
  sniper: weaponIcon('sniper'),
  assault: weaponIcon('assault'),
  shotgun: weaponIcon('shotgun'),
  pistol: weaponIcon('pistol'),
  melee: weaponIcon('melee'),
  unknown: ['ItemCategories/T-Icon-Defenders_-CARD_T-Icon-Defenders_-CARD.png'],
};

const SURVIVOR_TYPE_ICONS: Record<string, string[]> = {
  survivor: ['ItemTypes/T-Icon-Survivor-128_T-Icon-Survivor-128.png'],
  adventurous: ['PersonalityTypes/T-Icon-Adventurer-64.png'],
  analytical: ['PersonalityTypes/T-Icon-Analytical-64.png'],
  competitive: ['PersonalityTypes/T-Icon-Competitive-64.png'],
  cooperative: ['PersonalityTypes/T-Icon-Cooperative-64.png'],
  curious: ['PersonalityTypes/T-Icon-Curious-64.png'],
  dependable: ['PersonalityTypes/T-Icon-Dependable-64.png'],
  dreamer: ['PersonalityTypes/T-Icon-Dreamer-64.png'],
  pragmatic: ['PersonalityTypes/T-Icon-Pragmatic-64.png'],
  manager: ['ItemTypes/T-Icon-Survivor-Leader-CARD_T-Icon-Survivor-Leader-CARD.png'],
  manager_doctor: ['LeaderType/T-Icon-Leader-Doctor-CARD_T-Icon-Leader-Doctor-CARD.png'],
  manager_engineer: ['LeaderType/T-Icon-Leader-Engineer-CARD_T-Icon-Leader-Engineer-CARD.png'],
  manager_explorer: ['LeaderType/T-Icon-Leader-Explorer-CARD_T-Icon-Leader-Explorer-CARD.png'],
  manager_gadgeteer: ['LeaderType/T-Icon-Leader-Gadgeteer-CARD_T-Icon-Leader-Gadgeteer-CARD.png'],
  manager_inventor: ['LeaderType/T-Icon-Leader-Inventor-CARD_T-Icon-Leader-Inventor-CARD.png'],
  manager_marksman: ['LeaderType/T-Icon-Leader-Soldier-CARD_T-Icon-Leader-Soldier-CARD.png'],
  manager_martialartist: ['LeaderType/T-Icon-Leader-MartialArtist-CARD_T-Icon-Leader-MartialArtist-CARD.png'],
  manager_personaltrainer: ['LeaderType/T-Icon-Leader-Trainer-CARD_T-Icon-Leader-Trainer-CARD.png'],
};

function resolveHeroClass(templateId: string): string {
  const match = templateId.toLowerCase().match(/^hero:hid_([a-z]+)_/);
  return match?.[1] ?? 'unknown';
}

function resolveFromCandidates(candidates: string[]): string | null {
  return pickFirstExisting(...candidates.map((rel) => icon(...rel.split('/'))));
}

function isTrapSchematicSubtype(subtype: string): boolean {
  return subtype === 'trap_floor' || subtype === 'trap_wall' || subtype === 'trap_ceiling';
}

function resolveTrapIconPath(_templateId: string, subtype: string): string | null {
  if (!isTrapSchematicSubtype(subtype)) return null;
  return resolveFromCandidates([GENERIC_TRAP_ICON]);
}

export function resolveCardTypeKey(
  collectionType: StwCardsCollectionType,
  input: {
    templateId: string;
    isManager: boolean;
    portraitIconDef?: string;
    personalityAttr?: unknown;
  },
): string {
  const { templateId, isManager, portraitIconDef, personalityAttr } = input;

  switch (collectionType) {
    case 'heroes':
      return `hero:${resolveHeroClass(templateId)}`;
    case 'schematics':
      return `schematic:${resolveSchematicFilterType(templateId)}`;
    case 'defenders':
      return `defender:${parseDefenderWeaponType(templateId)}`;
    case 'survivors':
      return `survivor:${resolveSurvivorFilterType({
        itemId: '',
        templateId,
        level: 1,
        quantity: 1,
        rarity: 'r',
        isManager,
        portraitIconDef,
        personalityAttr,
      })}`;
    default:
      return 'unknown';
  }
}

export function resolveCardTypeIconPath(typeKey: string, templateId?: string): string | null {
  const [, subtype] = typeKey.split(':');

  if (typeKey.startsWith('hero:')) {
    const file = HERO_CLASS_ICONS[subtype];
    if (file) return pickFirstExisting(path.join(ITEM_TYPES, file));
    return pickFirstExisting(
      path.join(ITEM_CATEGORIES, 'T-Icon-Hero-CARD_T-Icon-Hero-CARD.png'),
      path.join(ITEM_CATEGORIES, 'T-Icon-Hero-128_T-Icon-Hero-128.png'),
    );
  }

  if (typeKey.startsWith('schematic:')) {
    if (templateId) {
      const trapIcon = resolveTrapIconPath(templateId, subtype);
      if (trapIcon) return trapIcon;
    }
    const candidates = SCHEMATIC_TYPE_ICONS[subtype] ?? SCHEMATIC_TYPE_ICONS.other;
    return resolveFromCandidates(candidates);
  }

  if (typeKey.startsWith('defender:')) {
    const candidates = DEFENDER_TYPE_ICONS[subtype] ?? DEFENDER_TYPE_ICONS.unknown;
    return resolveFromCandidates(candidates);
  }

  if (typeKey.startsWith('survivor:')) {
    const candidates = SURVIVOR_TYPE_ICONS[subtype] ?? SURVIVOR_TYPE_ICONS.survivor;
    return resolveFromCandidates(candidates);
  }

  return null;
}

export function getTypeBadgeSize(cardWidth: number): number {
  return Math.max(14, Math.round(Math.max(80, cardWidth) * 0.14));
}

/** Top-right footer row — same slot as the old `Lv.` text. */
export function getTypeBadgePosition(
  portraitSize: number,
  cardWidth: number,
  badgeSize: number,
): { x: number; y: number } {
  const width = Math.max(80, cardWidth);
  const fontSize = getFooterFontSize(width);
  const y = portraitSize + Math.round(fontSize * 0.2);
  const x = width - badgeSize - 7;
  return { x, y };
}
