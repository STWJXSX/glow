// @ts-nocheck
export const EFileManifestListVersion = {
  Original: 0,
  MimeMD5Hash: 1,
  SHA256Hash: 2,
  // Always after the latest version, signifies the latest version plus 1 to allow initialization simplicity.
  LatestPlusOne: 3,
  Latest: 2,
  // reverse mapping (value → name), like a numeric TS enum
  0: "Original",
  1: "MimeMD5Hash",
  3: "LatestPlusOne",
  2: "Latest",
} as const;
export type EFileManifestListVersion = (typeof EFileManifestListVersion)[Exclude<keyof typeof EFileManifestListVersion, number>];
