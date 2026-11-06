import type { Client } from 'discord.js';
import { getEmoji } from '#helpers/core/emojis.ts';
import { e, eSuffix } from '../alerts/emojiMap.ts';
import type { AccountMaterialSnapshot } from './collectionBookMaterialInventory.ts';
import { getOwnedAmount, isExcludedUpgradeCost } from './collectionBookMaterialInventory.ts';

function extractResourceRarity(itemType: string): string | null {
  if (!itemType) return null;
  const rarityMatch = itemType.match(/_(vr|sr|er|r|uc|c)(?:_|$)/i);
  return rarityMatch ? rarityMatch[1].toLowerCase() : null;
}

const AGGREGATE_PREFIX = '__evo:';

function accountResourceEmoji(key: string): string {
  if (key === 'peoplexp') {
    const personnel = e('resources_personnelxp');
    if (personnel) return personnel;
  }
  const direct = e(`resources_${key}`) || e(`esources_${key}`);
  if (direct) return direct;
  if (key.includes('phoenixxp')) return e('resources_phoenixxp');
  const currency = e(`currency_${key}`);
  if (currency) return currency;
  if (key.startsWith('voucher_generic_')) {
    return eSuffix(key)
      || e('resources_voucher_generic_hero')
      || e('resources_voucher_generic_worker')
      || e('resources_voucher_generic_trap');
  }
  return eSuffix(key);
}

function voucherEmojiForKind(kind: string, rarity: string): string {
  const r = rarity.toLowerCase();
  switch (kind) {
    case 'hero':
      return eSuffix(`voucher_generic_hero_${r}`) || e('resources_voucher_generic_hero');
    case 'schematic':
    case 'weapon':
      return eSuffix(`voucher_generic_schematic_${r}`) || eSuffix(`voucher_generic_weapon_${r}`);
    case 'trap':
      return eSuffix(`voucher_generic_trap_${r}`) || e('resources_voucher_generic_trap');
    case 'defender':
      return eSuffix(`voucher_generic_defender_${r}`);
    case 'worker':
      return eSuffix(`voucher_generic_worker_${r}`) || e('resources_voucher_generic_worker');
    case 'manager':
      return eSuffix(`voucher_generic_manager_${r}`) || eSuffix('voucher_generic_manager');
    default:
      return '';
  }
}

/** Drop non-consumable costs; merge remaining resource totals. */
export function aggregateCostsForDisplay(costs: Record<string, number>): Record<string, number> {
  const out: Record<string, number> = {};
  for (const [id, amount] of Object.entries(costs)) {
    if (isExcludedUpgradeCost(id)) continue;
    out[id] = (out[id] ?? 0) + amount;
  }
  return out;
}

/** Upgrade-cost emoji (same rules as autokick / alerts). */
export function getUpgradeResourceEmoji(templateId: string): string {
  if (!templateId) return '';
  const tipo = templateId.toLowerCase();

  if (templateId.startsWith(AGGREGATE_PREFIX)) {
    const [, kind, rarity] = templateId.split(':');
    return voucherEmojiForKind(kind ?? '', rarity ?? 'sr');
  }

  if (tipo.includes('accountresource:')) {
    const key = templateId.replace(/^AccountResource:/i, '').toLowerCase();
    return accountResourceEmoji(key);
  }

  if (tipo.includes('ingredient:')) {
    const key = templateId.replace(/^Ingredient:/i, '').toLowerCase();
    const direct = e(`ingredients_${key}`);
    if (direct) return direct;
    const stripped = key.replace(/^reagent_/, '');
    return e(`ingredients_${stripped}`) || eSuffix(stripped);
  }

  if (tipo.includes('worker:')) {
    const rarity = extractResourceRarity(templateId) || 'sr';
    if (tipo.includes('manager')) return eSuffix(`voucher_generic_manager_${rarity}`);
    return eSuffix(`voucher_generic_worker_${rarity}`);
  }

  if (tipo.includes('hero:')) {
    const rarity = extractResourceRarity(templateId) || 'sr';
    return eSuffix(`voucher_generic_hero_${rarity}`);
  }

  if (tipo.includes('schematic:')) {
    const rarity = extractResourceRarity(templateId) || 'sr';
    return eSuffix(`voucher_generic_schematic_${rarity}`);
  }

  if (tipo.includes('defender:')) {
    const rarity = extractResourceRarity(templateId) || 'sr';
    return eSuffix(`voucher_generic_defender_${rarity}`);
  }

  if (tipo.includes('cardpack:')) {
    if (tipo.includes('reagent_alteration_upgrade')) {
      const m = tipo.match(/(sr|vr|r|uc|c)$/);
      return eSuffix(`reagent_alteration_upgrade_${m?.[1] || 'sr'}`);
    }
    const t0 = tipo.match(/(reagent_c_t0\d)/);
    if (t0) return e(`resources_${t0[1]}`);
    if (tipo.includes('heroxp')) return e('resources_heroxp');
    if (tipo.includes('personnelxp')) return e('resources_personnelxp');
    if (tipo.includes('schematicxp')) return e('resources_schematicxp');
    if (tipo.includes('phoenixxp')) return e('resources_phoenixxp');
    if (tipo.includes('voucher_cardpack')) return eSuffix('voucher_cardpack_jackpot');
    if (tipo.includes('voucher_basicpack')) return eSuffix('voucher_basicpack');
  }

  return '';
}

const KIND_ORDER = ['hero', 'weapon', 'trap', 'defender', 'survivor_normal', 'survivor_leader'] as const;

const RARITY_ORDER = ['sr', 'vr', 'r', 'uc', 'c', 'ur'] as const;

const HERO_RARITY_KEY: Record<string, string> = {
  c: 'hero_c', uc: 'hero_uc', r: 'hero_r', vr: 'hero_vr', sr: 'hero_sr', ur: 'hero_er', er: 'hero_er',
};

const WEAPON_RARITY_KEY: Record<string, string> = {
  c: 'weapon_c', uc: 'weapon_uc', r: 'weapon_r', vr: 'weapon_vr', sr: 'weapon_sr', ur: 'weapon_sr', er: 'weapon_sr',
};

const TRAP_RARITY_KEY: Record<string, string> = {
  c: 'trap_c', uc: 'trap_uc', r: 'trap_r', vr: 'trap_vr', sr: 'trap_sr', ur: 'trap_sr', er: 'trap_sr',
};

export function collectionBookKindOrder(): readonly string[] {
  return KIND_ORDER;
}

export function collectionBookRarityOrder(): readonly string[] {
  return RARITY_ORDER;
}

export function getCollectionBookKindEmoji(
  client: Client,
  kind: string,
  rarity: string = 'sr',
): string {
  const r = rarity.toLowerCase();
  switch (kind) {
    case 'hero':
      return (getEmoji(client, (HERO_RARITY_KEY[r] ?? 'hero_sr') as any) as string)
        || eSuffix(`voucher_generic_hero_${r}`);
    case 'weapon':
      return (getEmoji(client, (WEAPON_RARITY_KEY[r] ?? 'weapon_sr') as any) as string)
        || eSuffix(`voucher_generic_schematic_${r}`)
        || eSuffix(`voucher_generic_weapon_${r}`);
    case 'trap':
      return (getEmoji(client, (TRAP_RARITY_KEY[r] ?? 'trap_sr') as any) as string)
        || eSuffix(`voucher_generic_trap_${r}`);
    case 'defender':
      return eSuffix(`voucher_generic_defender_${r}`)
        || eSuffix('voucher_generic_defender_sr');
    case 'survivor_normal':
      return eSuffix(`voucher_generic_worker_${r}`)
        || eSuffix('voucher_generic_worker_sr');
    case 'survivor_leader':
      return eSuffix(`voucher_generic_manager_${r}`)
        || eSuffix('voucher_generic_manager');
    default:
      return (getEmoji(client, 'stw_power' as any) as string) ?? '';
  }
}

export function getCollectionBookRarityEmoji(client: Client, rarity: string): string {
  const r = rarity.toLowerCase();
  return (getEmoji(client, (HERO_RARITY_KEY[r] ?? 'hero_r') as any) as string) ?? '';
}

export function formatResourceAmount(amount: number): string {
  if (amount >= 1_000_000) return `${(amount / 1_000_000).toFixed(1)}M`;
  if (amount >= 10_000) return `${Math.round(amount / 1_000)}K`;
  return amount.toLocaleString('en-US');
}

export function shortResourceId(templateId: string): string {
  return templateId.replace(/^[^:]+:/, '');
}

export function resolveResourceLabel(
  templateId: string,
  catalog?: Record<string, { name?: string }>,
  labelForAggregate?: (aggregateId: string) => string,
): string {
  if (templateId.startsWith(AGGREGATE_PREFIX) && labelForAggregate) {
    return labelForAggregate(templateId);
  }
  if (catalog) {
    const direct = catalog[templateId]?.name;
    if (direct) return direct;
    const lower = templateId.toLowerCase();
    for (const [key, entry] of Object.entries(catalog)) {
      if (key.toLowerCase() === lower && entry.name) return entry.name;
    }
  }
  return shortResourceId(templateId);
}

function shortCostLabel(label: string, max = 22): string {
  if (label.length <= max) return label;
  return `${label.slice(0, max - 1)}…`;
}

export function formatCompactCostLines(
  costs: Record<string, number>,
  catalog: Record<string, { name?: string }> | undefined,
  labelFor: (id: string) => string,
  inventory?: AccountMaterialSnapshot,
  statusEmoji?: { ok: string; fail: string },
  itemsPerLine = 2,
): string[] {
  const aggregated = aggregateCostsForDisplay(costs);
  const entries = Object.entries(aggregated).sort((a, b) => b[1] - a[1]);
  if (!entries.length) return [];

  const lines: string[] = [];
  for (let i = 0; i < entries.length; i += itemsPerLine) {
    const chunk = entries.slice(i, i + itemsPerLine);
    const parts = chunk.map(([id, amount]) => {
      const emoji = getUpgradeResourceEmoji(id);
      const label = shortCostLabel(resolveResourceLabel(id, catalog, labelFor));
      const amountStr = `\`${formatResourceAmount(amount)}\``;
      let status = '';
      if (inventory && statusEmoji) {
        const owned = getOwnedAmount(inventory, id);
        status = owned >= amount ? statusEmoji.ok : statusEmoji.fail;
      }
      const prefix = status ? `${status} ` : '';
      if (emoji) return `${prefix}${emoji} **${label}** ${amountStr}`;
      return `${prefix}**${label}** ${amountStr}`;
    });
    lines.push(`> ${parts.join(' | ')}`);
  }
  return lines;
}
