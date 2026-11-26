// @ts-nocheck
export const EChunkHashFlags = {
  None: 0,
  // Flag for FRollingHash class used, stored in RollingHash on header.
  RollingPoly64: 1,
  // Flag for FSHA1 class used, stored in SHAHash on header.
  Sha1: 2,
  // reverse mapping (value → name), like a numeric TS enum
  0: "None",
  1: "RollingPoly64",
  2: "Sha1",
} as const;
export type EChunkHashFlags = (typeof EChunkHashFlags)[Exclude<keyof typeof EChunkHashFlags, number>];