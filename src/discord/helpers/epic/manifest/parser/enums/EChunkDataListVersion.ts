// @ts-nocheck
export const EChunkDataListVersion = {
  Original: 0,
  // Always after the latest version, signifies the latest version plus 1 to allow initialization simplicity.
  LatestPlusOne: 1,
  Latest: 0,
  // reverse mapping (value → name), like a numeric TS enum
  1: "LatestPlusOne",
  0: "Latest",
} as const;
export type EChunkDataListVersion = (typeof EChunkDataListVersion)[Exclude<keyof typeof EChunkDataListVersion, number>];