import { composeMCP } from '#helpers/epic/utils/mcp.ts';
import { resolveStwRarity, type StwRarity } from '../shop/stwShopCatalog.ts';

export type DefenderWeaponType = 'sniper' | 'assault' | 'shotgun' | 'pistol' | 'melee' | 'unknown';

export interface CampaignDefenderItem {
  itemId: string;
  templateId: string;
  level: number;
  quantity: number;
  rarity: StwRarity;
  weaponType: DefenderWeaponType;
}

const TYPE_ORDER: DefenderWeaponType[] = ['sniper', 'assault', 'shotgun', 'pistol', 'melee'];

const RARITY_ORDER: Record<StwRarity, number> = {
  ur: 0,
  er: 1,
  sr: 2,
  vr: 3,
  r: 4,
  uc: 5,
  c: 6,
};

export function parseDefenderWeaponType(templateId: string): DefenderWeaponType {
  const raw = templateId.split(':')[1]?.toLowerCase() ?? '';
  if (raw.includes('sniper')) return 'sniper';
  if (raw.includes('assault')) return 'assault';
  if (raw.includes('shotgun')) return 'shotgun';
  if (raw.includes('pistol')) return 'pistol';
  if (raw.includes('melee')) return 'melee';
  return 'unknown';
}

function sortByRarityThenLevel(a: CampaignDefenderItem, b: CampaignDefenderItem): number {
  const rarityDiff = RARITY_ORDER[a.rarity] - RARITY_ORDER[b.rarity];
  if (rarityDiff !== 0) return rarityDiff;
  if (b.level !== a.level) return b.level - a.level;
  return a.templateId.localeCompare(b.templateId);
}

export function sortCampaignDefendersByRarity(defenders: CampaignDefenderItem[]): CampaignDefenderItem[] {
  return [...defenders].sort(sortByRarityThenLevel);
}

export function sortCampaignDefenders(defenders: CampaignDefenderItem[]): CampaignDefenderItem[] {
  return [...defenders].sort((a, b) => {
    const typeA = TYPE_ORDER.indexOf(a.weaponType);
    const typeB = TYPE_ORDER.indexOf(b.weaponType);
    const typeDiff = (typeA === -1 ? 99 : typeA) - (typeB === -1 ? 99 : typeB);
    if (typeDiff !== 0) return typeDiff;
    return sortByRarityThenLevel(a, b);
  });
}

export function groupDefendersByWeaponType(
  defenders: CampaignDefenderItem[],
): { weaponType: DefenderWeaponType; defenders: CampaignDefenderItem[] }[] {
  const groups = new Map<DefenderWeaponType, CampaignDefenderItem[]>();

  for (const defender of defenders) {
    const list = groups.get(defender.weaponType) ?? [];
    list.push(defender);
    groups.set(defender.weaponType, list);
  }

  const ordered: { weaponType: DefenderWeaponType; defenders: CampaignDefenderItem[] }[] = [];
  for (const weaponType of TYPE_ORDER) {
    const list = groups.get(weaponType);
    if (list?.length) ordered.push({ weaponType, defenders: list });
  }

  for (const [weaponType, list] of groups) {
    if (!TYPE_ORDER.includes(weaponType)) {
      ordered.push({ weaponType, defenders: list });
    }
  }

  return ordered;
}

export async function fetchCampaignDefenders(
  accountId: string,
  accessToken: string,
  profileBody?: unknown,
): Promise<CampaignDefenderItem[]> {
  const data = profileBody ?? (await composeMCP({
    profile: 'campaign',
    operation: 'QueryProfile',
    accountId,
    accessToken,
    body: {},
  })).data;

  const items: Record<string, any> = (data as { profileChanges?: Array<{ profile?: { items?: Record<string, unknown> } }> })
    ?.profileChanges?.[0]?.profile?.items ?? {};
  const defenders: CampaignDefenderItem[] = [];

  for (const [itemId, item] of Object.entries(items)) {
    const templateId = String(item?.templateId ?? '');
    if (!templateId.toLowerCase().startsWith('defender:')) continue;

    defenders.push({
      itemId,
      templateId,
      level: Number(item?.attributes?.level ?? 1),
      quantity: Number(item?.quantity ?? 1),
      rarity: resolveStwRarity(templateId, item?.attributes?.starting_rarity),
      weaponType: parseDefenderWeaponType(templateId),
    });
  }

  return sortCampaignDefenders(defenders);
}
