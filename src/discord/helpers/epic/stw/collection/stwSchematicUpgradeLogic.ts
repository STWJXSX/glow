/**
 * Campaign schematic level / tier upgrade logic (ported from Glow Launcher stwItemUpgradeLogic).
 */

export interface StwUpgradeItemRef {
  itemId: string;
  templateId: string;
  gameLevel: number;
  stwRarity: string;
}

const TIER_ROMAN = ['', 'i', 'ii', 'iii', 'iv', 'v', 'vi'] as const;

const MAX_LEVEL_BY_RARITY: Record<string, number> = {
  c: 20,
  uc: 30,
  r: 40,
  vr: 50,
  sr: 50,
  ur: 50,
  er: 50,
};

export function getMaxGameLevel(stwRarity: string): number {
  return MAX_LEVEL_BY_RARITY[stwRarity] ?? 50;
}

export function getTierLevelCap(tier: number): number {
  if (tier <= 1) return 10;
  if (tier === 2) return 20;
  if (tier === 3) return 30;
  if (tier === 4) return 40;
  if (tier === 5) return 50;
  return 60;
}

export function levelToMaterialTier(level: number): number {
  if (level <= 10) return 1;
  if (level <= 20) return 2;
  if (level <= 30) return 3;
  if (level <= 40) return 4;
  return 5;
}

export function tierFromTemplateId(templateId: string, level: number): number {
  const tierMatch = templateId.match(/_t0(\d)(?:_|$)/i);
  if (tierMatch) {
    const tier = parseInt(tierMatch[1], 10);
    if (tier >= 1 && tier <= 6) return tier;
  }
  return levelToMaterialTier(level);
}

export function resolveDesiredTier(templateId: string, targetLevel: number): string {
  const lower = templateId.toLowerCase();
  if (lower.startsWith('hero:') || lower.startsWith('worker:') || lower.startsWith('defender:')) {
    return 'no_tier';
  }
  if (lower.startsWith('schematic:') && isTrapSchematic(templateId)) {
    return 'no_tier';
  }
  const tier = tierFromTemplateId(templateId, targetLevel);
  if (tier <= 1) return 'no_tier';
  return TIER_ROMAN[tier] ?? 'no_tier';
}

export function isTrapSchematic(templateId: string): boolean {
  const lowered = templateId.toLowerCase();
  if (!lowered.startsWith('schematic:')) return false;
  return (
    lowered.includes('_floor_') ||
    lowered.includes('_wall_') ||
    lowered.includes('_ceiling_') ||
    lowered.includes('_launch_') ||
    lowered.includes('_campfire') ||
    lowered.includes('_pad_') ||
    lowered.includes('_lights_') ||
    lowered.includes('_trap')
  );
}

export function isWeaponSchematic(templateId: string): boolean {
  return templateId.toLowerCase().startsWith('schematic:') && !isTrapSchematic(templateId);
}

/** Legendary weapon schematic: material path choice at tier-3 cap (level 30). */
export function needsSchematicMaterialChoice(
  templateId: string,
  stwRarity: string,
  fromLevel: number,
  toLevel: number,
): boolean {
  if (!isWeaponSchematic(templateId)) return false;
  if (stwRarity !== 'sr') return false;
  return fromLevel < 30 && toLevel >= 30;
}

export function needsConversionIndexAtTierStep(
  item: StwUpgradeItemRef,
  currentLevel: number,
  currentTier: number,
  goalLevel: number,
): boolean {
  if (needsSchematicMaterialChoice(item.templateId, item.stwRarity, currentLevel, goalLevel)) {
    return true;
  }
  return (
    item.stwRarity === 'sr' &&
    isWeaponSchematic(item.templateId) &&
    currentLevel >= 30 &&
    getTierLevelCap(currentTier) === 30 &&
    goalLevel > currentLevel
  );
}

export function canEvolveSchematicRarity(stwRarity: string): boolean {
  return stwRarity === 'r' || stwRarity === 'vr';
}

export function buildUpgradeBulkPayload(
  item: StwUpgradeItemRef,
  targetLevel: number,
  conversionChoice: number,
  fromLevel?: number,
): Record<string, unknown> {
  const start = fromLevel ?? item.gameLevel;
  const payload: Record<string, unknown> = {
    targetItemId: item.itemId,
    desiredLevel: targetLevel,
    desiredTier: resolveDesiredTier(item.templateId, targetLevel),
  };
  if (needsSchematicMaterialChoice(item.templateId, item.stwRarity, start, targetLevel)) {
    payload.conversionRecipeIndexChoice = conversionChoice;
  }
  return payload;
}

export function getEvolutionKey(templateId: string): string {
  return templateId
    .toLowerCase()
    .replace(/_(t0\d|ore|crystal|obsidian|shadowshard|sunbeam|brightcore|malachite|silver|copper)(?=(_|$))/gi, '');
}

export interface CampaignItemSnapshot {
  itemId: string;
  templateId: string;
  level: number;
  stwRarity?: string;
}

export function collectItemsFromProfile(items: Record<string, unknown>): CampaignItemSnapshot[] {
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

function scoreItemCandidate(
  candidate: CampaignItemSnapshot,
  anchor: StwUpgradeItemRef,
  expectedLevel?: number,
  expectedMinTier?: number,
): number {
  if (getEvolutionKey(candidate.templateId) !== getEvolutionKey(anchor.templateId)) {
    return Number.NEGATIVE_INFINITY;
  }
  let score = 0;
  if (candidate.itemId === anchor.itemId) score += 1000;
  if (expectedLevel != null) score -= Math.abs(candidate.level - expectedLevel) * 4;
  if (expectedMinTier != null) {
    const tier = tierFromTemplateId(candidate.templateId, candidate.level);
    if (tier < expectedMinTier) return Number.NEGATIVE_INFINITY;
    score += 100 - Math.abs(tier - expectedMinTier) * 10;
  }
  return score;
}

export function pickItemFromSnapshots(
  candidates: CampaignItemSnapshot[],
  anchor: StwUpgradeItemRef,
  opts?: { expectedLevel?: number; expectedMinTier?: number },
): CampaignItemSnapshot | null {
  let best: CampaignItemSnapshot | null = null;
  let bestScore = Number.NEGATIVE_INFINITY;
  for (const candidate of candidates) {
    const score = scoreItemCandidate(candidate, anchor, opts?.expectedLevel, opts?.expectedMinTier);
    if (score > bestScore) {
      bestScore = score;
      best = candidate;
    }
  }
  return bestScore === Number.NEGATIVE_INFINITY ? null : best;
}

export function resolveItemFromMcpResponse(
  data: unknown,
  anchor: StwUpgradeItemRef,
  opts?: { expectedLevel?: number; expectedMinTier?: number },
): CampaignItemSnapshot | null {
  const changes = (data as { profileChanges?: unknown[] })?.profileChanges;
  if (!Array.isArray(changes)) return null;

  const candidates: CampaignItemSnapshot[] = [];
  for (const change of changes) {
    const profileItems = (change as { profile?: { items?: Record<string, unknown> } })?.profile?.items;
    if (profileItems) candidates.push(...collectItemsFromProfile(profileItems));

    const changeItemId = (change as { itemId?: string })?.itemId;
    const changeItem = (change as { item?: unknown })?.item;
    if (changeItemId && changeItem) {
      candidates.push(...collectItemsFromProfile({ [changeItemId]: changeItem }));
    }
  }

  return pickItemFromSnapshots(candidates, anchor, opts);
}

export function parseMcpErrorMessage(error: unknown): string {
  if (!error) return '';
  if (typeof error === 'string') return error;
  const err = error as {
    message?: string;
    errorMessage?: string;
    errorCode?: string;
    response?: { data?: { errorMessage?: string; errorCode?: string } };
  };
  return (
    err?.response?.data?.errorMessage ||
    err?.errorMessage ||
    err?.message ||
    err?.response?.data?.errorCode ||
    err?.errorCode ||
    ''
  );
}

export interface CampaignUpgradeResult {
  success: boolean;
  finalLevel: number;
  finalItemId: string;
  finalTemplateId: string;
  error?: string;
}
