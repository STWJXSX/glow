import {
  resolveFounderEdition,
  resolveFounderEditionFromQuests,
} from '#managers/images/stw/resources/resourcesParser.ts';
import { computeLobbyPowerFromCampaignProfile } from './stwProfilePower.ts';

const MSK_WEAPON_FAMILIES = [
  'blunt_hammer_stormking',
  'edged_sword_stormking',
  'assault_stormking',
  'explosive_stormking',
  'pistol_stormking',
] as const;

export type MskWeaponFamily = typeof MSK_WEAPON_FAMILIES[number];

export const STW_PRIVATE_PROFILE_ERROR_CODES = new Set([
  'errors.com.epicgames.modules.gamesubcatalog.purchase_not_allowed',
  'errors.com.epicgames.common.missing_permission',
  'errors.com.epicgames.fortnite.operation_forbidden',
]);

export function isStwPrivateProfileError(errorCode: string | undefined | null, errorMessage?: string | null): boolean {
  if (errorCode && STW_PRIVATE_PROFILE_ERROR_CODES.has(errorCode)) return true;
  const msg = String(errorMessage ?? '');
  return msg.includes('Operation QueryPublicProfile is not allowed');
}

export interface StwResearchStats {
  fortitude: number | null;
  offense: number | null;
  resistance: number | null;
  technology: number | null;
}

export interface StwMskWeapons {
  blunt_hammer_stormking: boolean;
  edged_sword_stormking: boolean;
  assault_stormking: boolean;
  explosive_stormking: boolean;
  pistol_stormking: boolean;
}

export interface StwProfileData {
  commanderLevel: number | null;
  pastCommanderLevel: number | null;
  matchesPlayed: number | null;
  powerLevel: number | null;
  loginDays: number | null;
  researchPointsSpent: number | null;
  collectionBookLevel: number | null;
  collectionBookSpent: number | null;
  profileRevision: number | null;
  profileCreated: string | null;
  mskCompletions: number | null;
  mskWeapons: StwMskWeapons;
  research: StwResearchStats;
  founderEdition: string | null;
  isFounder: boolean;
}

type ProfileItem = {
  templateId?: string;
  quantity?: number;
  attributes?: Record<string, unknown>;
};

function num(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim() !== '' && Number.isFinite(Number(value))) {
    return Number(value);
  }
  return null;
}

function profileAttrs(profile: Record<string, unknown>): Record<string, unknown> {
  const stats = profile.stats as { attributes?: Record<string, unknown> } | undefined;
  return stats?.attributes ?? {};
}

function profileItems(profile: Record<string, unknown>): Record<string, ProfileItem> {
  const items = profile.items;
  return items && typeof items === 'object' ? items as Record<string, ProfileItem> : {};
}

function parseResearchLevels(attrs: Record<string, unknown>): StwResearchStats {
  const research = attrs.research_levels;
  const levels = research && typeof research === 'object'
    ? research as Record<string, unknown>
    : {};
  return {
    fortitude: num(levels.fortitude),
    offense: num(levels.offense),
    resistance: num(levels.resistance),
    technology: num(levels.technology),
  };
}

function parseCollectionBook(attrs: Record<string, unknown>): {
  level: number | null;
  spent: number | null;
} {
  const book = attrs.collection_book;
  if (!book || typeof book !== 'object') {
    return { level: null, spent: null };
  }

  const data = book as Record<string, unknown>;
  return {
    level: num(data.maxBookXpLevelAchieved),
    spent: num(data.unslotCost) ?? num(data.totalUnslotCost) ?? num(data.bookPurchasedXp),
  };
}

function parseLoginDays(attrs: Record<string, unknown>): number | null {
  const rewards = attrs.daily_rewards;
  if (!rewards || typeof rewards !== 'object') return null;
  return num((rewards as Record<string, unknown>).totalDaysLoggedIn);
}

function parseMskWeapons(items: Record<string, ProfileItem>): StwMskWeapons {
  const owned = new Set<MskWeaponFamily>();
  for (const item of Object.values(items)) {
    const templateId = item.templateId;
    if (!templateId?.startsWith('Schematic:')) continue;
    for (const family of MSK_WEAPON_FAMILIES) {
      if (templateId.includes(family)) owned.add(family);
    }
  }

  return {
    blunt_hammer_stormking: owned.has('blunt_hammer_stormking'),
    edged_sword_stormking: owned.has('edged_sword_stormking'),
    assault_stormking: owned.has('assault_stormking'),
    explosive_stormking: owned.has('explosive_stormking'),
    pistol_stormking: owned.has('pistol_stormking'),
  };
}

function parseMskCompletions(items: Record<string, ProfileItem>): number | null {
  for (const item of Object.values(items)) {
    if (item.templateId === 'AccountResource:stwaccolade_mission_sk_victory') {
      return num(item.quantity) ?? 0;
    }
  }
  return 0;
}

export async function buildStwProfileData(input: {
  campaignProfile: Record<string, unknown>;
  accountId: string;
  accessToken: string;
  isSelf: boolean;
}): Promise<StwProfileData> {
  const attrs = profileAttrs(input.campaignProfile);
  const items = profileItems(input.campaignProfile);
  const powerLevel = computeLobbyPowerFromCampaignProfile(input.campaignProfile);
  const collectionBook = parseCollectionBook(attrs);

  const founderEdition = input.isSelf
    ? await resolveFounderEdition(items, input.accountId, input.accessToken)
    : resolveFounderEditionFromQuests(items);

  const isFounder = Boolean(
    founderEdition && !founderEdition.toLowerCase().includes('no founder'),
  );

  const commanderLevel = num(attrs.level) ?? num(attrs.commander_level);
  const pastCommanderLevel = commanderLevel != null && commanderLevel < 263
    ? 0
    : num(attrs.rewards_claimed_post_max_level);

  const created = input.campaignProfile.created;
  const revision = input.campaignProfile.rvn;

  return {
    commanderLevel,
    pastCommanderLevel,
    matchesPlayed: num(attrs.matches_played),
    powerLevel,
    loginDays: parseLoginDays(attrs),
    researchPointsSpent: num(attrs.legacy_research_points_spent),
    collectionBookLevel: collectionBook.level,
    collectionBookSpent: collectionBook.spent,
    profileRevision: num(revision),
    profileCreated: typeof created === 'string' && created.length > 0 ? created : null,
    mskCompletions: parseMskCompletions(items),
    mskWeapons: parseMskWeapons(items),
    research: parseResearchLevels(attrs),
    founderEdition,
    isFounder,
  };
}
