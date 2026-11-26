import fs from 'fs';
import path from 'path';

import { resolveStwCatalogRoot } from '#helpers/core/glowAssetPaths.ts';

const GENERIC_ROOT = path.join(resolveStwCatalogRoot(), 'generic');

export function extractStwRarityCode(templateId: string): string | null {
  if (!templateId) return null;
  const match = templateId.match(/_(vr|sr|er|r|uc|c)(?:_|$)/i);
  return match ? match[1].toLowerCase() : null;
}

export function isStwWorkerManager(templateId: string): boolean {
  const raw = templateId.split(':')[1]?.toLowerCase() ?? '';
  return raw.startsWith('manager');
}

function genericIconPath(fileStem: string): string | null {
  for (const ext of ['.webp', '.png']) {
    const abs = path.join(GENERIC_ROOT, `${fileStem}${ext}`);
    if (fs.existsSync(abs)) return abs;
  }
  return null;
}

function resolveGenericVoucherStem(baseStem: string, rarity: string | null): string | null {
  if (rarity) {
    const withRarity = genericIconPath(`${baseStem}_${rarity}`);
    if (withRarity) return withRarity;
  }
  const plain = genericIconPath(baseStem);
  if (plain) return plain;
  if (rarity && rarity !== 'sr') {
    return genericIconPath(`${baseStem}_sr`);
  }
  return null;
}

/** Launcher `resolveStwGenericVoucherIcon` — UI silhouettes under stw-catalog/generic/. */
export function resolveStwGenericVoucherIconPath(templateId: string): string | null {
  const key = templateId.trim().toLowerCase();

  if (key.startsWith('accountresource:voucher_generic_')) {
    const stem = key.slice('accountresource:'.length);
    return genericIconPath(stem);
  }

  if (key.startsWith('worker:')) {
    const role = isStwWorkerManager(templateId) ? 'manager' : 'worker';
    const rarity = extractStwRarityCode(templateId);
    return resolveGenericVoucherStem(`voucher_generic_${role}`, rarity);
  }

  return null;
}

const SECTION_GENERIC_STEMS: Record<string, string> = {
  Voucher_Generic_Worker_SR: 'voucher_generic_worker_sr',
  Voucher_Generic_Hero_SR: 'voucher_generic_hero_sr',
  Voucher_Generic_Defender_SR: 'voucher_generic_defender_sr',
  Voucher_Generic_Ranged_SR: 'voucher_generic_ranged_sr',
};

export function resolveSectionGenericIconPath(resourceId: string): string | null {
  const stem = SECTION_GENERIC_STEMS[resourceId];
  if (!stem) return null;
  return genericIconPath(stem);
}
