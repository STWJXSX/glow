export interface TaxiBotPublicInfo {
  accountId: string;
  displayName: string;
  /** Needs active Premium and the Epic account linked with /login. */
  requiresPremium: boolean;
}

/** Public taxi bot metadata (no device secrets). Keep in sync with glow-core taxiAccounts.ts. */
export const TAXI_BOT_CATALOG: readonly TaxiBotPublicInfo[] = [
  { accountId: 'e17482eb43c14937b257326d78a76a66', displayName: 'GlowTaxi', requiresPremium: false },
  { accountId: 'a53c7ef891674edeb616bb7d28becd1f', displayName: 'GlowTaxi 1', requiresPremium: false },
  { accountId: '936787b05569458e944c24e98f405aa9', displayName: 'GlowTaxi 2', requiresPremium: false },
  { accountId: '9ec0a4e95b75424ca1081abb65125b6d', displayName: 'GlowTaxiPrem 1', requiresPremium: true },
  { accountId: '4e450d1bff9b4d7d948f0f59a4f17a8c', displayName: 'GlowTaxiPrem 2', requiresPremium: true },
  { accountId: '5fa5785b0b0d4619938c0c6dfc5c7a44', displayName: 'GlowTaxiPrem 3', requiresPremium: true },
  { accountId: 'e84b1fddad104ab494828c21f65c4fe3', displayName: 'GlowTaxiPrem 4', requiresPremium: true },
  { accountId: '8b30c0861c9b4d5e963ded7d937d6bdc', displayName: 'GlowTaxiPrem 5', requiresPremium: true },
  { accountId: '3efb74f12e6b4654894033a5adf294e1', displayName: 'GlowTaxiPrem 6', requiresPremium: true },
  { accountId: '9e49c40a02814122aaee1d7ca20dde3d', displayName: 'GlowTaxiPrem 7', requiresPremium: true },
  { accountId: '4ed0af7ebd344f49b2a616e81c27cdb2', displayName: 'GlowTaxiPrem 8', requiresPremium: true },
  { accountId: '24e444242fbb47b69bd1bf45c40bd9b5', displayName: 'GlowTaxiPrem 9', requiresPremium: true },
  { accountId: 'b004fa1d8ce344babc808345eb3fffa9', displayName: 'GlowTaxiPrem 10', requiresPremium: true },
  { accountId: '3c9ca80d9e9945cf8d7334b925595da9', displayName: 'GlowTaxiPrem 11', requiresPremium: true },
  { accountId: '3274ab0d727b451ea99b8bb366c25764', displayName: 'GlowTaxiPrem 12', requiresPremium: true },
  { accountId: '5013a13a509846b09a8c9214a5805bb1', displayName: 'GlowTaxiPrem 13', requiresPremium: true },
  { accountId: '02bf1ee28b9c4bb2833f8fe99000506f', displayName: 'GlowTaxiPrem 14', requiresPremium: true },
  { accountId: '0ed537ffa3334196ba0f22af854462ee', displayName: 'GlowTaxiPrem 15', requiresPremium: true },
];

export function getTaxiBotsForUser(isPremium = false): TaxiBotPublicInfo[] {
  return TAXI_BOT_CATALOG.filter((bot) => !bot.requiresPremium || isPremium);
}
