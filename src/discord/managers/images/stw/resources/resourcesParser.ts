import axios from 'axios';

import { Endpoints } from '#helpers/core/endpoints.ts';
import { getStwPowerLevel } from '#helpers/epic/stw/gameplay/stwPowerLevel.ts';
import { resolveSchematicRarityFromCatalog } from '#helpers/epic/stw/inventory/stwTheaterInventoryAssets.ts';

import {
  ENDURANCE_QUEST_BY_THEATER,
  FOUNDER_ENTITLEMENT_HINTS,
  FOUNDER_QUEST_TIERS,
  LONG_CHALLENGES,
  STORM_SHIELD_ZONES,
  STW_SUPERCHARGED_MIN_POWER,
} from './resourcesConstants.ts';
import { resolveAccountResourceMeta, resolveZoneDifficultyIcon } from './resourcesAssetResolver.ts';
import { isDisplayableStwAccountResource } from './resourcesFilter.ts';
import type {
  ParseStwResourcesInput,
  StwLongChallenge,
  StwResourceTile,
  StwResourcesPanelData,
  StwSchematicBuckets,
  StwStormShieldZone,
} from './types.ts';

const ACCOUNT_RESOURCE_PREFIX = 'AccountResource:';

const EXCLUDED_SUBSTRINGS = ['Hero:', 'Worker:', 'Weapon:', 'Trap:', 'Defender:'];

/** Skip one-off trackers / quest tokens with qty 1 that clutter the grid. */
const SKIP_SUFFIXES = new Set([
  'stw_accolade_tracker',
  'zcp_stwaccolade_endurance_w20',
  'zcp_endurance_t04',
  'quests_stwstarterbundle01',
  'quests_stwstarterbundle09',
]);

type ProfileItem = {
  templateId?: string;
  quantity?: number;
  attributes?: Record<string, unknown>;
};

function profileItems(profile: Record<string, unknown>): Record<string, ProfileItem> {
  const items = profile.items;
  return items && typeof items === 'object' ? items as Record<string, ProfileItem> : {};
}

function profileAttrs(profile: Record<string, unknown>): Record<string, unknown> {
  const stats = profile.stats as { attributes?: Record<string, unknown> } | undefined;
  return stats?.attributes ?? {};
}

function isAccountResourceItem(templateId: string): boolean {
  if (!templateId.startsWith(ACCOUNT_RESOURCE_PREFIX)) return false;
  if (EXCLUDED_SUBSTRINGS.some((chunk) => templateId.includes(chunk))) return false;
  if (!isDisplayableStwAccountResource(templateId)) return false;
  const suffix = (templateId.split(':').pop() ?? '').toLowerCase();
  if (SKIP_SUFFIXES.has(suffix)) return false;
  return true;
}

function maxStormShieldDefense(items: Record<string, ProfileItem>, theater: number): number {
  let max = 0;
  const re = new RegExp(`^completion_complete_outpost_${theater}_(\\d+)$`);
  for (const item of Object.values(items)) {
    const attrs = item.attributes ?? {};
    for (const [key, value] of Object.entries(attrs)) {
      const match = key.match(re);
      if (match && typeof value === 'number' && value >= 1) {
        max = Math.max(max, Number(match[1]));
      }
    }
  }
  return max;
}

function isEnduranceComplete(items: Record<string, ProfileItem>, theater: number): boolean {
  const questId = ENDURANCE_QUEST_BY_THEATER[theater];
  if (!questId) return false;
  for (const item of Object.values(items)) {
    if (item.templateId !== questId) continue;
    return item.attributes?.quest_state === 'Claimed';
  }
  return false;
}

export function parseChallenges(items: Record<string, ProfileItem>): StwLongChallenge[] {
  return LONG_CHALLENGES.map((def) => {
    const quest = Object.values(items).find((i) => i.templateId === `Quest:achievement_${def.id}`);
    const attrs = quest?.attributes ?? {};
    const progressKey = Object.keys(attrs).find(
      (k) => k.startsWith('completion_') && k !== 'completion_custom',
    );
    const current = progressKey && typeof attrs[progressKey] === 'number'
      ? attrs[progressKey] as number
      : 0;
    const complete = attrs.quest_state === 'Claimed' || current >= def.target;
    return {
      id: def.id,
      label: def.label,
      current: complete ? def.target : current,
      target: def.target,
      complete,
    };
  });
}

function tierToStars(tier: unknown): number {
  const t = String(tier ?? '').toLowerCase();
  if (t.includes('crystal') || t === 'cp') return 5;
  if (t === 'v' || t === '5') return 5;
  if (t === 'iv' || t === '4') return 4;
  if (t === 'iii' || t === '3') return 3;
  if (t === 'ii' || t === '2') return 2;
  if (t === 'i' || t === '1') return 1;
  return 0;
}

export function parseSchematicBuckets(items: Record<string, ProfileItem>): StwSchematicBuckets {
  const buckets: StwSchematicBuckets = {
    pl144: 0,
    pl130: 0,
    pl106: 0,
    pl77: 0,
    pl51: 0,
    pl26: 0,
    legacy: 0,
    supercharged: 0,
    stars5: 0,
    stars4: 0,
    stars3: 0,
    stars2: 0,
    stars1: 0,
  };

  for (const item of Object.values(items)) {
    const templateId = item.templateId ?? '';
    if (!templateId.startsWith('Schematic:') && !templateId.startsWith('Weapon:') && !templateId.startsWith('Trap:')) {
      continue;
    }
    const attrs = item.attributes ?? {};
    const isLegacy = Boolean(
      attrs.legacy === true ||
      (Array.isArray(attrs.legacy_alterations) && attrs.legacy_alterations.length > 0) ||
      attrs.legacy_alterations != null ||
      (Array.isArray(attrs.alterations) && attrs.alterations.length > 0 && !attrs.alteration_base_rarities) ||
      templateId.toLowerCase().includes('legacy')
    );
    if (isLegacy) buckets.legacy++;
    const gameLevel = typeof attrs.level === 'number' ? attrs.level : 0;
    const rarity = resolveSchematicRarityFromCatalog(templateId) ?? 'r';
    const power = getStwPowerLevel(rarity, gameLevel);

    if (power >= 144) buckets.pl144++;
    else if (power >= 130) buckets.pl130++;
    else if (power >= 106) buckets.pl106++;
    else if (power >= 77) buckets.pl77++;
    else if (power >= 51) buckets.pl51++;
    else buckets.pl26++;

    const stars = tierToStars(attrs.tier ?? attrs.starting_tier);
    if (power > STW_SUPERCHARGED_MIN_POWER) buckets.supercharged++;
    if (stars === 5) buckets.stars5++;
    else if (stars === 4) buckets.stars4++;
    else if (stars === 3) buckets.stars3++;
    else if (stars === 2) buckets.stars2++;
    else if (stars === 1) buckets.stars1++;
  }

  return buckets;
}

export function parseAccountResourceTiles(campaignItems: Record<string, ProfileItem>): StwResourceTile[] {
  const byTemplate = new Map<string, StwResourceTile>();

  for (const item of Object.values(campaignItems)) {
    const templateId = item.templateId ?? '';
    const quantity = item.quantity ?? 0;
    if (!isAccountResourceItem(templateId) || quantity <= 0) continue;

    const meta = resolveAccountResourceMeta(templateId);
    const existing = byTemplate.get(templateId.toLowerCase());
    if (existing) {
      existing.quantity += quantity;
      continue;
    }

    byTemplate.set(templateId.toLowerCase(), {
      templateId,
      catalogId: meta.catalogId,
      label: meta.label,
      quantity,
      iconPath: meta.iconPath,
      iconUrl: meta.iconUrl,
    });
  }

  return [...byTemplate.values()].sort((a, b) => b.quantity - a.quantity);
}

export function resolveFounderEditionFromQuests(items: Record<string, ProfileItem>): string | null {
  for (const tier of FOUNDER_QUEST_TIERS) {
    const quest = Object.values(items).find((i) => i.templateId === tier.quest);
    if (quest?.attributes?.quest_state === 'Claimed') return tier.label;
  }
  return null;
}

export async function resolveFounderEdition(
  items: Record<string, ProfileItem>,
  accountId?: string,
  accessToken?: string,
): Promise<string> {
  const fromQuests = resolveFounderEditionFromQuests(items);
  if (fromQuests) return fromQuests;

  if (!accountId || !accessToken) return 'No Founder Pack';

  try {
    const { data } = await axios.get(
      `${Endpoints.ENTITLEMENTS}/${accountId}/entitlements`,
      {
        headers: { Authorization: `Bearer ${accessToken}` },
        timeout: 12_000,
        validateStatus: (s) => s < 500,
      },
    );

    const rows = Array.isArray(data) ? data : data?.entitlements ?? [];
    const names = rows.map((row: { entitlementName?: string; catalogItemId?: string }) =>
      `${row.entitlementName ?? ''} ${row.catalogItemId ?? ''}`.trim(),
    );

    for (const hint of FOUNDER_ENTITLEMENT_HINTS) {
      if (names.some((name: string) => hint.match.test(name))) return hint.label;
    }
  } catch {
    // fallback
  }

  return 'No Founder Pack';
}

export function parseHomebaseLevel(campaignProfile: Record<string, unknown>): number {
  const attrs = profileAttrs(campaignProfile);
  return Number(attrs.zone_power ?? attrs.commander_level ?? attrs.level ?? 0);
}

export function parseStormShieldZones(
  campaignProfile: Record<string, unknown>,
  labelOverrides?: Partial<Record<StwStormShieldZone['key'], string>>,
): StwStormShieldZone[] {
  const campaignItems = profileItems(campaignProfile);
  return STORM_SHIELD_ZONES.map((zone) => ({
    theater: zone.theater,
    key: zone.key,
    label: labelOverrides?.[zone.key] ?? zone.label,
    completed: maxStormShieldDefense(campaignItems, zone.theater),
    max: zone.max,
    enduranceComplete: isEnduranceComplete(campaignItems, zone.theater),
  }));
}

export async function parseStwResourcesPanel(
  input: ParseStwResourcesInput,
): Promise<StwResourcesPanelData> {
  const campaignItems = profileItems(input.campaignProfile);
  const attrs = profileAttrs(input.campaignProfile);

  const homebaseLevel = parseHomebaseLevel(input.campaignProfile);
  const stormShields = parseStormShieldZones(input.campaignProfile);

  return {
    displayName: undefined,
    homebaseLevel,
    collectionBookLevel: Number(
      (attrs.collection_book as { maxBookXpLevelAchieved?: number } | undefined)?.maxBookXpLevelAchieved ?? 0,
    ),
    founderEdition: await resolveFounderEdition(
      campaignItems,
      input.accountId,
      input.accessToken,
    ),
    stormShields,
    challenges: parseChallenges(campaignItems),
    resources: parseAccountResourceTiles(campaignItems),
    schematics: parseSchematicBuckets(campaignItems),
  };
}

export { resolveZoneDifficultyIcon };
