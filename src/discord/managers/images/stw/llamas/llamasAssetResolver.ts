import fs from 'fs';
import path from 'path';

import { resolveStwCatalogRoot } from '#helpers/core/glowAssetPaths.ts';

const CATALOG_ROOT = path.join(resolveStwCatalogRoot(), 'llamas');

type LlamaCatalogEntry = {
  id?: string;
  name?: string;
  image?: { file?: string };
};

let catalogCache: Record<string, LlamaCatalogEntry> | null = null;

function loadCatalog(): Record<string, LlamaCatalogEntry> {
  if (!catalogCache) {
    const jsonPath = path.join(CATALOG_ROOT, 'llamas.json');
    if (!fs.existsSync(jsonPath)) {
      catalogCache = {};
    } else {
      const payload = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));
      catalogCache = (payload.llamas ?? {}) as Record<string, LlamaCatalogEntry>;
    }
  }
  return catalogCache;
}

function iconPathForCatalogKey(key: string): string | null {
  const entry = loadCatalog()[key];
  const file = entry?.image?.file;
  if (!file) return null;
  const full = path.join(CATALOG_ROOT, file);
  return fs.existsSync(full) ? full : null;
}

function suffixToPascal(suffix: string): string {
  return suffix
    .split('_')
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
    .join('_');
}

const CARDPACK_RULES: Array<[RegExp, string]> = [
  [/voucher_basicpack/i, 'persistentLlamas/Voucher_BasicPack'],
  [/voucher_cardpack_bronze/i, 'persistentLlamas/Voucher_CardPack_Bronze'],
  [/voucher_cardpack_jackpot/i, 'persistentLlamas/Voucher_CardPack_Jackpot'],
  [/voucher_cardpack_event_founders/i, 'persistentLlamas/Voucher_CardPack_Event_Founders'],
  [/voucher_cardpack_2021anniversary|voucher_cardpack_persistent_anniversary/i, 'persistentLlamas/Voucher_CardPack_2021Anniversary'],
  [/cardpack_basic/i, 'PinataMiniRewardPack'],
  [/cardpack_bronze/i, 'PinataStandardPack'],
  [/cardpack_silver/i, 'PinataSilver'],
  [/cardpack_gold|cardpack_jackpot/i, 'PinataGold'],
  [/cardpack_event_founders/i, 'PinataFoundersPack'],
  [/cardpack_event.*halloween/i, 'PinataHalloweenPack'],
  [/cardpack_event.*winter/i, 'PinataWinterEventPack'],
  [/cardpack_event.*anniversary/i, 'PinataAnniversaryPack-L'],
  [/cardpack_event.*spring/i, 'PinataSpringEventPack'],
  [/cardpack_event.*pirate|yarr/i, 'PinataYarrEventPack'],
  [/cardpack_event.*blockbuster/i, 'PinataBlockbusterPack'],
  [/cardpack_event.*eighties/i, 'PinataEightiesPack'],
  [/cardpack_event.*scavenger/i, 'PinataScavengerPack'],
  [/cardpack_event.*stormzone/i, 'PinataStormZonePack'],
  [/cardpack_event.*fleming/i, 'PinataFlemingPack'],
  [/cardpack_event.*vindertech/i, 'PinataVindertechPack'],
  [/cardpack_event.*roadtrip|horde/i, 'PinataRoadTripHordePack'],
  [/cardpack_event.*neon|cyberpunk/i, 'PinataNeonCyberpunkPack'],
  [/cardpack_event.*retro|scifi/i, 'PinataRetroSciFiEventPack'],
  [/cardpack_event.*artdeco/i, 'PinataArtDecoPack2020_512'],
];

export function resolveLlamaIconPath(templateId: string): string | null {
  const raw = templateId
    .replace(/^AccountResource:/i, '')
    .replace(/^CardPack:/i, '');

  for (const [re, key] of CARDPACK_RULES) {
    if (re.test(raw)) {
      const hit = iconPathForCatalogKey(key);
      if (hit) return hit;
    }
  }

  if (raw.toLowerCase().startsWith('voucher_')) {
    const voucherKey = `persistentLlamas/${suffixToPascal(raw)}`;
    const hit = iconPathForCatalogKey(voucherKey);
    if (hit) return hit;
  }

  const pascal = suffixToPascal(raw.replace(/^cardpack_/i, ''));
  const candidates = [
    `Pinata${pascal}`,
    `Pinata${pascal}_128`,
    `Pinata${pascal}-L`,
    raw,
    pascal,
  ];

  for (const key of candidates) {
    const hit = iconPathForCatalogKey(key);
    if (hit) return hit;
  }

  for (const [key] of Object.entries(loadCatalog())) {
    if (key.toLowerCase().includes(raw.toLowerCase().replace(/_/g, ''))) {
      const hit = iconPathForCatalogKey(key);
      if (hit) return hit;
    }
  }

  return iconPathForCatalogKey('PinataStandardPack');
}
