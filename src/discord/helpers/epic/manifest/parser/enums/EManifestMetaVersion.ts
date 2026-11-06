// @ts-nocheck
export const EManifestMetaVersion = {
  Original: 0,
  SerialisesBuildId: 1,
  hasUninstallCommand: 2,
  // Always after the latest version, signifies the latest version plus 1 to allow initialization simplicity.
  LatestPlusOne: 3,
  Latest: 2,
  // reverse mapping (value → name), like a numeric TS enum
  0: "Original",
  1: "SerialisesBuildId",
  3: "LatestPlusOne",
  2: "Latest",
} as const;
export type EManifestMetaVersion = (typeof EManifestMetaVersion)[Exclude<keyof typeof EManifestMetaVersion, number>];
