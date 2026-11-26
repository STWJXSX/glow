// @ts-nocheck
export const EFeatureLevel = {
  /* The original version. */
  Original: 0,
  /* Support for custom fields. */
  CustomFields: 1,
  /* Started storing the version number. */
  StartStoringVersion: 2,
  /* Made after data files where renamed to include the hash value, these chunks now go to ChunksV2. */
  DataFileRenames: 3,
  /* Manifest stores whether build was constructed with chunk or file data. */
  StoresIfChunkOrFileData: 4,
  /* Manifest stores group number for each chunk/file data for reference so that external readers don't need to know how to calculate them. */
  StoresDataGroupNumbers: 5,
  /* Added support for chunk compression, these chunks now go to ChunksV3. NB: Not File Data Compression yet. */
  ChunkCompressionSupport: 6,
  /* Manifest stores product prerequisites info. */
  StoresPrerequisitesInfo: 7,
  /* Manifest stores chunk download sizes. */
  StoresChunkFileSizes: 8,
  /* Manifest can optionally be stored using UObject serialization and compressed. */
  StoredAsCompressedUClass: 9,
  /* These two features were removed and never used. */
  UNUSED_0: 10,
  UNUSED_1: 11,
  /* Manifest stores chunk data SHA1 hash to use in place of data compare, for faster generation. */
  StoresChunkDataShaHashes: 12,
  /* Manifest stores Prerequisite Ids. */
  StoresPrerequisiteIds: 13,
  /* The first minimal binary format was added. UObject classes will no longer be saved out when binary selected. */
  StoredAsBinaryData: 14,
  /* Temporary level where manifest can reference chunks with dynamic window size, but did not serialize them. Chunks from here onwards are stored in ChunksV4. */
  VariableSizeChunksWithoutWindowSizeChunkInfo: 15,
  /* Manifest can reference chunks with dynamic window size, and also serializes them. */
  VariableSizeChunks: 16,
  /* Manifest uses a build id generated from its metadata. */
  UsesRuntimeGeneratedBuildId: 17,
  /* Manifest uses a build id generated unique at build time, and stored in manifest. */
  UsesBuildTimeGeneratedBuildId: 18,
  /* !! Always after the latest version entry, signifies the latest version plus 1 to allow the following Latest alias. */
  LatestPlusOne: 19,
  /* An alias for the actual latest version value. */
  Latest: 18,
  /* An alias to provide the latest version of a manifest supported by file data (nochunks). */
  LatestNoChunks: 8,
  /* An alias to provide the latest version of a manifest supported by a json serialized format. */
  LatestJson: 13,
  /* An alias to provide the first available version of optimised delta manifest saving. */
  FirstOptimisedDelta: 17,
  /* More aliases, but this time for values that have been renamed */
  StoresUniqueBuildId: 17,
  /* JSON manifests were stored with a version of 255 during a certain CL range due to a bug. */
  /* We will treat this as being StoresChunkFileSizes in code. */
  BrokenJsonVersion: 255,
  /* This is for UObject default, so that we always serialize it. */
  Invalid: -1,
  // reverse mapping (value → name), like a numeric TS enum
  0: "Original",
  1: "CustomFields",
  2: "StartStoringVersion",
  3: "DataFileRenames",
  4: "StoresIfChunkOrFileData",
  5: "StoresDataGroupNumbers",
  6: "ChunkCompressionSupport",
  7: "StoresPrerequisitesInfo",
  9: "StoredAsCompressedUClass",
  10: "UNUSED_0",
  11: "UNUSED_1",
  12: "StoresChunkDataShaHashes",
  14: "StoredAsBinaryData",
  15: "VariableSizeChunksWithoutWindowSizeChunkInfo",
  16: "VariableSizeChunks",
  19: "LatestPlusOne",
  18: "Latest",
  8: "LatestNoChunks",
  13: "LatestJson",
  17: "StoresUniqueBuildId",
  255: "BrokenJsonVersion",
  [-1]: "Invalid",
} as const;
export type EFeatureLevel = (typeof EFeatureLevel)[Exclude<keyof typeof EFeatureLevel, number>];