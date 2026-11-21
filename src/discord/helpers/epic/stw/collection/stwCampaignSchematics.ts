import { composeMCP } from '#helpers/epic/utils/mcp.ts';
import { resolveStwRarity, type StwRarity } from '../shop/stwShopCatalog.ts';
import { resolveSchematicFilterType, type SchematicFilterType } from '../inventory/stwSchematicFilters.ts';
import {
  extractAlterationBaseRarities,
  extractAlterationIds,
} from './stwSchematicAlterations.ts';

export type SchematicCategory = 'weapon' | 'trap' | 'other';

export interface CampaignSchematicItem {
  itemId: string;
  templateId: string;
  level: number;
  quantity: number;
  rarity: StwRarity;
  category: SchematicCategory;
  filterType: SchematicFilterType;
  alterationDefinitions: string[];
  alterationBaseRarities: string[] | null;
  favorite?: boolean;
}

const RARITY_ORDER: Record<StwRarity, number> = {
  ur: 0,
  er: 1,
  sr: 2,
  vr: 3,
  r: 4,
  uc: 5,
  c: 6,
};

const TRAP_HINTS = [
  'trap', 'wall_', 'floor_', 'ceiling_', 'launch', 'campfire', 'healing', 'teleporter', 'placeable',
];

const WEAPON_HINTS = [
  'pistol', 'shotgun', 'rifle', 'sniper', 'smg', 'lmg', 'assault', 'minigun', 'launcher',
  'bow', 'crossbow', 'explosive', 'melee', 'sword', 'axe', 'scythe', 'hammer', 'club',
  'spear', 'edged', 'blunt', 'knife', 'bat', 'wrench', 'deathray', 'typewriter',
  'plasmagun', 'raygun', 'flintlock', 'gravedigger', 'neon', 'nocturno',
  'endgame', 'vacuum', 'obliterator', 'rocket', 'grenade',
];

export function parseSchematicCategory(templateId: string): SchematicCategory {
  const t = templateId.toLowerCase();
  if (TRAP_HINTS.some((hint) => t.includes(hint))) return 'trap';
  if (WEAPON_HINTS.some((hint) => t.includes(hint))) return 'weapon';
  return 'other';
}

/** Weapon/trap schematics only — excludes ammo/ingredient recipes (no card icons in catalog). */
export function isCollectibleSchematicTemplateId(templateId: string): boolean {
  const suffix = templateId.split(':')[1]?.toLowerCase() ?? '';
  return suffix.startsWith('sid_');
}

function sortByRarityThenLevel(a: CampaignSchematicItem, b: CampaignSchematicItem): number {
  const rarityDiff = RARITY_ORDER[a.rarity] - RARITY_ORDER[b.rarity];
  if (rarityDiff !== 0) return rarityDiff;
  if (b.level !== a.level) return b.level - a.level;
  return a.templateId.localeCompare(b.templateId);
}

export function sortCampaignSchematics(schematics: CampaignSchematicItem[]): CampaignSchematicItem[] {
  return [...schematics].sort(sortByRarityThenLevel);
}

export async function fetchCampaignSchematics(
  accountId: string,
  accessToken: string,
  profileBody?: unknown,
): Promise<CampaignSchematicItem[]> {
  const data = profileBody ?? (await composeMCP({
    profile: 'campaign',
    operation: 'QueryProfile',
    accountId,
    accessToken,
    body: {},
  })).data;

  const items: Record<string, any> = (data as { profileChanges?: Array<{ profile?: { items?: Record<string, unknown> } }> })
    ?.profileChanges?.[0]?.profile?.items ?? {};
  const schematics: CampaignSchematicItem[] = [];

  for (const [itemId, item] of Object.entries(items)) {
    const templateId = String(item?.templateId ?? '');
    if (!templateId.toLowerCase().startsWith('schematic:')) continue;
    if (!isCollectibleSchematicTemplateId(templateId)) continue;

    const attributes = (item?.attributes ?? {}) as Record<string, unknown>;

    schematics.push({
      itemId,
      templateId,
      level: Number(attributes.level ?? 1),
      quantity: Number(item?.quantity ?? 1),
      rarity: resolveStwRarity(templateId, attributes.starting_rarity as string | undefined),
      category: parseSchematicCategory(templateId),
      filterType: resolveSchematicFilterType(templateId),
      alterationDefinitions: extractAlterationIds(attributes),
      alterationBaseRarities: extractAlterationBaseRarities(attributes),
      favorite: attributes.favorite === true,
    });
  }

  return sortCampaignSchematics(schematics);
}

export function findCampaignSchematic(
  schematics: CampaignSchematicItem[],
  itemId: string,
): CampaignSchematicItem | undefined {
  return schematics.find((s) => s.itemId === itemId);
}

export function parseCampaignSchematicFromProfileItem(
  itemId: string,
  item: Record<string, unknown>,
): CampaignSchematicItem | null {
  const templateId = String(item?.templateId ?? '');
  if (!templateId.toLowerCase().startsWith('schematic:')) return null;
  if (!isCollectibleSchematicTemplateId(templateId)) return null;

  const attributes = (item?.attributes ?? {}) as Record<string, unknown>;

  return {
    itemId,
    templateId,
    level: Number(attributes.level ?? 1),
    quantity: Number(item?.quantity ?? 1),
    rarity: resolveStwRarity(templateId, attributes.starting_rarity as string | undefined),
    category: parseSchematicCategory(templateId),
    filterType: resolveSchematicFilterType(templateId),
    alterationDefinitions: extractAlterationIds(attributes),
    alterationBaseRarities: extractAlterationBaseRarities(attributes),
    favorite: attributes.favorite === true,
  };
}
