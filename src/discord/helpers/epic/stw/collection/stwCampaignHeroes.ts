import { composeMCP } from '#helpers/epic/utils/mcp.ts';
import { resolveStwRarity, type StwRarity } from '../shop/stwShopCatalog.ts';

export interface CampaignHeroItem {
  itemId: string;
  templateId: string;
  level: number;
  quantity: number;
  classType: string;
  rarity: StwRarity;
}

const CLASS_ORDER = ['commando', 'ninja', 'constructor', 'outlander'] as const;

const RARITY_ORDER: Record<StwRarity, number> = {
  ur: 0,
  er: 1,
  sr: 2,
  vr: 3,
  r: 4,
  uc: 5,
  c: 6,
};

function parseHeroClass(templateId: string): string {
  const match = templateId.toLowerCase().match(/^hero:hid_([a-z]+)_/);
  return match?.[1] ?? 'unknown';
}

function sortByRarityThenLevel(a: CampaignHeroItem, b: CampaignHeroItem): number {
  const rarityDiff = RARITY_ORDER[a.rarity] - RARITY_ORDER[b.rarity];
  if (rarityDiff !== 0) return rarityDiff;
  if (b.level !== a.level) return b.level - a.level;
  return a.templateId.localeCompare(b.templateId);
}

/** Bulk grid: rarity → level (no class grouping). */
export function sortCampaignHeroesByRarity(heroes: CampaignHeroItem[]): CampaignHeroItem[] {
  return [...heroes].sort(sortByRarityThenLevel);
}

export function sortCampaignHeroes(heroes: CampaignHeroItem[]): CampaignHeroItem[] {
  return [...heroes].sort((a, b) => {
    const classA = CLASS_ORDER.indexOf(a.classType as (typeof CLASS_ORDER)[number]);
    const classB = CLASS_ORDER.indexOf(b.classType as (typeof CLASS_ORDER)[number]);
    const classDiff = (classA === -1 ? 99 : classA) - (classB === -1 ? 99 : classB);
    if (classDiff !== 0) return classDiff;
    return sortByRarityThenLevel(a, b);
  });
}

export async function fetchCampaignHeroes(
  accountId: string,
  accessToken: string,
  profileBody?: unknown,
): Promise<CampaignHeroItem[]> {
  const data = profileBody ?? (await composeMCP({
    profile: 'campaign',
    operation: 'QueryProfile',
    accountId,
    accessToken,
    body: {},
  })).data;

  const items: Record<string, any> = (data as { profileChanges?: Array<{ profile?: { items?: Record<string, unknown> } }> })
    ?.profileChanges?.[0]?.profile?.items ?? {};
  const heroes: CampaignHeroItem[] = [];

  for (const [itemId, item] of Object.entries(items)) {
    const templateId = String(item?.templateId ?? '');
    if (!templateId.toLowerCase().startsWith('hero:')) continue;

    heroes.push({
      itemId,
      templateId,
      level: Number(item?.attributes?.level ?? 1),
      quantity: Number(item?.quantity ?? 1),
      classType: parseHeroClass(templateId),
      rarity: resolveStwRarity(templateId, item?.attributes?.starting_rarity),
    });
  }

  return sortCampaignHeroes(heroes);
}

export function groupHeroesByClass(
  heroes: CampaignHeroItem[],
): { classType: string; heroes: CampaignHeroItem[] }[] {
  const groups = new Map<string, CampaignHeroItem[]>();

  for (const hero of heroes) {
    const list = groups.get(hero.classType) ?? [];
    list.push(hero);
    groups.set(hero.classType, list);
  }

  const ordered: { classType: string; heroes: CampaignHeroItem[] }[] = [];
  for (const classType of CLASS_ORDER) {
    const list = groups.get(classType);
    if (list?.length) ordered.push({ classType, heroes: list });
  }

  for (const [classType, list] of groups) {
    if (!CLASS_ORDER.includes(classType as (typeof CLASS_ORDER)[number])) {
      ordered.push({ classType, heroes: list });
    }
  }

  return ordered;
}
