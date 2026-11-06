/**
 * Mercadona / V-Bucks sale tiers (€) — escalonado; ratio estable ~3,52 €/K en 12.500+.
 * Coste base: 2,55 € por 1.000 V-Bucks.
 */

export interface VbucksPriceTier {
  vbucks: number;
  saleEur: number;
  baseEur: number;
}

export const VBUCKS_PRICE_TIERS: VbucksPriceTier[] = [
  { vbucks: 800, saleEur: 4.99, baseEur: 2.04 },
  { vbucks: 2400, saleEur: 11.99, baseEur: 6.12 },
  { vbucks: 4500, saleEur: 19.99, baseEur: 11.47 },
  { vbucks: 12500, saleEur: 43.99, baseEur: 31.85 },
];

/** Coste de compra pavos (constante en todos los tramos). */
export const BASE_COST_EUR_PER_1K = 2.55;

/** Precio venta estable a partir del tramo grande (43,99 € / 12,5 K). */
export const STABLE_SALE_EUR_PER_1K = 43.99 / 12.5;

export function formatEuro(amount: number): string {
  return `${amount.toFixed(2).replace('.', ',')} €`;
}

export function baseCostEur(vbucks: number): number {
  if (vbucks <= 0) return 0;
  return Math.round((vbucks / 1000) * BASE_COST_EUR_PER_1K * 100) / 100;
}

export function salePriceEur(vbucks: number): number {
  if (vbucks <= 0) return 0;

  const exact = VBUCKS_PRICE_TIERS.find((p) => p.vbucks === vbucks);
  if (exact) return exact.saleEur;

  const tiers = VBUCKS_PRICE_TIERS;
  const min = tiers[0];
  const max = tiers[tiers.length - 1];

  if (vbucks < min.vbucks) {
    return Math.round((vbucks / min.vbucks) * min.saleEur * 100) / 100;
  }

  if (vbucks > max.vbucks) {
    return Math.round((vbucks / 1000) * STABLE_SALE_EUR_PER_1K * 100) / 100;
  }

  for (let i = 0; i < tiers.length - 1; i++) {
    const a = tiers[i];
    const b = tiers[i + 1];
    if (vbucks >= a.vbucks && vbucks <= b.vbucks) {
      const t = (vbucks - a.vbucks) / (b.vbucks - a.vbucks);
      return Math.round((a.saleEur + t * (b.saleEur - a.saleEur)) * 100) / 100;
    }
  }

  return 0;
}

export function saleEurPer1k(vbucks: number, saleEur: number): number {
  if (vbucks <= 0) return 0;
  return Math.round((saleEur / vbucks) * 1000 * 100) / 100;
}

export interface VbucksQuote {
  vbucks: number;
  saleEur: number;
  baseEur: number;
  grossProfitEur: number;
  netAfterFeeEur: number;
  salePer1k: number;
  basePer1k: number;
  feeEur: number;
  nearestTierLabel: string | null;
}

export function quoteVbucksPurchase(vbucks: number, paymentFeeEur = 0.35): VbucksQuote {
  const saleEur = salePriceEur(vbucks);
  const baseEur = baseCostEur(vbucks);
  const grossProfitEur = Math.round((saleEur - baseEur) * 100) / 100;
  const feeEur = Math.max(0, paymentFeeEur);
  const netAfterFeeEur = Math.round((grossProfitEur - feeEur) * 100) / 100;

  const exact = VBUCKS_PRICE_TIERS.find((p) => p.vbucks === vbucks);
  let nearestTierLabel: string | null = exact ? `Paquete ${exact.vbucks.toLocaleString('es-ES')}` : null;

  if (!nearestTierLabel && vbucks > VBUCKS_PRICE_TIERS[VBUCKS_PRICE_TIERS.length - 1].vbucks) {
    nearestTierLabel = `> ${VBUCKS_PRICE_TIERS[VBUCKS_PRICE_TIERS.length - 1].vbucks.toLocaleString('es-ES')} (ratio estable)`;
  }

  return {
    vbucks,
    saleEur,
    baseEur,
    grossProfitEur,
    netAfterFeeEur,
    salePer1k: saleEurPer1k(vbucks, saleEur),
    basePer1k: BASE_COST_EUR_PER_1K,
    feeEur,
    nearestTierLabel,
  };
}
