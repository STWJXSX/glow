// @ts-nocheck
export const EManifestStorageFlags = {
  // Stored as raw data.
  None: 0,
  // Flag for compressed data.
  Compressed: 1,
  // Flag for encrypted. If also compressed, decrypt first. Encryption will ruin compressibility.
  Encrypted: 2,
  // reverse mapping (value → name), like a numeric TS enum
  0: "None",
  1: "Compressed",
  2: "Encrypted",
} as const;
export type EManifestStorageFlags = (typeof EManifestStorageFlags)[Exclude<keyof typeof EManifestStorageFlags, number>];