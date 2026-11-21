/**
 * Season pass catalog (Battle Pass, LEGO Pass, Music Pass, OG Pass).
 *
 * The catalog is served by Glow Core through the signed local API; this module only keeps the
 * shared types and the cached loader used by the commands.
 */

import { callCoreWithTimeout } from '#api/glowCore.ts';

export type SeasonPassKind = 'battle' | 'lego' | 'music' | 'og' | 'other';

export interface SeasonPassOffer {
  offerId: string;
  priceRow: string | null;
  cost: number;
  /** AccountResource templateId, lowercased (e.g. `AccountResource:athenabattlestar`). */
  currency: string | null;
  /** Claimable without owning the premium pass. */
  free: boolean;
  templateId: string | null;
  name: string | null;
}

export type SeasonPassRequirement =
  | ({ type: 'offer' } & SeasonPassOffer)
  | { type: 'groupComplete'; group: string | null }
  | { type: 'timed'; eventFlag: string }
  | { type: 'releaseVersion'; version: string }
  | { type: 'unknown'; class: string };

export interface SeasonPassReward extends SeasonPassOffer {
  rewardsNeededOnPage?: number;
  rewardsNeededInCategory?: number;
  requiresRestOfPage?: boolean;
  requirements?: SeasonPassRequirement[];
}

export interface SeasonPassPage {
  id: string;
  index: number;
  rewards: SeasonPassReward[];
}

export interface SeasonPassCategory {
  id: string;
  index: number;
  title: string | null;
  subtitle: string | null;
  /** `Bonus` for BR bonus sets, null for the main reward track. */
  group: string | null;
  requirements: SeasonPassRequirement[];
  pages: SeasonPassPage[];
}

export interface SeasonPass {
  /** Profile item templateId, lowercased asset name (e.g. `AthenaSeason:athenaseason42`). */
  templateId: string;
  kind: SeasonPassKind;
  name: string;
  seasonNumber: number | null;
  claimOperation: 'ExchangeGameCurrencyForBattlePassOffer' | 'ExchangeGameCurrencyForSeasonPassOffer';
  offerCount: number;
  categories: SeasonPassCategory[];
}

export interface SeasonPassCatalog {
  schemaVersion: number;
  build: string;
  generatedAt: string;
  passes: SeasonPass[];
}

const CACHE_TTL_MS = 10 * 60 * 1000;

let cached: { catalog: SeasonPassCatalog; loadedAt: number } | null = null;

/** Live season pass catalog; throws when the core cannot provide one. */
export async function loadSeasonPassCatalog(): Promise<SeasonPassCatalog> {
  if (cached && Date.now() - cached.loadedAt < CACHE_TTL_MS) return cached.catalog;

  const catalog = await callCoreWithTimeout<SeasonPassCatalog>('shop.seasonPasses', 60_000);
  cached = { catalog, loadedAt: Date.now() };
  return catalog;
}
