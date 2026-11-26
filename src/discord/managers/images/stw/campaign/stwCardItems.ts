import { resolveStwRarity } from '#helpers/epic/stw/shop/stwShopCatalog.ts';
import { parseStwPortraitIconDef } from '#helpers/epic/stw/collection/stwCampaignSurvivors.ts';
import { isCollectibleSchematicTemplateId } from '#helpers/epic/stw/collection/stwCampaignSchematics.ts';
import { resolveStwCardItemIcon } from './stwCardAssetResolver.ts';
import { getStwPowerLevel } from '#helpers/epic/stw/gameplay/stwPowerLevel.ts';
import { extractTier, sortByRarityThenLevel } from './stwFortniteCard.ts';
import { resolveCardTypeKey } from './stwCardTypeBadge.ts';
import type { StwCardDisplayItem, StwCardsCollectionType } from './types.ts';

const TYPE_PREFIX: Record<StwCardsCollectionType, string> = {
  heroes: 'hero:',
  survivors: 'worker:',
  schematics: 'schematic:',
  defenders: 'defender:',
};

function matchesType(templateId: string, type: StwCardsCollectionType): boolean {
  return templateId.toLowerCase().startsWith(TYPE_PREFIX[type]);
}

export function filterProfileByItemIds(profileBody: unknown, itemIds: string[]): unknown {
  const idSet = new Set(itemIds);
  if (!idSet.size) return profileBody;

  const body = profileBody as {
    profileChanges?: Array<{ profile?: { items?: Record<string, unknown> } }>;
  };
  const change = body?.profileChanges?.[0];
  const allItems = change?.profile?.items;
  if (!change || !allItems) return profileBody;

  const filtered: Record<string, unknown> = {};
  for (const id of idSet) {
    if (allItems[id]) filtered[id] = allItems[id];
  }

  return {
    ...body,
    profileChanges: [{
      ...change,
      profile: { ...change.profile, items: filtered },
    }],
  };
}

function resolveIconSrc(
  entry: {
    templateId: string;
    portrait?: unknown;
    portraitIconDef?: string;
  },
  type: StwCardsCollectionType,
): string | null {
  return resolveStwCardItemIcon(entry, type);
}

export function parseProfileToCardItems(
  profileBody: unknown,
  type: StwCardsCollectionType,
  itemIds?: string[],
): StwCardDisplayItem[] {
  const idSet = itemIds?.length ? new Set(itemIds) : null;
  const items = (profileBody as {
    profileChanges?: Array<{ profile?: { items?: Record<string, { templateId?: string; attributes?: Record<string, unknown>; quantity?: number }> } }>;
  })?.profileChanges?.[0]?.profile?.items ?? {};

  const parsed: StwCardDisplayItem[] = [];

  for (const [itemId, item] of Object.entries(items)) {
    if (idSet && !idSet.has(itemId)) continue;
    const templateId = String(item?.templateId ?? '');
    if (!matchesType(templateId, type)) continue;
    if (type === 'schematics' && !isCollectibleSchematicTemplateId(templateId)) continue;

    const rawId = templateId.split(':')[1]?.toLowerCase() ?? '';
    const attrs = item?.attributes ?? {};
    const rarity = resolveStwRarity(templateId, attrs.starting_rarity as string | undefined);
    const level = Number(attrs.level ?? 1);
    const portraitIconDef = parseStwPortraitIconDef(attrs.portrait) ?? undefined;

    const base = {
      itemId,
      templateId,
      level,
      quantity: Number(item?.quantity ?? 1),
      rarity,
      tier: extractTier(templateId),
      isManager: rawId.startsWith('manager'),
      favorite: attrs.favorite === true,
      typeKey: resolveCardTypeKey(type, {
        templateId,
        isManager: rawId.startsWith('manager'),
        portraitIconDef,
        personalityAttr: attrs.personality,
      }),
      powerLevel: getStwPowerLevel(rarity, level),
      iconSrc: null as string | null,
    };

    parsed.push({
      ...base,
      iconSrc: resolveIconSrc({ templateId, portraitIconDef, portrait: attrs.portrait }, type),
    });
  }

  return parsed.sort(sortByRarityThenLevel);
}
