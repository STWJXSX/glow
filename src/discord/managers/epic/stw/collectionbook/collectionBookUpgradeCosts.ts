import type { CBItem, CBItemType, Rarity } from './types.ts';
import type { StwRarity } from '#helpers/epic/stw/shop/stwShopCatalog.ts';

export type UpgradeItemKind =
  | 'hero'
  | 'survivor_leader'
  | 'survivor_normal'
  | 'defender'
  | 'weapon'
  | 'trap';

export type UpgradeActionKind = 'level_up' | 'evolve';

export interface UpgradeCostStep {
  action: UpgradeActionKind;
  fromLevel: number;
  toLevel: number;
  fromTier?: number;
  toTier?: number;
  costs: Record<string, number>;
}

export interface UpgradeCostRunResult {
  itemKind: UpgradeItemKind;
  rarity: StwRarity;
  maxLevel: number;
  steps: UpgradeCostStep[];
  error?: string;
}

export const MAX_LEVEL_BY_RARITY: Record<Rarity, number> = {
  c: 20,
  uc: 30,
  r: 40,
  vr: 50,
  sr: 50,
  ur: 50,
};

export interface UpgradeCostsFile {
  meta?: { version?: number; scrapedAt?: string };
  catalog?: Record<string, { name?: string }>;
  byType: Partial<Record<UpgradeItemKind, Partial<Record<StwRarity, UpgradeCostRunResult>>>>;
}

export interface CollectionBookCatalogFile {
  meta?: { slotCount?: number; version?: number; exportedAt?: string };
  slots?: Array<{
    slotId: string;
    itemKind?: string;
    rarity?: string;
    primaryTemplateId: string;
    allowedTemplateIds?: string[];
    matchKeys?: string[];
    pageId?: string;
    pageName?: string;
    sectionId?: string;
    sectionName?: string;
    slotXpWeight?: string;
    slotSourceId?: string;
  }>;
}

export interface CollectionBookLibraryFile extends CollectionBookCatalogFile {
  meta?: CollectionBookCatalogFile['meta'] & {
    pageCount?: number;
    sectionCount?: number;
  };
  pages?: Array<{
    pageId: string;
    name?: string;
    category?: string;
    sectionIds?: string[];
  }>;
  sections?: Array<{
    sectionId: string;
    name?: string;
    pageId?: string;
    pageName?: string;
    slotIds?: string[];
  }>;
}

export interface CatalogGapResult {
  catalogSlots: number;
  slottedUnique: number;
  filledSlots: number;
  missingSlots: number;
  missingSlotIds: string[];
  missingByKind: Record<string, number>;
  catalogAvailable: boolean;
}

export interface BelowMaxEntry {
  itemId: string;
  templateId: string;
  type: CBItemType;
  kind: UpgradeItemKind;
  rarity: Rarity;
  level: number;
  maxLevel: number;
  costs: Record<string, number>;
  costDataSource: string;
  warning?: string;
}

export interface MissingCatalogSlotEntry {
  slotId: string;
  itemKind: string;
  rarity: string;
  primaryTemplateId: string;
  estimatedCosts: Record<string, number>;
  costDataSource: string;
  warning?: string;
}

export interface SlotInventoryEntry {
  slotId: string;
  status: 'filled' | 'missing';
  itemKind: string;
  rarity: string;
  pageId?: string;
  pageName?: string;
  sectionId?: string;
  sectionName?: string;
  primaryTemplateId: string;
  slottedItem?: {
    itemId: string;
    templateId: string;
    type: string;
    level: number;
    maxLevel: number;
    rarity: Rarity;
  };
  upgradeCosts?: Record<string, number>;
  upgradeBreakdown?: { levelUp: Record<string, number>; evolve: Record<string, number> };
  fullSlotCosts?: Record<string, number>;
  costDataSource?: string;
  warning?: string;
}

export interface KindRaritySummary {
  filled: Record<string, Record<string, number>>;
  missing: Record<string, Record<string, number>>;
  totals: { filled: number; missing: number; catalog: number };
}

export interface CollectionBookStatusSnapshot {
  catalogGap: CatalogGapResult;
  inventory: SlotInventoryEntry[];
  summaryByKindRarity: KindRaritySummary;
  belowMaxCount: number;
  materials: {
    upgradesPending: Record<string, number>;
    upgradesLevelUp: Record<string, number>;
    upgradesEvolve: Record<string, number>;
    missingSlotsFull: Record<string, number>;
    total: Record<string, number>;
  };
  warnings: string[];
}

const CB_TYPE_TO_KIND: Record<CBItemType, UpgradeItemKind | null> = {
  Hero: 'hero',
  Manager: 'survivor_leader',
  Survivor: 'survivor_normal',
  Defender: 'defender',
  Weapon: 'weapon',
  Trap: 'trap',
  Page: null,
};

export function normalizeSlotKey(templateId: string): string {
  const body = templateId.includes(':') ? templateId.split(':')[1]! : templateId;
  return body
    .toLowerCase()
    .replace(/_t0\d+$/i, '_t01')
    .replace(/_(ore|crystal|obsidian|shadowshard|sunbeam|brightcore|malachite|silver|copper)(?=(_|$))/gi, '');
}

export function mergeCostTotals(target: Record<string, number>, costs: Record<string, number>): void {
  for (const [templateId, amount] of Object.entries(costs)) {
    target[templateId] = (target[templateId] ?? 0) + amount;
  }
}

export function computeCatalogGap(
  slottedItems: Array<{ templateId: string }>,
  catalog?: CollectionBookCatalogFile | null,
): CatalogGapResult {
  const slottedKeys = new Set(slottedItems.map((i) => normalizeSlotKey(i.templateId)));
  const catalogSlots = catalog?.slots ?? [];
  const catalogAvailable = catalogSlots.length > 0;
  const missingSlotIds: string[] = [];
  const missingByKind: Record<string, number> = {};

  if (catalogAvailable) {
    for (const slot of catalogSlots) {
      const keys = (slot.matchKeys?.length
        ? slot.matchKeys
        : (slot.allowedTemplateIds ?? [slot.primaryTemplateId])
      ).map(normalizeSlotKey);
      if (!keys.some((k) => slottedKeys.has(k))) {
        missingSlotIds.push(slot.slotId);
        const kind = slot.itemKind ?? 'unknown';
        missingByKind[kind] = (missingByKind[kind] ?? 0) + 1;
      }
    }
  }

  return {
    catalogSlots: catalogSlots.length,
    slottedUnique: slottedKeys.size,
    filledSlots: catalogAvailable ? catalogSlots.length - missingSlotIds.length : 0,
    missingSlots: missingSlotIds.length,
    missingSlotIds,
    missingByKind,
    catalogAvailable,
  };
}

export function cbTypeToKind(type: CBItemType): UpgradeItemKind | null {
  return CB_TYPE_TO_KIND[type] ?? null;
}

export function resolveCostTable(
  costsFile: UpgradeCostsFile,
  kind: UpgradeItemKind,
  rarity: StwRarity,
  fallbackRarity: StwRarity = 'c',
): { table: UpgradeCostRunResult | null; source: string; warning?: string } {
  const direct = costsFile.byType[kind]?.[rarity];
  if (direct?.steps?.length && !direct.error) {
    return { table: direct, source: `${kind}/${rarity}` };
  }
  if (rarity !== fallbackRarity) {
    const fallback = costsFile.byType[kind]?.[fallbackRarity];
    if (fallback?.steps?.length && !fallback.error) {
      return {
        table: fallback,
        source: `${kind}/${fallbackRarity}`,
        warning: `No cost data for ${kind}/${rarity}; using ${fallbackRarity}`,
      };
    }
  }
  return { table: null, source: 'none', warning: `Missing cost table for ${kind}/${rarity}` };
}

export function sumUpgradeCostsFromLevel(
  table: UpgradeCostRunResult,
  fromLevel: number,
  maxLevel?: number,
): Record<string, number> {
  const cap = maxLevel ?? table.maxLevel;
  const out: Record<string, number> = {};
  for (const step of table.steps) {
    if (step.fromLevel < fromLevel) continue;
    if (step.toLevel > cap && step.action === 'level_up') continue;
    mergeCostTotals(out, step.costs);
  }
  return out;
}

export function sumFullUpgradeCosts(table: UpgradeCostRunResult, maxLevel?: number): Record<string, number> {
  return sumUpgradeCostsFromLevel(table, 1, maxLevel);
}

export function sumCostsByAction(
  costsFile: UpgradeCostsFile,
  kind: UpgradeItemKind,
  rarity: StwRarity,
  fromLevel: number,
  maxLevel: number,
  fallbackRarity: StwRarity = 'c',
): {
  total: Record<string, number>;
  levelUp: Record<string, number>;
  evolve: Record<string, number>;
  source: string;
  warning?: string;
} {
  const { table, source, warning } = resolveCostTable(costsFile, kind, rarity, fallbackRarity);
  const levelUp: Record<string, number> = {};
  const evolve: Record<string, number> = {};
  const total: Record<string, number> = {};
  if (!table) return { total, levelUp, evolve, source, warning };

  for (const step of table.steps) {
    if (step.fromLevel < fromLevel) continue;
    if (step.toLevel > maxLevel && step.action === 'level_up') continue;
    const bucket = step.action === 'evolve' ? evolve : levelUp;
    mergeCostTotals(bucket, step.costs);
    mergeCostTotals(total, step.costs);
  }
  return { total, levelUp, evolve, source, warning };
}

export function buildBelowMaxEntries(
  items: CBItem[],
  costsFile: UpgradeCostsFile,
  fallbackRarity: StwRarity = 'c',
): BelowMaxEntry[] {
  const entries: BelowMaxEntry[] = [];
  for (const item of items) {
    if (item.type === 'Page') continue;
    const kind = cbTypeToKind(item.type);
    if (!kind) continue;
    const maxLevel = MAX_LEVEL_BY_RARITY[item.rarity] ?? 50;
    if (item.level >= maxLevel) continue;
    const { table, source, warning } = resolveCostTable(costsFile, kind, item.rarity, fallbackRarity);
    if (!table) continue;
    entries.push({
      itemId: item.itemId,
      templateId: item.templateId,
      type: item.type,
      kind,
      rarity: item.rarity,
      level: item.level,
      maxLevel,
      costs: sumUpgradeCostsFromLevel(table, item.level, maxLevel),
      costDataSource: source,
      warning,
    });
  }
  return entries;
}

function slotMatchKeys(slot: NonNullable<CollectionBookCatalogFile['slots']>[number]): string[] {
  return (slot.matchKeys?.length
    ? slot.matchKeys
    : (slot.allowedTemplateIds ?? [slot.primaryTemplateId])
  ).map(normalizeSlotKey);
}

function findSlottedItem(
  slot: NonNullable<CollectionBookCatalogFile['slots']>[number],
  slottedByKey: Map<string, CBItem>,
): CBItem | undefined {
  for (const key of slotMatchKeys(slot)) {
    const item = slottedByKey.get(key);
    if (item) return item;
  }
  return undefined;
}

export function summarizeKindRarity(inventory: SlotInventoryEntry[]): KindRaritySummary {
  const filled: Record<string, Record<string, number>> = {};
  const missing: Record<string, Record<string, number>> = {};
  for (const row of inventory) {
    const bucket = row.status === 'filled' ? filled : missing;
    const kind = row.itemKind || 'unknown';
    const rarity = row.rarity || 'unknown';
    bucket[kind] ??= {};
    bucket[kind][rarity] = (bucket[kind][rarity] ?? 0) + 1;
  }
  return {
    filled,
    missing,
    totals: {
      filled: inventory.filter((r) => r.status === 'filled').length,
      missing: inventory.filter((r) => r.status === 'missing').length,
      catalog: inventory.length,
    },
  };
}

export function buildCollectionBookStatus(
  library: CollectionBookLibraryFile | null | undefined,
  slottedItems: CBItem[],
  costsFile: UpgradeCostsFile,
  fallbackRarity: StwRarity = 'c',
): CollectionBookStatusSnapshot {
  const playable = slottedItems.filter((i) => i.type !== 'Page');
  const catalogGap = computeCatalogGap(playable, library);
  const slots = library?.slots ?? [];
  const warnings = new Set<string>();

  const slottedByKey = new Map<string, CBItem>();
  for (const item of playable) {
    const key = normalizeSlotKey(item.templateId);
    if (!slottedByKey.has(key)) slottedByKey.set(key, item);
  }

  const belowMaxByItemId = new Map(
    buildBelowMaxEntries(slottedItems, costsFile, fallbackRarity).map((row) => [row.itemId, row]),
  );

  const missingCostBySlot = new Map<string, MissingCatalogSlotEntry>();
  if (library && catalogGap.missingSlotIds.length) {
    const slotById = new Map(slots.map((s) => [s.slotId, s]));
    for (const slotId of catalogGap.missingSlotIds) {
      const slot = slotById.get(slotId);
      if (!slot) continue;
      const kind = (slot.itemKind ?? 'weapon') as UpgradeItemKind;
      const rarity = (slot.rarity ?? fallbackRarity) as StwRarity;
      const { table, source, warning } = resolveCostTable(costsFile, kind, rarity, fallbackRarity);
      const maxLevel = MAX_LEVEL_BY_RARITY[rarity as Rarity] ?? 20;
      missingCostBySlot.set(slotId, {
        slotId,
        itemKind: slot.itemKind ?? kind,
        rarity: slot.rarity ?? rarity,
        primaryTemplateId: slot.primaryTemplateId,
        estimatedCosts: table ? sumFullUpgradeCosts(table, maxLevel) : {},
        costDataSource: source,
        warning,
      });
    }
  }

  const inventory: SlotInventoryEntry[] = slots.map((slot) => {
    const item = findSlottedItem(slot, slottedByKey);
    const kind = (slot.itemKind ?? 'weapon') as UpgradeItemKind;
    const rarity = (slot.rarity ?? fallbackRarity) as StwRarity;
    const maxLevel = MAX_LEVEL_BY_RARITY[rarity as Rarity] ?? 50;

    const entry: SlotInventoryEntry = {
      slotId: slot.slotId,
      status: item ? 'filled' : 'missing',
      itemKind: slot.itemKind ?? kind,
      rarity: slot.rarity ?? rarity,
      pageId: slot.pageId,
      pageName: slot.pageName,
      sectionId: slot.sectionId,
      sectionName: slot.sectionName,
      primaryTemplateId: slot.primaryTemplateId,
    };

    if (item) {
      entry.slottedItem = {
        itemId: item.itemId,
        templateId: item.templateId,
        type: item.type,
        level: item.level,
        maxLevel,
        rarity: item.rarity,
      };
      const belowMax = belowMaxByItemId.get(item.itemId);
      if (belowMax) {
        entry.upgradeCosts = belowMax.costs;
        entry.costDataSource = belowMax.costDataSource;
        if (belowMax.warning) warnings.add(belowMax.warning);
      } else if (item.level < maxLevel) {
        const split = sumCostsByAction(costsFile, kind, item.rarity, item.level, maxLevel, fallbackRarity);
        entry.upgradeCosts = split.total;
        entry.upgradeBreakdown = { levelUp: split.levelUp, evolve: split.evolve };
        entry.costDataSource = split.source;
        if (split.warning) warnings.add(split.warning);
      }
    } else {
      const missingRow = missingCostBySlot.get(slot.slotId);
      if (missingRow) {
        entry.fullSlotCosts = missingRow.estimatedCosts;
        entry.costDataSource = missingRow.costDataSource;
        if (missingRow.warning) warnings.add(missingRow.warning);
      }
    }
    return entry;
  });

  const upgradesPending: Record<string, number> = {};
  const upgradesLevelUp: Record<string, number> = {};
  const upgradesEvolve: Record<string, number> = {};
  const missingSlotsFull: Record<string, number> = {};

  for (const row of inventory) {
    if (row.upgradeCosts) mergeCostTotals(upgradesPending, row.upgradeCosts);
    if (row.upgradeBreakdown) {
      mergeCostTotals(upgradesLevelUp, row.upgradeBreakdown.levelUp);
      mergeCostTotals(upgradesEvolve, row.upgradeBreakdown.evolve);
    }
    if (row.fullSlotCosts) mergeCostTotals(missingSlotsFull, row.fullSlotCosts);
  }

  const total: Record<string, number> = {};
  mergeCostTotals(total, upgradesPending);
  mergeCostTotals(total, missingSlotsFull);

  const belowMaxCount = inventory.filter(
    (row) => row.slottedItem && row.slottedItem.level < row.slottedItem.maxLevel,
  ).length;

  return {
    catalogGap,
    inventory,
    summaryByKindRarity: summarizeKindRarity(inventory),
    belowMaxCount,
    materials: { upgradesPending, upgradesLevelUp, upgradesEvolve, missingSlotsFull, total },
    warnings: [...warnings],
  };
}
