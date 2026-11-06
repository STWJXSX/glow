import { composeMCP } from '#helpers/epic/utils/mcp.ts';
import { resolveStwRarity, type StwRarity } from '../shop/stwShopCatalog.ts';

export interface CampaignSurvivorItem {
  itemId: string;
  templateId: string;
  level: number;
  quantity: number;
  rarity: StwRarity;
  isManager: boolean;
  /** IconDef id from attributes.portrait, e.g. IconDef-WorkerPortrait-Adventurous-F01 */
  portraitIconDef?: string;
}

export function parseStwPortraitIconDef(portrait: unknown): string | null {
  if (typeof portrait !== 'string' || !portrait.trim()) return null;
  const token = portrait.includes(':') ? portrait.split(':').pop()! : portrait;
  const iconDef = token.trim();
  return iconDef.startsWith('IconDef-') ? iconDef : null;
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

export function sortCampaignSurvivors(survivors: CampaignSurvivorItem[]): CampaignSurvivorItem[] {
  return [...survivors].sort((a, b) => {
    const rarityDiff = RARITY_ORDER[a.rarity] - RARITY_ORDER[b.rarity];
    if (rarityDiff !== 0) return rarityDiff;

    if (b.level !== a.level) return b.level - a.level;
    return a.templateId.localeCompare(b.templateId);
  });
}

export async function fetchCampaignSurvivors(
  accountId: string,
  accessToken: string,
  profileBody?: unknown,
): Promise<CampaignSurvivorItem[]> {
  const data = profileBody ?? (await composeMCP({
    profile: 'campaign',
    operation: 'QueryProfile',
    accountId,
    accessToken,
    body: {},
  })).data;

  const items: Record<string, any> = (data as { profileChanges?: Array<{ profile?: { items?: Record<string, unknown> } }> })
    ?.profileChanges?.[0]?.profile?.items ?? {};
  const survivors: CampaignSurvivorItem[] = [];

  for (const [itemId, item] of Object.entries(items)) {
    const templateId = String(item?.templateId ?? '');
    if (!templateId.toLowerCase().startsWith('worker:')) continue;

    const rawId = templateId.split(':')[1]?.toLowerCase() ?? '';
    survivors.push({
      itemId,
      templateId,
      level: Number(item?.attributes?.level ?? 1),
      quantity: Number(item?.quantity ?? 1),
      rarity: resolveStwRarity(templateId, item?.attributes?.starting_rarity),
      isManager: rawId.startsWith('manager'),
      portraitIconDef: parseStwPortraitIconDef(item?.attributes?.portrait) ?? undefined,
    });
  }

  return sortCampaignSurvivors(survivors);
}
