function extractResourceRarity(templateId: string): string | null {
  const rarityMatch = templateId.match(/_(vr|sr|er|r|uc|c)(?:_|$)/i);
  return rarityMatch ? rarityMatch[1].toLowerCase() : null;
}

function normalizeTemplateId(templateId: string): string {
  return templateId.toLowerCase();
}

const OWNED_ALIASES: Record<string, string[]> = {
  'accountresource:peoplexp': ['accountresource:peoplexp', 'accountresource:personnelxp'],
};

export interface AccountMaterialSnapshot {
  byTemplate: Map<string, number>;
  byKindRarity: Map<string, number>;
}

export function buildAccountMaterialSnapshot(
  items: Record<string, { templateId?: string; quantity?: number }> | undefined,
): AccountMaterialSnapshot {
  const byTemplate = new Map<string, number>();
  const byKindRarity = new Map<string, number>();

  for (const item of Object.values(items ?? {})) {
    const tid = item.templateId;
    if (!tid) continue;
    const qty = item.quantity ?? 1;
    const key = normalizeTemplateId(tid);
    byTemplate.set(key, (byTemplate.get(key) ?? 0) + qty);

    const lower = key;
    let kind: string | null = null;
    if (lower.startsWith('hero:')) kind = 'hero';
    else if (lower.startsWith('schematic:')) kind = 'schematic';
    else if (lower.startsWith('worker:')) kind = lower.includes('manager') ? 'manager' : 'worker';
    else if (lower.startsWith('defender:')) kind = 'defender';

    if (kind) {
      const rarity = extractResourceRarity(tid) || 'sr';
      const kr = `${kind}:${rarity}`;
      byKindRarity.set(kr, (byKindRarity.get(kr) ?? 0) + qty);
    }
  }

  return { byTemplate, byKindRarity };
}

export function getOwnedAmount(snapshot: AccountMaterialSnapshot, costId: string): number {
  if (costId.startsWith('__evo:')) {
    const [, kind, rarity] = costId.split(':');
    return snapshot.byKindRarity.get(`${kind}:${rarity}`) ?? 0;
  }

  const key = normalizeTemplateId(costId);
  const aliases = OWNED_ALIASES[key];
  if (aliases) {
    return aliases.reduce((sum, alias) => sum + (snapshot.byTemplate.get(alias) ?? 0), 0);
  }
  return snapshot.byTemplate.get(key) ?? 0;
}

/** Voucher tokens and duplicate-fodder rows from cost scrape are not consumed in collection book. */
export function isExcludedUpgradeCost(templateId: string): boolean {
  const lower = templateId.toLowerCase();
  if (lower.includes('voucher_generic')) return true;
  if (lower.startsWith('__evo:')) return true;
  if (lower.startsWith('hero:')) return true;
  if (lower.startsWith('schematic:')) return true;
  if (lower.startsWith('worker:')) return true;
  if (lower.startsWith('defender:')) return true;
  return false;
}
