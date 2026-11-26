// @ts-nocheck
export const EChunkLoadResult = {
  None: -1,
  Success: 0,
  // Failed to open the file to load the chunk.
  OpenFileFail: 1,
  // Could not serialize due to wrong archive type.
  BadArchive: 2,
  // The header in the loaded chunk was invalid.
  CorruptHeader: 3,
  // The expected file size in the header did not match the size of the file.
  IncorrectFileSize: 4,
  // The storage type of the chunk is not one which we support.
  UnsupportedStorage: 5,
  // The hash information was missing.
  MissingHashInfo: 6,
  // The serialized data was not successfully understood.
  SerializationError: 7,
  // The data was saved compressed but decompression failed.
  DecompressFailure: 8,
  // The expected data hash in the header did not match the hash of the data.
  HashCheckFailed: 9,
  // The operation was aborted.
  Aborted: 10,
  // reverse mapping (value → name), like a numeric TS enum
  [-1]: "None",
  0: "Success",
  1: "OpenFileFail",
  2: "BadArchive",
  3: "CorruptHeader",
  4: "IncorrectFileSize",
  5: "UnsupportedStorage",
  6: "MissingHashInfo",
  7: "SerializationError",
  8: "DecompressFailure",
  9: "HashCheckFailed",
  10: "Aborted",
} as const;
export type EChunkLoadResult = (typeof EChunkLoadResult)[Exclude<keyof typeof EChunkLoadResult, number>];