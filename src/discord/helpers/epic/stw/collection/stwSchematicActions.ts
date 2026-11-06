import { composeMCP } from '#helpers/epic/utils/mcp.ts';
import {
  buildUpgradeBulkPayload,
  canEvolveSchematicRarity,
  getMaxGameLevel,
  getTierLevelCap,
  needsConversionIndexAtTierStep,
  needsSchematicMaterialChoice,
  parseMcpErrorMessage,
  resolveItemFromMcpResponse,
  pickItemFromSnapshots,
  tierFromTemplateId,
  type CampaignItemSnapshot,
  type CampaignUpgradeResult,
  type StwUpgradeItemRef,
} from './stwSchematicUpgradeLogic.ts';
import type { CampaignSchematicItem } from './stwCampaignSchematics.ts';
import { parseCampaignSchematicFromProfileItem } from './stwCampaignSchematics.ts';

export interface SchematicAccountContext {
  accountId: string;
  accessToken: string;
}

function toUpgradeRef(schematic: CampaignSchematicItem): StwUpgradeItemRef {
  return {
    itemId: schematic.itemId,
    templateId: schematic.templateId,
    gameLevel: schematic.level,
    stwRarity: schematic.rarity,
  };
}

function applySnapshot(ref: StwUpgradeItemRef, snapshot: CampaignItemSnapshot): void {
  ref.itemId = snapshot.itemId;
  ref.templateId = snapshot.templateId;
  ref.gameLevel = snapshot.level;
  if (snapshot.stwRarity) ref.stwRarity = snapshot.stwRarity;
}

async function fetchCampaignItemSnapshots(
  ctx: SchematicAccountContext,
): Promise<CampaignItemSnapshot[]> {
  const result = await composeMCP({
    profile: 'campaign',
    operation: 'QueryProfile',
    accountId: ctx.accountId,
    accessToken: ctx.accessToken,
    body: {},
  });
  const items =
    (result.data as { profileChanges?: { profile?: { items?: Record<string, unknown> } }[] })
      ?.profileChanges?.[0]?.profile?.items ?? {};
  const out: CampaignItemSnapshot[] = [];
  for (const [itemId, raw] of Object.entries(items)) {
    const entry = raw as {
      templateId?: string;
      attributes?: { level?: number; starting_rarity?: string };
    };
    if (!entry?.templateId) continue;
    out.push({
      itemId,
      templateId: String(entry.templateId),
      level: Number(entry.attributes?.level ?? 0),
      stwRarity:
        entry.attributes?.starting_rarity != null
          ? String(entry.attributes.starting_rarity)
          : undefined,
    });
  }
  return out;
}

async function resolveItemAfterMutation(
  ctx: SchematicAccountContext,
  anchor: StwUpgradeItemRef,
  data: unknown,
  opts?: { expectedLevel?: number; expectedMinTier?: number },
): Promise<CampaignItemSnapshot | null> {
  const fromResponse = resolveItemFromMcpResponse(data, anchor, opts);
  if (fromResponse) return fromResponse;

  const profileItems = await fetchCampaignItemSnapshots(ctx);
  return pickItemFromSnapshots(profileItems, anchor, opts);
}

export async function reloadSchematic(
  ctx: SchematicAccountContext,
  itemId: string,
): Promise<CampaignSchematicItem | null> {
  const result = await composeMCP({
    profile: 'campaign',
    operation: 'QueryProfile',
    accountId: ctx.accountId,
    accessToken: ctx.accessToken,
    body: {},
  });
  const items =
    (result.data as { profileChanges?: { profile?: { items?: Record<string, unknown> } }[] })
      ?.profileChanges?.[0]?.profile?.items ?? {};
  const raw = items[itemId];
  if (!raw) return null;
  return parseCampaignSchematicFromProfileItem(itemId, raw as Record<string, unknown>);
}

export async function upgradeSchematicRarity(
  ctx: SchematicAccountContext,
  schematic: CampaignSchematicItem,
): Promise<{ success: boolean; schematic?: CampaignSchematicItem; error?: string }> {
  if (!canEvolveSchematicRarity(schematic.rarity)) {
    return { success: false, error: 'max_rarity' };
  }

  try {
    const result = await composeMCP({
      profile: 'campaign',
      operation: 'UpgradeItemRarity',
      accountId: ctx.accountId,
      accessToken: ctx.accessToken,
      body: { targetItemId: schematic.itemId },
    });
    const anchor = toUpgradeRef(schematic);
    const snapshot = await resolveItemAfterMutation(ctx, anchor, result.data);
    const updated = snapshot
      ? await reloadSchematic(ctx, snapshot.itemId)
      : await reloadSchematic(ctx, schematic.itemId);
    return { success: true, schematic: updated ?? schematic };
  } catch (err) {
    return { success: false, error: parseMcpErrorMessage(err) || 'upgrade_rarity_failed' };
  }
}

export async function upgradeSchematicPerk(
  ctx: SchematicAccountContext,
  schematic: CampaignSchematicItem,
  alterationSlot: number,
): Promise<{ success: boolean; schematic?: CampaignSchematicItem; error?: string }> {
  try {
    await composeMCP({
      profile: 'campaign',
      operation: 'UpgradeAlteration',
      accountId: ctx.accountId,
      accessToken: ctx.accessToken,
      body: { targetItemId: schematic.itemId, alterationSlot },
    });
    const updated = await reloadSchematic(ctx, schematic.itemId);
    return { success: true, schematic: updated ?? schematic };
  } catch (err) {
    return { success: false, error: parseMcpErrorMessage(err) || 'upgrade_perk_failed' };
  }
}

export async function respecSchematicPerk(
  ctx: SchematicAccountContext,
  schematic: CampaignSchematicItem,
  alterationSlot: number,
  alterationId: string,
): Promise<{ success: boolean; schematic?: CampaignSchematicItem; error?: string }> {
  try {
    await composeMCP({
      profile: 'campaign',
      operation: 'RespecAlteration',
      accountId: ctx.accountId,
      accessToken: ctx.accessToken,
      body: { targetItemId: schematic.itemId, alterationSlot, alterationId },
    });
    const updated = await reloadSchematic(ctx, schematic.itemId);
    return { success: true, schematic: updated ?? schematic };
  } catch (err) {
    return { success: false, error: parseMcpErrorMessage(err) || 'respec_failed' };
  }
}

export function schematicNeedsEvolutionChoice(schematic: CampaignSchematicItem): boolean {
  const maxLevel = getMaxGameLevel(schematic.rarity);
  return needsSchematicMaterialChoice(
    schematic.templateId,
    schematic.rarity,
    schematic.level,
    maxLevel,
  );
}

export async function upgradeSchematicToMax(
  ctx: SchematicAccountContext,
  schematic: CampaignSchematicItem,
  conversionChoice: number,
): Promise<CampaignUpgradeResult> {
  const item = toUpgradeRef(schematic);
  const goal = getMaxGameLevel(item.stwRarity);
  let currentLevel = item.gameLevel;
  let currentTier = tierFromTemplateId(item.templateId, currentLevel);

  const fail = (error: string): CampaignUpgradeResult => ({
    success: false,
    finalLevel: currentLevel,
    finalItemId: item.itemId,
    finalTemplateId: item.templateId,
    error,
  });

  if (goal <= currentLevel) {
    return {
      success: true,
      finalLevel: currentLevel,
      finalItemId: item.itemId,
      finalTemplateId: item.templateId,
    };
  }

  let guard = 0;
  while (currentLevel < goal && guard++ < 14) {
    const tierCap = Math.min(goal, getTierLevelCap(currentTier));

    if (currentLevel < tierCap) {
      const bulkPayload = buildUpgradeBulkPayload(item, tierCap, conversionChoice, currentLevel);
      try {
        const bulk = await composeMCP({
          profile: 'campaign',
          operation: 'UpgradeItemBulk',
          accountId: ctx.accountId,
          accessToken: ctx.accessToken,
          body: bulkPayload,
        });
        const resolvedBulk = await resolveItemAfterMutation(ctx, item, bulk.data, {
          expectedLevel: tierCap,
        });
        const levelAfterBulk = resolvedBulk?.level ?? tierCap;
        if (levelAfterBulk <= currentLevel) {
          return fail(parseMcpErrorMessage('upgrade_no_progress'));
        }
        if (resolvedBulk) applySnapshot(item, resolvedBulk);
        currentLevel = item.gameLevel;
        currentTier = tierFromTemplateId(item.templateId, currentLevel);
      } catch (err) {
        return fail(parseMcpErrorMessage(err) || 'upgrade_failed');
      }
    }

    if (currentLevel >= goal) break;

    if (currentTier >= 6) {
      return fail('max_tier_reached');
    }

    const tierBeforeConvert = currentTier;
    const levelBeforeConvert = currentLevel;
    const itemIdBeforeConvert = item.itemId;
    const nextTier = currentTier + 1;

    const conversionIndex = needsConversionIndexAtTierStep(item, currentLevel, currentTier, goal)
      ? conversionChoice
      : 0;

    try {
      const conv = await composeMCP({
        profile: 'campaign',
        operation: 'ConvertItem',
        accountId: ctx.accountId,
        accessToken: ctx.accessToken,
        body: { targetItemId: item.itemId, conversionIndex },
      });
      const resolvedConvert = await resolveItemAfterMutation(ctx, item, conv.data, {
        expectedLevel: levelBeforeConvert,
        expectedMinTier: nextTier,
      });
      if (!resolvedConvert) {
        return fail('convert_item_not_found');
      }
      applySnapshot(item, resolvedConvert);
      currentLevel = item.gameLevel;
      currentTier = Math.max(nextTier, tierFromTemplateId(item.templateId, currentLevel));

      if (item.itemId === itemIdBeforeConvert && currentTier <= tierBeforeConvert) {
        return fail('convert_no_progress');
      }
    } catch (err) {
      return fail(parseMcpErrorMessage(err) || 'convert_failed');
    }
  }

  if (currentLevel < goal) {
    return fail('upgrade_incomplete');
  }

  return {
    success: true,
    finalLevel: currentLevel,
    finalItemId: item.itemId,
    finalTemplateId: item.templateId,
  };
}
