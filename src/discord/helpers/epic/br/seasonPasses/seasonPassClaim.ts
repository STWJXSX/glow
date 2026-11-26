/**
 * Claims every season pass reward an account can currently afford and has unlocked.
 *
 * The planner mirrors the unlock rules exported from the game data (category unlock
 * offers, "N rewards on this page", "rest of page", …) so it only sends offers that
 * should go through. The server stays the authority: rules it enforces that the data
 * does not describe (page order, timed bonus sets) surface as a rejected batch, which
 * is retried offer by offer, and a category that rejects everything is left alone.
 */

import { composeMCP } from '#helpers/epic/utils/mcp.ts';
import { log } from '#helpers/core/logger.ts';
import type {
  SeasonPass,
  SeasonPassCatalog,
  SeasonPassCategory,
  SeasonPassKind,
  SeasonPassOffer,
  SeasonPassReward,
} from './seasonPassCatalog.ts';

interface ProfileItem {
  templateId?: string;
  quantity?: number;
  attributes?: Record<string, unknown>;
}

type ClaimOperation = SeasonPass['claimOperation'];

interface PassProgress {
  pass: SeasonPass;
  /** Operations to try, best first; the one that works moves to the front. */
  operations: ClaimOperation[];
  /** templateId exactly as the profile stores it — sent back as seasonPassTemplateId. */
  profileTemplateId: string;
  premium: boolean;
  claimed: Set<string>;
}

export interface ClaimedReward {
  offerId: string;
  name: string | null;
  cost: number;
  currency: string | null;
}

export interface PassClaimResult {
  templateId: string;
  kind: SeasonPassKind;
  name: string;
  /** False when the account has no progress item for this pass this season. */
  active: boolean;
  premium: boolean;
  claimed: ClaimedReward[];
  /** Offers the server refused for a reason other than "still locked". */
  rejected: number;
  /** Unclaimed offers left (not enough currency, or locked by a page rule the data does not describe). */
  remaining: number;
  /** Distinct Epic error messages behind the rejections (first few). */
  errors: string[];
}

export interface ClaimOptions {
  /** Restrict to these pass kinds; all passes when omitted. */
  kinds?: ReadonlySet<SeasonPassKind>;
  /** Plan only: no exchange is sent, every planned offer is reported as claimed. */
  dryRun?: boolean;
}

export interface SeasonPassClaimResult {
  passes: PassClaimResult[];
  /** Currency left after claiming, keyed by lowercased AccountResource templateId. */
  balances: Record<string, number>;
}

/** Same additionalData the game client sends from the pass screen. */
const ADDITIONAL_DATA = {
  islandId: '',
  islandTitle: '',
  productTag: 'Product.FNE.Hub',
  storeContext: '',
  sourceContext: '',
  checkoutProperties: {},
  itemShopFilterContext: { activeFilters: [], inactiveFilters: [] },
  storefront: '',
  storeId: '',
  groupId: '',
};

/** Hard stop against a rules mismatch looping forever. */
const MAX_ROUNDS = 40;

/** Epic sometimes leaves a request hanging; without a cap one account stalls a whole bulk run. */
const MCP_TIMEOUT_MS = 20_000;

function extractProfileItems(response: unknown): Record<string, ProfileItem> {
  const root = response as {
    profileChanges?: Array<{ profile?: { items?: Record<string, ProfileItem> } }>;
  };
  return root.profileChanges?.[0]?.profile?.items ?? {};
}

function readBalances(items: Record<string, ProfileItem>): Map<string, number> {
  const balances = new Map<string, number>();
  for (const item of Object.values(items)) {
    const templateId = item.templateId?.toLowerCase();
    if (!templateId?.startsWith('accountresource:')) continue;
    balances.set(templateId, (balances.get(templateId) ?? 0) + (item.quantity ?? 0));
  }
  return balances;
}

function readProgress(pass: SeasonPass, items: Record<string, ProfileItem>): PassProgress | null {
  const wanted = pass.templateId.toLowerCase();
  const item = Object.values(items).find((i) => i.templateId?.toLowerCase() === wanted);
  if (!item?.templateId) return null;

  const purchased = Array.isArray(item.attributes?.purchased_offers)
    ? (item.attributes!.purchased_offers as Array<{ offerId?: string }>)
    : [];

  const operations: ClaimOperation[] = [pass.claimOperation];
  // BR passes before Chapter 6 only accepted the dedicated battle pass operation.
  if (pass.kind === 'battle') {
    for (const op of ['ExchangeGameCurrencyForSeasonPassOffer', 'ExchangeGameCurrencyForBattlePassOffer'] as const) {
      if (!operations.includes(op)) operations.push(op);
    }
  }

  return {
    pass,
    operations,
    profileTemplateId: item.templateId,
    premium: item.attributes?.purchased === true,
    claimed: new Set(purchased.map((o) => o.offerId?.toUpperCase()).filter((id): id is string => !!id)),
  };
}

function canAfford(offer: SeasonPassOffer, balances: Map<string, number>): boolean {
  if (offer.cost <= 0) return true;
  if (!offer.currency) return false;
  return (balances.get(offer.currency.toLowerCase()) ?? 0) >= offer.cost;
}

function spend(offer: SeasonPassOffer, balances: Map<string, number>): void {
  if (offer.cost <= 0 || !offer.currency) return;
  const key = offer.currency.toLowerCase();
  balances.set(key, (balances.get(key) ?? 0) - offer.cost);
}

function categoryOffers(category: SeasonPassCategory): SeasonPassOffer[] {
  return [
    ...category.requirements.flatMap((r) => (r.type === 'offer' ? [r] : [])),
    ...category.pages.flatMap((p) => p.rewards),
  ];
}

/** Category-level unlock offers (BR character sets) still to buy. */
function pendingUnlocks(category: SeasonPassCategory, progress: PassProgress): SeasonPassOffer[] {
  return category.requirements.flatMap((r) =>
    r.type === 'offer' && !progress.claimed.has(r.offerId) ? [r] : []);
}

function rewardUnlocked(
  reward: SeasonPassReward,
  pageRewards: SeasonPassReward[],
  category: SeasonPassCategory,
  claimed: Set<string>,
): boolean {
  const others = pageRewards.filter((r) => r.offerId !== reward.offerId);
  const claimedOnPage = others.filter((r) => claimed.has(r.offerId)).length;

  if (reward.rewardsNeededOnPage !== undefined && claimedOnPage < reward.rewardsNeededOnPage) return false;
  if (reward.requiresRestOfPage && claimedOnPage < others.length) return false;

  if (reward.rewardsNeededInCategory !== undefined) {
    const claimedInCategory = category.pages
      .flatMap((p) => p.rewards)
      .filter((r) => r.offerId !== reward.offerId && claimed.has(r.offerId)).length;
    if (claimedInCategory < reward.rewardsNeededInCategory) return false;
  }

  // Offer prerequisites are checkable; timed / release / group rules are left to the server.
  return (reward.requirements ?? []).every((req) => req.type !== 'offer' || claimed.has(req.offerId));
}

/**
 * Offers to send next for one category, given what is claimed and affordable now.
 * A locked category only yields its unlock offer; the rewards follow next round.
 */
function nextWave(
  category: SeasonPassCategory,
  progress: PassProgress,
  balances: Map<string, number>,
  skip: (offerId: string) => boolean,
): SeasonPassOffer[] {
  const budget = new Map(balances);
  const wave: SeasonPassOffer[] = [];
  const take = (offer: SeasonPassOffer) => {
    if (!offer.free && !progress.premium) return;
    if (skip(offer.offerId)) return;
    if (!canAfford(offer, budget)) return;
    spend(offer, budget);
    wave.push(offer);
  };

  const unlocks = pendingUnlocks(category, progress);
  if (unlocks.length > 0) {
    unlocks.forEach(take);
    return wave;
  }

  for (const page of category.pages) {
    for (const reward of page.rewards) {
      if (progress.claimed.has(reward.offerId)) continue;
      if (!rewardUnlocked(reward, page.rewards, category, progress.claimed)) continue;
      take(reward);
    }
  }
  return wave;
}

type ClaimOutcome = { ok: true } | { ok: false; error: string; locked: boolean };

/**
 * Pages of the LEGO / Music passes unlock server-side (a free account stops after the
 * second page) and that rule is not in the exported data; Epic answers it with this.
 */
const LOCKED_ERROR = /prerequisites have been met/i;

async function sendClaim(
  account: { accountId: string; accessToken: string },
  progress: PassProgress,
  offers: SeasonPassOffer[],
  dryRun: boolean,
): Promise<ClaimOutcome> {
  if (dryRun) return { ok: true };

  let firstError = 'unknown';
  let locked = false;
  for (const [index, operation] of progress.operations.entries()) {
    const body: Record<string, unknown> = {
      offerItemIdList: offers.map((o) => o.offerId),
      additionalData: ADDITIONAL_DATA,
    };
    if (operation === 'ExchangeGameCurrencyForSeasonPassOffer') {
      body.seasonPassTemplateId = progress.profileTemplateId;
    }

    try {
      await composeMCP({
        profile: 'athena',
        operation,
        accountId: account.accountId,
        accessToken: account.accessToken,
        body,
        logError: false,
        timeout: MCP_TIMEOUT_MS,
      });
      if (index > 0) {
        progress.operations.splice(index, 1);
        progress.operations.unshift(operation);
      }
      return { ok: true };
    } catch (error: any) {
      const message: string = error?.errorData?.errorMessage ?? error?.message ?? 'unknown';
      if (index === 0) {
        firstError = message;
        locked = LOCKED_ERROR.test(message);
      }
      // A locked offer is locked under every operation; trying the fallback is pointless.
      if (locked) return { ok: false, error: message, locked };
      log.epic.warn(
        { pass: progress.pass.templateId, operation, offers: body.offerItemIdList, errorCode: error?.errorCode, message },
        '[SeasonPasses] Claim rejected',
      );
    }
  }
  return { ok: false, error: firstError, locked };
}

/** Claims what it can for each pass, in the order the game lays them out. */
export async function claimSeasonPassRewards(
  account: { accountId: string; accessToken: string },
  catalog: SeasonPassCatalog,
  { kinds, dryRun = false }: ClaimOptions = {},
): Promise<SeasonPassClaimResult> {
  const profile = await composeMCP({
    profile: 'athena',
    operation: 'QueryProfile',
    accountId: account.accountId,
    accessToken: account.accessToken,
    timeout: MCP_TIMEOUT_MS,
  });
  const items = extractProfileItems(profile);
  const balances = readBalances(items);
  const results: PassClaimResult[] = [];

  for (const pass of catalog.passes) {
    if (kinds && !kinds.has(pass.kind)) continue;

    const progress = readProgress(pass, items);
    const result: PassClaimResult = {
      templateId: pass.templateId,
      kind: pass.kind,
      name: pass.name,
      active: progress !== null,
      premium: progress?.premium ?? false,
      claimed: [],
      rejected: 0,
      remaining: 0,
      errors: [],
    };
    results.push(result);
    if (!progress) continue;

    const blocked = new Set<string>();
    const rejected = new Set<string>();
    // offerId → claimed count when it came back locked; retried only once something new is claimed.
    const lockedAt = new Map<string, number>();
    const skip = (offerId: string) => lockedAt.get(offerId) === progress.claimed.size;
    const errors = new Set<string>();
    const commit = (offer: SeasonPassOffer) => {
      progress.claimed.add(offer.offerId);
      spend(offer, balances);
      result.claimed.push({ offerId: offer.offerId, name: offer.name, cost: offer.cost, currency: offer.currency });
    };

    for (let round = 0; round < MAX_ROUNDS; round++) {
      let progressed = false;

      for (const category of pass.categories) {
        if (blocked.has(category.id)) continue;
        const wave = nextWave(category, progress, balances, skip);
        if (wave.length === 0) continue;

        if ((await sendClaim(account, progress, wave, dryRun)).ok) {
          wave.forEach(commit);
          progressed = true;
          continue;
        }

        // One bad offer fails the whole batch; find the ones that do go through.
        let anyAccepted = false;
        for (const offer of wave) {
          const outcome = await sendClaim(account, progress, [offer], dryRun);
          if (outcome.ok) {
            commit(offer);
            anyAccepted = true;
          } else if (outcome.locked) {
            lockedAt.set(offer.offerId, progress.claimed.size);
          } else {
            rejected.add(offer.offerId);
            errors.add(outcome.error);
          }
        }
        if (anyAccepted) progressed = true;
        else blocked.add(category.id);
      }

      if (!progressed) break;
    }

    result.rejected = [...rejected].filter((id) => !progress.claimed.has(id)).length;
    result.errors = [...errors].slice(0, 3);
    result.remaining = pass.categories
      .flatMap(categoryOffers)
      .filter((o) => !progress.claimed.has(o.offerId) && (o.free || progress.premium)).length;
  }

  return { passes: results, balances: Object.fromEntries(balances) };
}
