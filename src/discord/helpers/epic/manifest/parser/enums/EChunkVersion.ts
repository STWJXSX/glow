// @ts-nocheck
export const EChunkVersion = {
  Invalid: 0,
  Original: 1,
  StoresShaAndHashType: 2,
  StoresDataSizeUncompressed: 3,
  // Always after the latest version, signifies the latest version plus 1 to allow initialization simplicity.
  LatestPlusOne: 4,
  Latest: 3,
  // reverse mapping (value → name), like a numeric TS enum
  0: "Invalid",
  1: "Original",
  2: "StoresShaAndHashType",
  4: "LatestPlusOne",
  3: "Latest",
} as const;
export type EChunkVersion = (typeof EChunkVersion)[Exclude<keyof typeof EChunkVersion, number>];