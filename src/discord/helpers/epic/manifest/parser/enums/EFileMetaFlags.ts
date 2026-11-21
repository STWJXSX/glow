// @ts-nocheck
export const EFileMetaFlags = {
  None: 0,
  // Flag for readonly file.
  ReadOnly: 1,
  // Flag for natively compressed.
  Compressed: 2,
  // Flag for unix executable.
  UnixExecutable: 4,
  // reverse mapping (value → name), like a numeric TS enum
  0: "None",
  1: "ReadOnly",
  2: "Compressed",
  4: "UnixExecutable",
} as const;
export type EFileMetaFlags = (typeof EFileMetaFlags)[Exclude<keyof typeof EFileMetaFlags, number>];