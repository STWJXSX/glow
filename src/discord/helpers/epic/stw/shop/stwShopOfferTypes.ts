/** STW shop offer shapes returned by glow-core, plus pure display helpers. */

export interface STWShopOffer {
  offerId: string;
  templateId: string;
  quantity: number;
  price: number;
  currencyType: string;
  currencySubType: string;
  dailyLimit: number;
  weeklyLimit: number;
  eventLimit: number;
  purchaseLimitingEventId: string;
  section: string;
}

export interface PurchaseCounts {
  dailyPurchases: Record<string, number>;
  weeklyPurchases: Record<string, number>;
  eventPurchases: Record<string, Record<string, number>>;
}

export interface STWShopData {
  offers: STWShopOffer[];
  gold: number;
  purchaseCounts: PurchaseCounts;
}

export interface PurchaseResult {
  offerId: string;
  templateId: string;
  purchased: number;
  goldSpent: number;
  error?: string;
}

/**
 * Returns how many times an offer can still be purchased.
 * Uses the most restrictive of daily/weekly/event limits.
 */
export function getRemainingPurchases(offer: STWShopOffer): number {
  let remaining = Infinity;
  if (offer.dailyLimit >= 0) remaining = Math.min(remaining, offer.dailyLimit);
  if (offer.weeklyLimit >= 0) remaining = Math.min(remaining, offer.weeklyLimit);
  if (offer.eventLimit >= 0) remaining = Math.min(remaining, offer.eventLimit);
  return remaining === Infinity ? 1 : remaining;
}
