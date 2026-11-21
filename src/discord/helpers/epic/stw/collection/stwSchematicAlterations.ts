import { readFileSync, existsSync } from 'fs';
import path from 'path';
import type { SchematicCategory } from './stwCampaignSchematics.ts';
import { resolveStwCatalogRoot } from '#helpers/core/glowAssetPaths.ts';

/** Custom Discord emoji IDs for perk tier display. */
export const PERK_TIER_EMOJI: Record<string, string> = {
  common: '<:p_Common:1542942458030203000>',
  uncommon: '<:p_Uncommon:1542942493442572418>',
  rare: '<:p_Rare:1542942524421840977>',
  epic: '<:p_Epic:1542942547821731910>',
  legendary: '<:p_Legendary:1542942568130674708>',
};

export const EVOLUTION_EMOJI = {
  rayosol: '<:rayosol:1364575464793837640>',
  radiantita: '<:radiantita:1364575466228285500>',
} as const;

/** Element perk emojis (replace tier bar for elemental perks). */
export const ELEMENT_EMOJI = {
  physical: '<:fisico:1543016596614946897>',
  nature: '<:naturaleza:1543016582261776404>',
  water: '<:agua:1543016612578459720>',
  energy: '<:energia:1543016541589606430>',
  fire: '<:fuego:1543016564226261083>',
} as const;

export type ElementPerkKey = keyof typeof ELEMENT_EMOJI;

const TIER_SUFFIX_TO_RARITY: Record<string, string> = {
  t01: 'common',
  t02: 'uncommon',
  t03: 'rare',
  t04: 'epic',
  t05: 'legendary',
};

const TIER_FROM_ID_RE = /_t0?([1-5])$/i;

export interface SchematicPerkSlot {
  slot: number;
  alterationId: string | null;
  displayName: string;
  lineEmoji: string;
  tierKey: string;
  canUpgrade: boolean;
  isGameplay: boolean;
  isElement: boolean;
}

function tierSuffixToRarityKey(id: string): string | null {
  const tierMatch = id.match(TIER_FROM_ID_RE);
  if (!tierMatch) return null;
  return TIER_SUFFIX_TO_RARITY[`t0${tierMatch[1]}`] ?? null;
}

function usesTierSuffixForBarColor(alterationId: string): boolean {
  const id = alterationId.toLowerCase();
  return id.includes('aid_att_') || id.includes('aid_conditional_') || id.includes('aid_ele_');
}

function normalizeBaseRarityKey(value: string | undefined): string | null {
  if (!value) return null;
  const key = value.trim().toLowerCase();
  return PERK_TIER_EMOJI[key] ? key : null;
}

export function resolveAlterationSlotRarity(
  alterationId: string,
  slotIndex: number,
  baseRarities?: string[] | null,
): string {
  const fromAlterationTier = tierSuffixToRarityKey(alterationId);
  if (fromAlterationTier && usesTierSuffixForBarColor(alterationId)) {
    return fromAlterationTier;
  }

  const fromBase = normalizeBaseRarityKey(baseRarities?.[slotIndex]);
  if (fromBase) return fromBase;

  if (fromAlterationTier) return fromAlterationTier;

  return 'common';
}

export function extractAlterationIds(attributes: Record<string, unknown> | undefined): string[] {
  if (!attributes) return [];
  const theater = attributes.alterationDefinitions;
  const campaign = attributes.alterations;
  const raw = Array.isArray(theater) ? theater : Array.isArray(campaign) ? campaign : [];
  return raw.filter((id): id is string => typeof id === 'string' && id.trim().length > 0);
}

export function extractAlterationBaseRarities(
  attributes: Record<string, unknown> | undefined,
): string[] | null {
  if (!attributes) return null;
  const raw = attributes.alteration_base_rarities;
  if (!Array.isArray(raw)) return null;
  const list = raw.filter((r): r is string => typeof r === 'string');
  return list.length > 0 ? list : null;
}

export function parseSchematicPerks(
  alterationIds: string[],
  baseRarities: string[] | null,
): SchematicPerkSlot[] {
  const slots: SchematicPerkSlot[] = [];
  for (let slot = 0; slot < 6; slot++) {
    const alterationId = alterationIds[slot] ?? null;
    const tierKey = alterationId
      ? resolveAlterationSlotRarity(alterationId, slot, baseRarities)
      : 'common';
    const isGameplay = alterationId?.toLowerCase().includes('aid_g_') ?? false;
    const isElement = alterationId ? resolveElementPerkKey(alterationId) != null : false;
    slots.push({
      slot,
      alterationId,
      displayName: alterationId ? resolvePerkDisplayLabel(alterationId) : '',
      lineEmoji: alterationId ? resolvePerkLineEmoji(alterationId, tierKey) : perkTierEmoji('common'),
      tierKey,
      canUpgrade: tierKey !== 'legendary' && !!alterationId,
      isGameplay,
      isElement,
    });
  }
  return slots;
}

export function perkTierEmoji(tierKey: string): string {
  return PERK_TIER_EMOJI[tierKey] ?? PERK_TIER_EMOJI.common;
}

function normalizeAlterationLookupId(alterationTemplateId: string): string {
  const raw = alterationTemplateId.includes(':')
    ? alterationTemplateId.split(':').slice(1).join(':')
    : alterationTemplateId;
  return raw.trim().toLowerCase();
}

export function resolveElementPerkKey(alterationId: string): ElementPerkKey | null {
  const id = alterationId.toLowerCase();
  if (/aid_ele_water|ele_water/.test(id)) return 'water';
  if (/aid_ele_fire|ele_fire/.test(id)) return 'fire';
  if (/aid_ele_energy|ele_energy/.test(id)) return 'energy';
  if (/aid_ele_nature|ele_nature/.test(id)) return 'nature';
  if (/damage_physical|ele_physical/.test(id)) return 'physical';
  return null;
}

export function resolvePerkLineEmoji(alterationId: string, tierKey: string): string {
  const id = alterationId.toLowerCase();
  if (id.includes('aid_g_')) return perkTierEmoji('common');

  const tierEm = perkTierEmoji(tierKey);
  const element = resolveElementPerkKey(alterationId);
  if (element) return `${tierEm} ${ELEMENT_EMOJI[element]}`;
  return tierEm;
}

export function resolvePerkDisplayLabel(alterationId: string): string {
  const catalog = loadPerksCatalog();
  const lookup = normalizeAlterationLookupId(alterationId);
  const direct = catalog.get(lookup);
  if (direct?.description?.trim()) return direct.description.trim();
  if (direct?.name?.trim()) return direct.name.trim();

  const withoutTier = lookup.replace(/_t0?([1-5])$/i, '');
  for (const [key, perk] of catalog.entries()) {
    if (key.replace(/_t0?([1-5])$/i, '') !== withoutTier) continue;
    if (perk.description?.trim()) return perk.description.trim();
    if (perk.name?.trim()) return perk.name.trim();
  }

  return lookup
    .replace(/^aid_/i, '')
    .replace(/_t0?([1-5])$/i, '')
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

/** @deprecated Use resolvePerkDisplayLabel — kept for callers expecting English perk text. */
export function resolvePerkEnglishName(alterationId: string): string {
  return resolvePerkDisplayLabel(alterationId);
}

let perksByLowerId: Map<string, { id: string; name: string; description?: string }> | null = null;

function resolvePerksCatalogPath(): string | null {
  const file = path.join(resolveStwCatalogRoot(), 'perks', 'perks.json');
  return existsSync(file) ? file : null;
}

function loadPerksCatalog(): Map<string, { id: string; name: string; description?: string }> {
  if (perksByLowerId) return perksByLowerId;

  const filePath = resolvePerksCatalogPath();
  const map = new Map<string, { id: string; name: string; description?: string }>();

  if (filePath && existsSync(filePath)) {
    const raw = readFileSync(filePath, 'utf8').replace(/^\uFEFF/, '');
    const parsed = JSON.parse(raw) as {
      perks?: Record<string, { id: string; name: string; description?: string }>;
    };
    for (const perk of Object.values(parsed.perks ?? {})) {
      if (!perk?.id) continue;
      map.set(perk.id.toLowerCase(), perk);
    }
  }

  perksByLowerId = map;
  return map;
}

function schematicKind(templateId: string, category: SchematicCategory): 'melee' | 'ranged' | 'trap' | 'other' {
  const t = templateId.toLowerCase();
  if (category === 'trap') return 'trap';
  if (t.includes('melee') || t.includes('sword') || t.includes('axe') || t.includes('scythe') || t.includes('club')) {
    return 'melee';
  }
  if (category === 'weapon') return 'ranged';
  return 'other';
}

/** Heuristic perk pool for respec select — filtered from perks.json by schematic kind. */
export function listRespecPerkOptions(
  templateId: string,
  category: SchematicCategory,
  slot: number,
): { label: string; value: string }[] {
  const catalog = loadPerksCatalog();
  const kind = schematicKind(templateId, category);
  const isLegendarySlot = slot === 5;
  const options: { label: string; value: string }[] = [];

  for (const perk of catalog.values()) {
    const id = perk.id.toLowerCase();
    const alterationId = `Alteration:${id}`;

    if (isLegendarySlot) {
      if (!id.startsWith('aid_g_')) continue;
    } else if (kind === 'trap') {
      if (!id.includes('trap') && !id.includes('building')) continue;
      if (id.startsWith('aid_g_')) continue;
    } else if (kind === 'melee') {
      if (id.includes('trap') || id.includes('ranged') || id.includes('def_')) continue;
      if (id.startsWith('aid_g_') && !id.includes('melee')) continue;
    } else if (kind === 'ranged') {
      if (id.includes('trap') || id.includes('melee') || id.includes('def_')) continue;
      if (id.startsWith('aid_g_') && !id.includes('ranged') && !id.includes('weapon')) continue;
    } else {
      if (id.startsWith('aid_g_')) continue;
    }

    const label = resolvePerkDisplayLabel(alterationId);
    if (label.length > 100) continue;
    options.push({ label: label.slice(0, 100), value: alterationId });
    if (options.length >= 24) break;
  }

  return options.sort((a, b) => a.label.localeCompare(b.label));
}
