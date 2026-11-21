import { resolveResourceCatalogIcon } from '../resources/resourcesAssetResolver.ts';
import { resolveStwGenericVoucherIconPath } from '../stwGenericIconResolver.ts';
import { resolveMissionRewardBaseIconPath } from './worldInfoAssetResolver.ts';

const REWARD_RARITY_BORDER: Record<string, string> = {
  c: '#9ca3af',
  uc: '#22c55e',
  r: '#3b82f6',
  vr: '#a855f7',
  sr: '#f59e0b',
  er: '#f97316',
};

function genericWorkerSrIconPath(): string | null {
  return resolveStwGenericVoucherIconPath('AccountResource:voucher_generic_worker_sr');
}

function extractRewardRarityCode(itemType: string): string | null {
  const match = itemType.match(/_(vr|sr|er|r|uc|c)(?:_|$)/i);
  return match ? match[1].toLowerCase() : null;
}

/** Matches launcher `resolveRewardDisplayIcon` — home UI icons, not screenshot copy mode. */
export function resolveRewardDisplayIconPath(itemType: string): string | null {
  const type = itemType.trim().toLowerCase();

  if (type.includes('currency_mtxswap') || type.includes('mtxswap')) {
    return resolveResourceCatalogIcon('Currency_MtxSwap')
      ?? resolveMissionRewardBaseIconPath(itemType);
  }

  if (type.startsWith('worker:') && /_(sr|er)(?:_|$)/i.test(type)) {
    return genericWorkerSrIconPath() ?? resolveMissionRewardBaseIconPath(itemType);
  }

  if (type.startsWith('accountresource:voucher_generic_worker')) {
    return genericWorkerSrIconPath() ?? resolveMissionRewardBaseIconPath(itemType);
  }

  return resolveMissionRewardBaseIconPath(itemType);
}

/** Hero rewards only — CSS rarity frame in launcher home UI. */
export function getHeroRewardRarityBorderColor(itemType: string): string | null {
  if (!/^hero:/i.test(itemType)) return null;
  const rarity = extractRewardRarityCode(itemType);
  if (!rarity) return null;
  return REWARD_RARITY_BORDER[rarity] ?? null;
}
