export interface TaxiBotPublicInfo {
  accountId: string;
  displayName: string;
}

/** Public taxi bot metadata (no device secrets). Keep in sync with taxis.ts devices. */
export const TAXI_BOT_CATALOG: readonly TaxiBotPublicInfo[] = [
  { accountId: 'e17482eb43c14937b257326d78a76a66', displayName: 'GlowTaxi' },
  { accountId: 'a53c7ef891674edeb616bb7d28becd1f', displayName: 'GlowTaxi 1' },
  { accountId: '936787b05569458e944c24e98f405aa9', displayName: 'GlowTaxi 2' },
  { accountId: '9ec0a4e95b75424ca1081abb65125b6d', displayName: 'GlowTaxi 3' },
  { accountId: '4e450d1bff9b4d7d948f0f59a4f17a8c', displayName: 'GlowTaxi 4' },
  { accountId: '5fa5785b0b0d4619938c0c6dfc5c7a44', displayName: 'GlowTaxi 5' },
  { accountId: 'e84b1fddad104ab494828c21f65c4fe3', displayName: 'GlowTaxi 6' },
  { accountId: '8b30c0861c9b4d5e963ded7d937d6bdc', displayName: 'GlowTaxi 7' },
  { accountId: '3efb74f12e6b4654894033a5adf294e1', displayName: 'GlowTaxi 8' },
  { accountId: '9e49c40a02814122aaee1d7ca20dde3d', displayName: 'GlowTaxi 9' },
  { accountId: '4ed0af7ebd344f49b2a616e81c27cdb2', displayName: 'GlowTaxi 10' },
  { accountId: '24e444242fbb47b69bd1bf45c40bd9b5', displayName: 'GlowTaxi 11' },
  { accountId: 'b004fa1d8ce344babc808345eb3fffa9', displayName: 'GlowTaxi 12' },
  { accountId: '3c9ca80d9e9945cf8d7334b925595da9', displayName: 'GlowTaxi 13' },
  { accountId: '3274ab0d727b451ea99b8bb366c25764', displayName: 'GlowTaxi 14' },
  { accountId: '5013a13a509846b09a8c9214a5805bb1', displayName: 'GlowTaxi 15' },
  { accountId: '02bf1ee28b9c4bb2833f8fe99000506f', displayName: 'GlowTaxi 16' },
  { accountId: '0ed537ffa3334196ba0f22af854462ee', displayName: 'GlowTaxi 17' },
];

export function getTaxiBotsForUser(_isPremium?: boolean): TaxiBotPublicInfo[] {
  return [...TAXI_BOT_CATALOG];
}
